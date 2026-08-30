import { loadConfig } from "@lens/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const end = vi.fn();
  return {
    createClient: vi.fn((options) => options),
    drizzle: vi.fn(() => ({})),
    end,
    postgres: vi.fn(() => ({ end })),
  };
});

vi.mock("@clickhouse/client", () => ({ createClient: mocks.createClient }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));
vi.mock("postgres", () => ({ default: mocks.postgres }));

import { createClickHouse, createPostgres } from "../src/index.js";

describe("database connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies configured PostgreSQL pool capacity", () => {
    createPostgres(loadConfig({ POSTGRES_MAX_CONNECTIONS: "4" }));

    expect(mocks.postgres).toHaveBeenCalledWith(expect.any(String), { max: 4 });
  });

  it("only applies enabled ClickHouse resource limits", () => {
    createClickHouse(
      loadConfig({
        CLICKHOUSE_MAX_THREADS: "2",
        CLICKHOUSE_MAX_MEMORY_USAGE_BYTES: "536870912",
        CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY: "268435456",
        CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_SORT: "134217728",
      }),
    );

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clickhouse_settings: expect.objectContaining({
          max_threads: 2,
          max_memory_usage: "536870912",
          max_bytes_before_external_group_by: "268435456",
          max_bytes_before_external_sort: "134217728",
        }),
      }),
    );
  });

  it("leaves ClickHouse limits unset by default", () => {
    createClickHouse(loadConfig({}));

    const options = mocks.createClient.mock.calls[0]?.[0];
    expect(options?.clickhouse_settings).not.toHaveProperty("max_threads");
    expect(options?.clickhouse_settings).not.toHaveProperty("max_memory_usage");
  });
});
