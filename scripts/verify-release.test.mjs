import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { promisify } from "node:util";

for (const runner of ["verify-release", "run-package-integration-tests"]) {
  for (const { signal, stalled, repeated, descendant, phase = "startup" } of [
    { signal: "SIGTERM", stalled: false },
    { signal: "SIGINT", stalled: false },
    { signal: "SIGTERM", stalled: true },
    { signal: "SIGTERM", stalled: true, descendant: true },
    { signal: "SIGTERM", stalled: false, repeated: true },
    ...(runner === "run-package-integration-tests"
      ? [
          { signal: "SIGTERM", stalled: true, phase: "tests" },
          { signal: "SIGINT", stalled: false, repeated: true, phase: "tests" },
        ]
      : []),
  ]) {
    test(
      `${runner}: ${repeated ? "Repeated " : ""}${signal} ${stalled ? "terminates stalled" : "waits for"} ${phase}${descendant ? " descendant" : ""} before cleanup`,
      { timeout: 15_000 },
      async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "lens-release-cancel-test-"));
        const marker = path.join(directory, "resource");
        const started = path.join(directory, "started");
        const events = path.join(directory, "events");
        await writeFile(
          path.join(directory, "docker"),
          `#!/bin/sh
case " $* " in
  *" up "*)
    ${descendant ? 'sh -c \'trap "" TERM;' : ":"}
    ${phase === "startup" ? 'touch "$STARTED"' : ":"}
    ${stalled && phase === "startup" && !descendant ? "trap '' TERM" : ":"}
    sleep ${phase === "tests" ? 0 : descendant ? 9 : stalled ? 30 : 2}
    touch "$MARKER"
    echo up >> "$EVENTS"
    ${descendant ? "' & wait" : ":"}
    ;;
  *" port "*) echo "127.0.0.1:12345" ;;
  *" down "*)
    rm -f "$MARKER"
    echo down >> "$EVENTS"
    ;;
esac
`,
          { mode: 0o700 },
        );
        await writeFile(
          path.join(directory, "pnpm"),
          `#!/bin/sh
case " $* " in
  *" db:migrate "*) echo migrate >> "$EVENTS" ;;
  *)
    ${stalled ? 'sh -c \'trap "" TERM;' : ":"}
    touch "$STARTED"
    sleep ${stalled ? 30 : 2}
    touch "$MARKER"
    echo tests >> "$EVENTS"
    ${stalled ? "' & wait" : ":"}
    ;;
esac
`,
          { mode: 0o700 },
        );
        const child = spawn(process.execPath, [`scripts/${runner}.mjs`, "--coverage"], {
          cwd: new URL("../", import.meta.url),
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            LENS_TEST_VERSION: "cancellation-fixture",
            MARKER: marker,
            STARTED: started,
            EVENTS: events,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.on("data", (data) => {
          output += data;
        });
        const closed = once(child, "close");
        try {
          let ready = false;
          for (let attempt = 0; attempt < 300; attempt++) {
            try {
              await access(started);
              ready = true;
              break;
            } catch {
              await delay(20);
            }
          }
          assert(ready, `Fake startup did not start: ${output}`);
          child.kill(signal);
          if (repeated) {
            await delay(100);
            child.kill(signal);
          }
          const [code] = await closed;
          assert.equal(code, signal === "SIGTERM" ? 143 : 130, output);
          // Give an orphaned startup enough time to recreate resources after parent exit.
          await delay(2_200);
          await assert.rejects(access(marker), { code: "ENOENT" });
          assert.equal(
            await readFile(events, "utf8"),
            phase === "startup"
              ? stalled
                ? "down\n"
                : "up\ndown\n"
              : stalled
                ? "up\nmigrate\ndown\n"
                : "up\nmigrate\ntests\ndown\n",
          );
        } finally {
          if (child.exitCode === null) child.kill("SIGKILL");
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}

test("Integration cleanup failure preserves the original command failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-integration-failure-test-"));
  try {
    await writeFile(
      path.join(directory, "docker"),
      `#!/bin/sh
case " $* " in
  *" up "*) exit 23 ;;
  *" down "*) exit 42 ;;
esac
`,
      { mode: 0o700 },
    );
    await assert.rejects(
      promisify(execFile)(process.execPath, ["scripts/run-package-integration-tests.mjs"], {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        timeout: 5_000,
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Integration test cleanup failed: Error: docker exited with 42/);
        assert.match(error.stderr, /Error: docker exited with 23/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
