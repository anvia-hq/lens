import { spawn } from "node:child_process";
import process from "node:process";

const composeFile = "docker-compose.test.yml";
const project = `lens-package-tests-${process.pid}`;
const compose = ["compose", "-f", composeFile, "-p", project];
const coverage = process.argv.includes("--coverage");
const runningCommands = new Map();
let interrupted = false;
let interruption;

function run(command, args, options = {}) {
  if (interrupted && !options.duringCleanup) {
    return Promise.reject(new Error("Integration tests interrupted"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      // Own the output pipes so 'close' waits for pnpm's descendants as well as its parent.
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!options.duringCleanup) {
      runningCommands.set(
        child,
        new Promise((settled) => {
          child.once("close", () => {
            runningCommands.delete(child);
            settled();
          });
        }),
      );
    }
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      if (options.capture) stdout += chunk;
      else process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function retry(operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (interrupted) throw error;
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

async function publishedPort(service, containerPort) {
  const value = await run("docker", [...compose, "port", service, String(containerPort)], {
    capture: true,
  });
  const match = value.match(/:(\d+)$/);
  if (match?.[1] === undefined) throw new Error(`Could not resolve ${service}:${containerPort}`);
  return match[1];
}

async function settleCommands(timeout) {
  let timer;
  try {
    await Promise.race([
      Promise.all(runningCommands.values()),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopCommands() {
  // Finish in-flight Compose requests before removing resources they could still create.
  await settleCommands(5_000);
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    for (const child of runningCommands.keys()) {
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (signal === "SIGTERM") await settleCommands(2_000);
  }
  // Descendants may hold stdio open after the pnpm/Compose parent exits.
  await Promise.all(runningCommands.values());
}

let cleanup;
function down() {
  cleanup ??= run("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
    duringCleanup: true,
  });
  return cleanup;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    interruption = (async () => {
      await stopCommands();
      await down();
    })()
      .catch((error) => console.error("Integration test cleanup failed:", error))
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

let failure;
try {
  await run("docker", [...compose, "up", "--detach", "--wait"]);
  const [postgresPort, clickhousePort, redisPort] = await Promise.all([
    publishedPort("postgres", 5432),
    publishedPort("clickhouse", 8123),
    publishedPort("redis", 6379),
  ]);
  const env = {
    ...process.env,
    NODE_ENV: "test",
    LENS_INTEGRATION: "1",
    POSTGRES_URL: `postgresql://lens:lens@127.0.0.1:${postgresPort}/lens`,
    CLICKHOUSE_URL: `http://127.0.0.1:${clickhousePort}`,
    CLICKHOUSE_DATABASE: "lens",
    CLICKHOUSE_USERNAME: "lens",
    CLICKHOUSE_PASSWORD: "lens",
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
  };

  await new Promise((resolve) => setTimeout(resolve, 3_000));
  await retry(() => run("pnpm", ["--filter", "@lens/db", "db:migrate"], { env }));
  if (coverage) {
    await run("pnpm", ["--filter", "@lens/db", "--filter", "@lens/queue", "test:coverage"], {
      env,
    });
    // Run the full API suite once so unit and integration tests contribute to the same report.
    // Keep it sequential: OIDC fixtures truncate tables also used by the DB integration suite.
    await run("pnpm", ["--filter", "@lens/api", "test:coverage", "--reporter=verbose"], { env });
  } else {
    await run("pnpm", ["--filter", "@lens/db", "exec", "vitest", "run", "test/integration"], {
      env,
    });
    await run("pnpm", ["--filter", "@lens/queue", "exec", "vitest", "run", "test/integration"], {
      env,
    });
    await run("pnpm", ["--filter", "@lens/api", "exec", "vitest", "run", "test/integration"], {
      env,
    });
  }
  await run("pnpm", ["--filter", "@lens/worker", "exec", "vitest", "run", "test/integration"], {
    env,
  });
} catch (error) {
  failure = error;
} finally {
  if (interruption) await interruption;
  try {
    await stopCommands();
    await down();
  } catch (error) {
    // Preserve the test failure while still making teardown errors visible.
    if (failure) console.error("Integration test cleanup failed:", error);
    else failure = error;
  }
}
if (failure) throw failure;
