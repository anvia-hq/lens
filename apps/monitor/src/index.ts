import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HostCollector } from "./host.js";
import { SnapshotCache } from "./snapshot-cache.js";

const port = positiveInteger(process.env.SYSTEM_MONITOR_PORT, 3100);
const collector = new HostCollector({
  proc: process.env.HOST_PROC_PATH || "/host/proc",
  root: {
    path: process.env.HOST_ROOT_PATH || "/host/root",
    displayPath: "/",
    name: "Root disk",
  },
  additionalDisks: process.env.HOST_DATA_PATH
    ? [
        {
          path: process.env.HOST_DATA_PATH,
          displayPath: process.env.HOST_DATA_DISPLAY_PATH || "/var/lib/docker",
          name: "Docker data",
        },
      ]
    : [],
});
const snapshots = new SnapshotCache(collector);
void snapshots.collect();
const collectionTimer = setInterval(() => void snapshots.collect(), 5_000);
collectionTimer.unref();

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    logError("Monitor request failed", error);
    if (!response.headersSent) {
      response
        .writeHead(500, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ status: "error", message: "Internal monitor error" }));
    } else if (!response.writableEnded) {
      response.end();
    }
  });
});
server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.keepAliveTimeout = 5_000;

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
      if (snapshots.error() !== undefined) {
        logError("Host metrics collection failed", snapshots.error());
      }
      response
        .writeHead(503)
        .end(JSON.stringify({ status: "unavailable", message: "Host metrics are unavailable" }));
    } else {
      response.writeHead(200).end(JSON.stringify(snapshot));
    }
    return;
  }
  response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
}

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Lens system monitor listening on port ${port}\n`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(collectionTimer);
    const timer = setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 5_000);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function logError(context: string, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${context}: ${detail}\n`);
}
