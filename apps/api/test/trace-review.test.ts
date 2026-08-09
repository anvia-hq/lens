import type { TraceDetail } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { traceReviewResult } from "../src/modules/traces/review.js";

describe("trace review", () => {
  it("creates a stable human evaluation that can replace an earlier review", () => {
    const result = traceReviewResult({
      projectId: "11111111-1111-4111-8111-111111111111",
      trace: {
        summary: {
          traceId: "a".repeat(32),
          startedAt: "2026-08-09T00:00:00.000Z",
          serviceName: "support-agent",
          environment: "production",
          release: "v2",
        },
      } as TraceDetail,
      expiresAt: "2026-09-09T00:00:00.000Z",
      input: { outcome: "fail", explanation: "Wrong policy" },
      reviewer: { id: "user-1", name: "Ada" },
      now: new Date("2026-08-09T01:00:00.000Z"),
    });

    expect(result).toMatchObject({
      id: `review:${"a".repeat(32)}`,
      metricName: "human-review",
      outcome: "fail",
      numericValue: 0,
      explanation: "Wrong policy",
      source: "human",
      reviewer: { id: "user-1", name: "Ada" },
      expiresAt: "2026-09-09T00:00:00.000Z",
    });
  });
});
