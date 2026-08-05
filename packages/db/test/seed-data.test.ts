import { describe, expect, it } from "vitest";
import { buildSeedTelemetry } from "../src/seed-data.js";

describe("realistic seed telemetry", () => {
  it("builds deterministic, connected traces across the last 30 days", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const first = buildSeedTelemetry("11111111-1111-4111-8111-111111111111", now);
    const second = buildSeedTelemetry("11111111-1111-4111-8111-111111111111", now);

    expect(first).toEqual(second);
    expect(first.traceIds).toHaveLength(160);
    expect(first.spans).toHaveLength(1_120);
    expect(new Set(first.traceIds)).toHaveLength(160);
    expect(first.spans.filter((span) => span.parentSpanId === null)).toHaveLength(160);
    const oneDayAgo = BigInt(now.getTime() - 86_400_000) * 1_000_000n;
    expect(
      first.spans.filter(
        (span) => span.parentSpanId === null && BigInt(span.startTimeUnixNano) >= oneDayAgo,
      ),
    ).toHaveLength(64);
    expect(first.spans.some((span) => span.status === "error")).toBe(true);
    expect(first.spans.every((span) => span.startTimeUnixNano < span.endTimeUnixNano)).toBe(true);
  });
});
