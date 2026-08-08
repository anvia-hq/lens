import { spawn } from "node:child_process";

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", [script], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm ${script} exited with ${code ?? signal}`));
    });
  });
}

for (const script of [
  "check",
  "typecheck",
  "build",
  "test:coverage",
  "check:bundle",
  "audit:prod",
]) {
  await run(script);
}
