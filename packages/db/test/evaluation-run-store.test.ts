import type { EvaluationResult } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { groupRunCases } from "../src/evaluation-run-store.js";

describe("evaluation run cases", () => {
  it("groups metric results by case and uses failure-first outcome precedence", () => {
    const cases = groupRunCases([
      evaluation({ id: "quality", metricName: "quality", outcome: "pass" }),
      evaluation({ id: "safety", metricName: "safety", outcome: "fail" }),
    ]);

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseId: "case-1",
      outcome: "fail",
      traceId: "1234567890abcdef1234567890abcdef",
      payloadStatus: "captured",
      payloadConsistent: true,
      results: [{ metricName: "quality" }, { metricName: "safety" }],
    });
  });

  it("detects inconsistent payloads reported by metrics for the same case", () => {
    const cases = groupRunCases([
      evaluation({ id: "one" }),
      evaluation({ id: "two", payload: { input: "changed" } }),
    ]);

    expect(cases[0]?.payloadConsistent).toBe(false);
  });
});

function evaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    id: "result-1",
    runId: "run-1",
    timestamp: "2026-08-07T00:00:00.000Z",
    traceId: "1234567890abcdef1234567890abcdef",
    observationId: "1234567890abcdef",
    responseId: null,
    suiteName: "support",
    caseId: "case-1",
    metricName: "quality",
    outcome: "pass",
    dataType: "BOOLEAN",
    numericValue: 1,
    categoricalValue: null,
    explanation: "Looks good",
    payload: { input: "question", expected: "answer", output: "answer" },
    payloadStatus: "captured",
    configId: null,
    serviceName: "test",
    environment: "test",
    release: null,
    metadata: {},
    expiresAt: null,
    ingestedAt: "2026-08-07T00:00:00.000Z",
    ingestVersion: "1",
    ...overrides,
  };
}
