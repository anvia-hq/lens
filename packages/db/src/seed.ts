import { runSeed } from "./seed-runner.js";

try {
  await runSeed();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
