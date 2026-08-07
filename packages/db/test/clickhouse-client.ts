import type { ClickHouseClient } from "@clickhouse/client";

export function clickHouseClient(methods: {
  command?: unknown;
  insert?: unknown;
  query?: unknown;
}): ClickHouseClient {
  return methods as unknown as ClickHouseClient;
}
