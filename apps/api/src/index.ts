import { serve } from "@hono/node-server";
import { loadConfig } from "@lens/config";
import { createClickHouse, createPostgres } from "@lens/db";
import { createQueues, createRedisConnection } from "@lens/queue";
import pino from "pino";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL, name: "lens-api" });
const postgres = createPostgres(config);
const clickhouse = createClickHouse(config);
const redis = createRedisConnection(config.REDIS_URL);
const queues = createQueues(config.REDIS_URL);
const auth = createAuth(postgres.db, config);
const app = createApp({ config, postgres, clickhouse, redis, queues, auth });

const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info({ port: info.port }, "Anvia Lens API started");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  redis.disconnect();
  await queues.close();
  await Promise.all([clickhouse.close(), postgres.close()]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}

export { app };
