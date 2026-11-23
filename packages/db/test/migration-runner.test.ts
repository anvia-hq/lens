import { describe, expect, it, vi } from "vitest";
import { isTransientMigrationError, retryTransient } from "../src/migration-runner.js";

describe("migration startup retry helpers", () => {
  it("classifies socket, startup, and nested cause errors as transient", () => {
    const connRefused = Object.assign(new Error("connect ECONNREFUSED 192.168.148.2:8123"), {
      code: "ECONNREFUSED",
    });
    const pgStarting = Object.assign(new Error("the database system is starting up"), {
      code: "57P03",
    });
    const wrapped = new Error("ClickHouse command failed", { cause: connRefused });
    const aggregate = new AggregateError([connRefused], "All connection attempts failed");

    expect(isTransientMigrationError(connRefused)).toBe(true);
    expect(isTransientMigrationError(pgStarting)).toBe(true);
    expect(isTransientMigrationError(wrapped)).toBe(true);
    expect(isTransientMigrationError(aggregate)).toBe(true);
    expect(isTransientMigrationError(new Error("Database lens does not exist"))).toBe(true);
  });

  it("does not treat authentication, config, or SQL errors as transient", () => {
    const pgAuth = Object.assign(new Error("password authentication failed"), { code: "28P01" });
    const sqlSyntax = Object.assign(new Error("syntax error at or near"), { code: "42601" });
    const alertKey = new Error('Invalid LENS_ALERT_SECRET_KEY: expected "kid:base64-key"');

    expect(isTransientMigrationError(pgAuth)).toBe(false);
    expect(isTransientMigrationError(sqlSyntax)).toBe(false);
    expect(isTransientMigrationError(alertKey)).toBe(false);
    expect(isTransientMigrationError(null)).toBe(false);
  });

  it("retries transient errors with capped exponential backoff until success", async () => {
    const transient = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8123"), {
      code: "ECONNREFUSED",
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce("ok");
    const delays: number[] = [];
    const onRetry = vi.fn();

    const result = await retryTransient(operation, {
      maxAttempts: 5,
      initialDelayMs: 500,
      maxDelayMs: 1_500,
      sleep: async (ms) => {
        delays.push(ms);
      },
      onRetry,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([500, 1_000, 1_500]);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on non-transient errors without sleeping", async () => {
    const authError = Object.assign(new Error("password authentication failed"), { code: "28P01" });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(authError);
    const sleep = vi.fn(async () => undefined);

    await expect(retryTransient(operation, { maxAttempts: 5, sleep })).rejects.toThrow(
      "password authentication failed",
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rethrows after exhausting maxAttempts on persistent transient errors", async () => {
    const transient = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(transient);
    const sleep = vi.fn(async () => undefined);

    await expect(
      retryTransient(operation, { maxAttempts: 3, initialDelayMs: 10, sleep }),
    ).rejects.toThrow("connect ECONNREFUSED");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
