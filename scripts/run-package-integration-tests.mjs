import { spawn } from "node:child_process";
import process from "node:process";

const composeFile = "docker-compose.test.yml";
const project = `lens-package-tests-${process.pid}`;
const compose = ["compose", "-f", composeFile, "-p", project];
const coverage = process.argv.includes("--coverage");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
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

let stopping = false;
async function down() {
  if (stopping) return;
  stopping = true;
  await run("docker", [...compose, "down", "--volumes", "--remove-orphans"]).catch(() => {});
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void down().finally(() => process.exit(128 + (signal === "SIGINT" ? 2 : 15)));
  });
}

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
} finally {
  await down();
}
