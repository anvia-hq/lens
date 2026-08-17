import { createServer } from "node:http";
import { HostCollector } from "./host.js";
import { SnapshotCache } from "./snapshot-cache.js";

const port = positiveInteger(process.env.SYSTEM_MONITOR_PORT, 3100);
const collector = new HostCollector({
  proc: process.env.HOST_PROC_PATH || "/host/proc",
  root: process.env.HOST_ROOT_PATH || "/host/root",
});
const snapshots = new SnapshotCache(collector);
void snapshots.collect();
const collectionTimer = setInterval(() => void snapshots.collect(), 5_000);
collectionTimer.unref();

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET" && request.url === "/health/live") {
    response.writeHead(200).end(JSON.stringify({ status: "live" }));
    return;
  }
  if (request.method === "GET" && request.url === "/snapshot") {
    if (snapshots.latest() === undefined) await snapshots.collect();
    const snapshot = snapshots.latest();
    if (snapshot === undefined) {
      response
        .writeHead(503)
        .end(JSON.stringify({ status: "unavailable", message: errorMessage(snapshots.error()) }));
    } else {
      response.writeHead(200).end(JSON.stringify(snapshot));
    }
    return;
  }
  response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Lens system monitor listening on port ${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(collectionTimer);
    server.close(() => process.exit(0));
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Host metrics are unavailable";
}
