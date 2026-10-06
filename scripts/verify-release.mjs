import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Fixture, until } from "./release-fixture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const recovery = process.argv.includes("--recovery");
const controls = process.argv.includes("--negative-controls");
const candidate = process.env.LENS_TEST_VERSION;
const previous = process.env.LENS_TEST_PREVIOUS_VERSION;
assert(candidate && candidate !== "latest", "Set LENS_TEST_VERSION to a pinned candidate tag");
if (recovery)
  assert(
    previous && previous !== candidate && previous !== "latest",
    "Set a different pinned LENS_TEST_PREVIOUS_VERSION",
  );
const id = `lens-release-test-${process.pid}-${randomBytes(4).toString("hex")}`;
const backup = await mkdtemp(path.join(tmpdir(), "lens-release-backup-"));
const env = {
  ...process.env,
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  CLICKHOUSE_PASSWORD: randomBytes(24).toString("hex"),
  REDIS_PASSWORD: randomBytes(24).toString("hex"),
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  INGESTION_KEY_PEPPER: randomBytes(32).toString("hex"),
  PUBLIC_APP_URL: "http://127.0.0.1:3001",
  WEB_ORIGIN: "http://127.0.0.1:3001",
  WEB_PORT: "127.0.0.1:",
  LENS_PULL_POLICY: process.env.LENS_TEST_PULL_POLICY ?? "missing",
  SMTP_HOST: "",
  MATERIALIZE_DELAY_MS: "100",
  PASSWORD_LOGIN_ENABLED: "true",
  OIDC_ENABLED: "false",
};
const projects = new Set();
function run(args, { capture = false, input, command = "docker", duringCleanup = false } = {}) {
  if (interrupted && !duringCleanup) return Promise.reject(new Error("Release test interrupted"));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: [input ? "pipe" : "ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    if (input) child.stdin.end(input);
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${command} ${args[0]} exited ${code ?? signal}`)),
    );
  });
}
function compose(project, ...args) {
  projects.add(project);
  return run(
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-f",
      "docker-compose.release-test.yml",
      "-p",
      project,
      ...args,
    ],
    { duringCleanup: args[0] === "down" },
  );
}
function image(version, old = false) {
  env.LENS_VERSION = version;
  env.LENS_BACKEND_IMAGE = old
    ? (process.env.LENS_TEST_PREVIOUS_BACKEND_IMAGE ?? "ghcr.io/anvia-hq/lens")
    : (process.env.LENS_TEST_BACKEND_IMAGE ?? "ghcr.io/anvia-hq/lens");
  env.LENS_WEB_IMAGE = old
    ? (process.env.LENS_TEST_PREVIOUS_WEB_IMAGE ?? "ghcr.io/anvia-hq/lens-web")
    : (process.env.LENS_TEST_WEB_IMAGE ?? "ghcr.io/anvia-hq/lens-web");
}
async function endpoint(project, service, port) {
  const value = await run(
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-f",
      "docker-compose.release-test.yml",
      "-p",
      project,
      "port",
      service,
      String(port),
    ],
    { capture: true },
  );
  assert(/^127\.0\.0\.1:\d+$/.test(value), `Expected isolated localhost port: ${value}`);
  return `http://${value}`;
}
async function ready(project) {
  const url = await endpoint(project, "api", 3001);
  const web = await endpoint(project, "web", 8080);
  await until(
    "Dependency readiness and web",
    async () => {
      for (const target of [`${url}/health/ready`, `${url}/health/live`, `${web}/`]) {
        const response = await fetch(target, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return false;
        await response.arrayBuffer();
      }
      return true;
    },
    180_000,
  );
  for (const repository of [env.LENS_BACKEND_IMAGE, env.LENS_WEB_IMAGE]) {
    await run([
      "image",
      "inspect",
      `${repository}:${env.LENS_VERSION}`,
      "--format",
      "{{.Id}} {{json .RepoDigests}}",
    ]);
  }
  return url;
}
async function queue(project, code) {
  return run(
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-f",
      "docker-compose.release-test.yml",
      "-p",
      project,
      "exec",
      "-T",
      "api",
      "node",
      "--input-type=module",
    ],
    {
      input: `import assert from 'node:assert/strict';
import { createQueues } from '/workspace/packages/queue/dist/index.js';
const queues = createQueues(process.env.REDIS_URL);
try { ${code} } finally { await queues.close(); }`,
    },
  );
}
async function clickhouse(project, sql) {
  await compose(
    project,
    "exec",
    "-T",
    "clickhouse",
    "clickhouse-client",
    "--user",
    "lens",
    "--password",
    env.CLICKHOUSE_PASSWORD,
    "--database",
    "lens",
    "--query",
    sql,
  );
}
async function negativeControls(project, fixture) {
  await compose(project, "stop", "worker");
  const pending = await fixture.submit();
  await ready(project);
  await assert.rejects(() => fixture.verify(pending, 3_000), /timed out/);
  await queue(
    project,
    "assert((await queues.ingest.getWaitingCount()) > 0); assert((await queues.evaluations.getWaitingCount()) > 0);",
  );
  console.log("PASS: stopped worker leaves accepted data unreadable despite readiness");
  await compose(project, "up", "-d", "worker");
  await fixture.verify(pending);
  await clickhouse(project, "ALTER TABLE trace_summaries ADD CONSTRAINT release_failure CHECK 0");
  const broken = await fixture.submit();
  await ready(project);
  await assert.rejects(() => fixture.verify(broken, 3_000), /timed out/);
  await until("Materialization failure visible in System Health", async () => {
    const health = await fixture.request("/api/v1/system/health");
    return health.queues.some((item) => item.name === "Trace materialization" && item.failed > 0);
  });
  console.log(
    "PASS: broken materialization fails functional check; failed job visible despite readiness",
  );
  await clickhouse(project, "ALTER TABLE trace_summaries DROP CONSTRAINT release_failure");
  await queue(
    project,
    "const jobs = await queues.materialize.getFailed(0, 100); assert(jobs.length > 0); for (const job of jobs) await job.retry();",
  );
  await fixture.verify(broken);
  const recovered = await fixture.request("/api/v1/system/health");
  assert(
    recovered.queues.every((item) => item.failed === 0),
    "Failed jobs remain after recovery",
  );
  console.log("PASS: targeted failed-job replay restores readable summary");
}
async function cleanup() {
  const failures = [];
  for (const project of projects) {
    try {
      await compose(project, "down", "--volumes", "--remove-orphans");
    } catch (error) {
      failures.push(new Error(`Cleanup failed: ${project}`, { cause: error }));
    }
  }
  await rm(backup, { recursive: true, force: true });
  if (failures.length) throw new AggregateError(failures, "Release test cleanup failed");
}
let interrupted = false;
let interruption;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    interruption = cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
try {
  image(candidate);
  const fresh = `${id}-fresh`;
  await compose(fresh, "up", "-d");
  const fixture = new Fixture(await ready(fresh));
  await fixture.initialize();
  const trace = await fixture.submit();
  await fixture.verify(trace);
  console.log(
    "PASS: fresh candidate credentials, OTLP traces and evaluations, materialized query, web",
  );
  if (controls) await negativeControls(fresh, fixture);
  await compose(fresh, "down", "--volumes", "--remove-orphans");
  projects.delete(fresh);
  if (recovery) {
    image(previous, true);
    const source = `${id}-upgrade`;
    await compose(source, "up", "-d");
    const historical = new Fixture(await ready(source));
    await historical.initialize();
    const oldTrace = await historical.submit();
    await historical.verify(oldTrace);
    await compose(source, "stop", "worker");
    const queuedTrace = await historical.submit();
    await queue(
      source,
      "assert((await queues.ingest.getWaitingCount()) > 0); assert((await queues.evaluations.getWaitingCount()) > 0);",
    );
    // Quiesce every writer, then cleanly stop engines. The three cold volumes form one recovery set.
    await compose(source, "stop");
    for (const volume of ["postgres", "clickhouse", "redis"]) {
      await run([
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${source}_lens-${volume}:/source:ro`,
        "-v",
        `${backup}:/backup`,
        "alpine:3.22",
        "sh",
        "-c",
        `cd /source && tar czf /backup/${volume}.tgz .`,
      ]);
    }
    image(candidate);
    const upgradeStart = Date.now();
    await compose(source, "up", "-d", "--force-recreate");
    historical.url = await ready(source);
    await historical.signIn();
    await historical.verify(oldTrace);
    await historical.verify(queuedTrace);
    await historical.verify(await historical.submit());
    console.log(
      `PASS: ${previous} -> ${candidate} upgrade preserves history, account, project/key and queued traces/evaluations (${Date.now() - upgradeStart}ms)`,
    );
    await compose(source, "down", "--volumes", "--remove-orphans");
    projects.delete(source);
    const restored = `${id}-restore`;
    const restoreStart = Date.now();
    await compose(restored, "create");
    for (const volume of ["postgres", "clickhouse", "redis"]) {
      await run([
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${restored}_lens-${volume}:/target`,
        "-v",
        `${backup}:/backup:ro`,
        "alpine:3.22",
        "sh",
        "-c",
        `cd /target && tar xzf /backup/${volume}.tgz`,
      ]);
    }
    await compose(restored, "up", "-d");
    historical.url = await ready(restored);
    await historical.signIn();
    await historical.verify(oldTrace);
    await historical.verify(queuedTrace);
    await historical.verify(await historical.submit());
    console.log(
      `PASS: coordinated restore into new volumes preserves history, access/key and pending work (${Date.now() - restoreStart}ms)`,
    );
  }
} catch (error) {
  if (interruption) await interruption;
  for (const project of projects) {
    await compose(project, "ps", "--all").catch(() => {});
    // Logs contain only fixtures, but avoid dumping ingestion credentials or database URLs.
    await compose(project, "logs", "--no-color", "--tail=30", "worker", "migrate").catch(() => {});
  }
  throw error;
} finally {
  if (!interrupted) await cleanup();
}
