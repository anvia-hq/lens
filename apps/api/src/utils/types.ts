import type { ClickHouseClient } from "@clickhouse/client";
import type { LensConfig } from "@lens/config";
import type { PostgresConnection } from "@lens/db";
import type { LensQueues } from "@lens/queue";
import type IORedis from "ioredis";
import type { Logger } from "pino";
import type { LensAuth } from "../modules/auth/services.js";

export type SessionValue = Awaited<ReturnType<LensAuth["api"]["getSession"]>>;
export type SessionUser = NonNullable<SessionValue>["user"];

export type AppEnv = {
  Variables: {
    requestId: string;
    session: SessionValue;
  };
};

export type ApiDependencies = {
  config: LensConfig;
  postgres: PostgresConnection;
  clickhouse: ClickHouseClient;
  redis: IORedis;
  queues: LensQueues;
  auth: LensAuth;
  logger: Logger;
};
