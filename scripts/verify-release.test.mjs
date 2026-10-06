import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

for (const { signal, stalled, repeated } of [
  { signal: "SIGTERM", stalled: false },
  { signal: "SIGINT", stalled: false },
  { signal: "SIGTERM", stalled: true },
  { signal: "SIGTERM", stalled: false, repeated: true },
]) {
  test(
    `${repeated ? "Repeated " : ""}${signal} ${stalled ? "terminates stalled startup" : "waits for startup"} before cleanup`,
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
    touch "$STARTED"
    ${stalled ? "trap '' TERM" : ":"}
    sleep ${stalled ? 30 : 2}
    touch "$MARKER"
    echo up >> "$EVENTS"
    ;;
  *" down "*)
    rm -f "$MARKER"
    echo down >> "$EVENTS"
    ;;
esac
`,
        { mode: 0o700 },
      );
      const child = spawn(process.execPath, ["scripts/verify-release.mjs"], {
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
        for (let attempt = 0; attempt < 100; attempt++) {
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
        assert.equal(await readFile(events, "utf8"), stalled ? "down\n" : "up\ndown\n");
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
