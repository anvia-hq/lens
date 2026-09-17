import IORedis, { type RedisOptions } from "ioredis";

export function createRedisConnection(redisUrl: string, options: RedisOptions = {}): IORedis {
  return new IORedis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    ...options,
  });
}
