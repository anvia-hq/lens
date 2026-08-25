import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const webDist = new URL("../apps/web/dist/", import.meta.url);
const manifestPath = new URL(".vite/manifest.json", webDist);
const initialGzipBudget = 250 * 1024;
const chunkBudget = 500 * 1024;
const graphLayoutWorkerBudget = 2 * 1024 * 1024;
const graphLayoutWorkerPrefixes = ["trace-graph-layout.worker-", "elk-worker.min-"];

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry = Object.values(manifest).find((item) => item.isEntry);

if (!entry) {
  throw new Error(`No entry was found in ${manifestPath.pathname}`);
}

const manifestByFile = new Map(
  Object.entries(manifest).map(([key, item]) => [key, { key, ...item }]),
);
const initialFiles = new Set();

function collectInitialFiles(item) {
  if (initialFiles.has(item.file)) return;
  initialFiles.add(item.file);

  for (const importedKey of item.imports ?? []) {
    const imported = manifestByFile.get(importedKey);
    if (!imported) {
      throw new Error(`Manifest import ${importedKey} is missing`);
    }
    collectInitialFiles(imported);
  }
}

collectInitialFiles(entry);

let initialGzipBytes = 0;
for (const file of initialFiles) {
  initialGzipBytes += gzipSync(await readFile(new URL(file, webDist))).byteLength;
}

const assetDirectory = new URL("assets/", webDist);
const oversizedChunks = [];
const oversizedGraphWorkers = [];
for (const file of await readdir(assetDirectory)) {
  if (!file.endsWith(".js")) continue;
  const size = (await stat(join(assetDirectory.pathname, file))).size;
  if (graphLayoutWorkerPrefixes.some((prefix) => file.startsWith(prefix))) {
    if (size > graphLayoutWorkerBudget) oversizedGraphWorkers.push({ file, size });
  } else if (size > chunkBudget) {
    oversizedChunks.push({ file, size });
  }
}

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log(
  `Initial JavaScript: ${formatKiB(initialGzipBytes)} gzip across ${initialFiles.size} files`,
);
console.log(`Largest allowed JavaScript chunk: ${formatKiB(chunkBudget)} minified`);
console.log(`Largest allowed trace graph worker: ${formatKiB(graphLayoutWorkerBudget)} minified`);

const failures = [];
if (initialGzipBytes > initialGzipBudget) {
  failures.push(
    `initial JavaScript is ${formatKiB(initialGzipBytes)} gzip (budget: ${formatKiB(initialGzipBudget)})`,
  );
}
if (oversizedChunks.length > 0) {
  failures.push(
    `oversized chunks: ${oversizedChunks
      .map(({ file, size }) => `${file} (${formatKiB(size)})`)
      .join(", ")}`,
  );
}
if (oversizedGraphWorkers.length > 0) {
  failures.push(
    `oversized trace graph workers: ${oversizedGraphWorkers
      .map(({ file, size }) => `${file} (${formatKiB(size)})`)
      .join(", ")}`,
  );
}

if (failures.length > 0) {
  throw new Error(`Web bundle budget exceeded: ${failures.join("; ")}`);
}
