#!/usr/bin/env node
// Records proof of a web UI change: a video of the flow plus screenshots.
//
//   node .aven/record-proof.mjs <flow.mjs> [outDir]
//
// <flow.mjs> default-exports `async ({ page, shot, login }) => { ... }`:
//   page  - a Playwright page at 1280x800, base URL http://localhost:3000
//   shot  - await shot("name") saves <outDir>/<name>.png
//   login - await login() signs in as the seeded demo user (pnpm db:seed)
// The video is saved as <outDir>/flow.webm. outDir defaults to .aven/proof.
// Playwright lives outside the repository; .aven/setup installs it.
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tools = join(homedir(), ".local/share/lens-proof");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(tools, "browsers");
const { chromium } = await import(
  pathToFileURL(join(tools, "node_modules/playwright/index.mjs")).href
);

const [flowPath, outArg] = process.argv.slice(2);
if (!flowPath) {
  console.error("usage: node .aven/record-proof.mjs <flow.mjs> [outDir]");
  process.exit(2);
}
const outDir = resolve(outArg ?? ".aven/proof");
const videoTmp = join(outDir, ".video-tmp");
await mkdir(videoTmp, { recursive: true });

const flow = (await import(pathToFileURL(resolve(flowPath)).href)).default;
const size = { width: 1280, height: 800 };
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: process.env.LENS_WEB_URL ?? "http://localhost:3000",
  viewport: size,
  recordVideo: { dir: videoTmp, size },
});
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
const login = async () => {
  await page.goto("/");
  await page.locator("#auth-email").fill("demo@lens.local");
  await page.locator("#auth-password").fill("LensDemo2026!");
  await page.locator('form button[type="submit"]').click();
  await page.locator("#auth-password").waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
};

let failed;
try {
  await flow({ page, shot, login });
} catch (error) {
  failed = error;
  await shot("error").catch(() => {});
} finally {
  await context.close();
  await browser.close();
}
const [video] = (await readdir(videoTmp)).filter((name) => name.endsWith(".webm"));
if (video) await rename(join(videoTmp, video), join(outDir, "flow.webm"));
await rm(videoTmp, { recursive: true, force: true });
if (failed) {
  console.error(failed);
  process.exit(1);
}
console.log(`proof saved in ${outDir}`);
