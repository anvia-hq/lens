import { serve } from "@hono/node-server";
import { loadConfig } from "@lens/config";
import { createClickHouse, createPostgres } from "@lens/db";
import { createQueues, createRedisConnection } from "@lens/queue";
import pino from "pino";
import { createApp } from "./app.js";
import { createAuth } from "./modules/auth/services.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL, name: "lens-api" });
const postgres = createPostgres(config);
const clickhouse = createClickHouse(config);
const redis = createRedisConnection(config.REDIS_URL);
const queueRetention = {
  completedAgeSeconds: config.QUEUE_RETAIN_COMPLETED_AGE_SECONDS,
  completedCount: config.QUEUE_RETAIN_COMPLETED_COUNT,
  failedAgeSeconds: config.QUEUE_RETAIN_FAILED_AGE_SECONDS,
  failedCount: config.QUEUE_RETAIN_FAILED_COUNT,
};
const queues = createQueues(config.REDIS_URL, {}, queueRetention);
const systemHealthRedis = createRedisConnection(config.REDIS_URL, {
  commandTimeout: 2_500,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
const systemHealthQueues = createQueues(
  config.REDIS_URL,
  {
    commandTimeout: 2_500,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  },
  queueRetention,
);
const auth = createAuth(postgres.db, config);
const app = createApp({
  config,
  postgres,
  clickhouse,
  redis,
  queues,
  systemHealthRedis,
  systemHealthQueues,
  auth,
  logger,
});

const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info({ port: info.port }, "Anvia Lens API started");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  redis.disconnect();
  systemHealthRedis.disconnect();
  await queues.close();
  await systemHealthQueues.close();
  await Promise.all([clickhouse.close(), postgres.close()]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}

export { app };
