import { describe, expect, it } from "vitest";
import { decodeOtlpLogsRequest, normalizeOtlpLogsRequest } from "../src/index.js";

const traceId = "00112233445566778899aabbccddeeff";
const spanId = "0011223344556677";
const projectId = "00000000-0000-0000-0000-000000000001";
const now = new Date("2026-08-07T00:00:00.000Z");

function attribute(key: string, value: unknown) {
  return { key, value };
}

function decodeRecords(records: unknown[]) {
  return decodeOtlpLogsRequest(
    new TextEncoder().encode(
      JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [
                attribute("service.name", { stringValue: "support-service" }),
                attribute("deployment.environment.name", { stringValue: "production" }),
                attribute("langfuse.release", { stringValue: "2026.08.07" }),
              ],
            },
            scopeLogs: [{ logRecords: records }],
          },
        ],
      }),
    ),
    "application/json",
  );
}

describe("evaluation normalization", () => {
  it("dispatches evaluation, run, and ignored log records", () => {
    const request = decodeRecords([
      {
        timeUnixNano: "1786089599000000000",
        eventName: "anvia.eval.run.started",
        attributes: [
          attribute("anvia.eval.run.id", { stringValue: "run-1" }),
          attribute("anvia.eval.suite.name", { stringValue: "release-gate" }),
          attribute("anvia.eval.run.case_count", { intValue: "1" }),
        ],
      },
      {
        timeUnixNano: "1786089600000000000",
        eventName: "gen_ai.evaluation.result",
        traceId,
        spanId,
        attributes: [
          attribute("gen_ai.evaluation.name", { stringValue: "correctness" }),
          attribute("gen_ai.evaluation.score.value", { doubleValue: 0.93 }),
          attribute("anvia.eval.outcome", { stringValue: "pass" }),
          attribute("anvia.eval.data_type", { stringValue: "NUMERIC" }),
          attribute("anvia.eval.source", { stringValue: "end_user" }),
          attribute("anvia.eval.suite.name", { stringValue: "release-gate" }),
          attribute("anvia.eval.run.id", { stringValue: "run-1" }),
          attribute("anvia.eval.payload", {
            stringValue: '{"input":{"question":"hello","password":"hidden"},"expected":"answer"}',
          }),
          attribute("anvia.eval.payload.status", { stringValue: "captured" }),
          attribute("anvia.eval.case.metadata", { stringValue: "visible" }),
        ],
      },
      {
        timeUnixNano: "1786089601000000000",
        eventName: "anvia.eval.run.finished",
        attributes: [
          attribute("anvia.eval.run.id", { stringValue: "run-1" }),
          attribute("anvia.eval.run.status", { stringValue: "completed" }),
          attribute("anvia.eval.suite.name", { stringValue: "release-gate" }),
          attribute("anvia.eval.run.passed", { intValue: "1" }),
        ],
      },
      { eventName: "application.log" },
    ]);

    const result = normalizeOtlpLogsRequest(request, {
      projectId,
      retentionDays: 30,
      now,
    });

    expect(result).toMatchObject({ rejectedLogRecords: 0, ignoredLogRecords: 1 });
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]).toMatchObject({
      runId: "run-1",
      traceId,
      observationId: spanId,
      metricName: "correctness",
      numericValue: 0.93,
      outcome: "pass",
      source: "end_user",
      serviceName: "support-service",
      environment: "production",
      release: "2026.08.07",
      payload: {
        input: { question: "hello", password: "[REDACTED]" },
        expected: "answer",
      },
      metadata: { "anvia.eval.case.metadata": "visible" },
    });
    expect(result.runs).toHaveLength(2);
    expect(result.runs[1]).toMatchObject({
      status: "completed",
      passed: 1,
      release: "2026.08.07",
      stateVersion: 2,
    });
  });

  it("rejects invalid evaluation and run records without stopping the batch", () => {
    const request = decodeRecords([
      { eventName: "gen_ai.evaluation.result", attributes: [] },
      {
        eventName: "anvia.eval.run.finished",
        attributes: [
          attribute("anvia.eval.run.id", { stringValue: "run-1" }),
          attribute("anvia.eval.suite.name", { stringValue: "suite" }),
          attribute("anvia.eval.run.status", { stringValue: "invalid" }),
        ],
      },
      {
        eventName: "gen_ai.evaluation.result",
        attributes: [attribute("gen_ai.evaluation.name", { stringValue: "valid" })],
      },
    ]);

    const result = normalizeOtlpLogsRequest(request, { projectId, retentionDays: null, now });
    expect(result.rejectedLogRecords).toBe(2);
    expect(result.evaluations).toHaveLength(1);
    expect(result.errors).toEqual([
      "Evaluation log is missing gen_ai.evaluation.name",
      "Evaluation run run-1 has an invalid terminal status",
    ]);
  });

  it("drops unsafe integer counters", () => {
    const request = decodeRecords([
      {
        eventName: "anvia.eval.run.finished",
        attributes: [
          attribute("anvia.eval.run.id", { stringValue: "run-1" }),
          attribute("anvia.eval.run.status", { stringValue: "completed" }),
          attribute("anvia.eval.suite.name", { stringValue: "suite" }),
          attribute("anvia.eval.run.case_count", { intValue: "9".repeat(400) }),
        ],
      },
    ]);

    const result = normalizeOtlpLogsRequest(request, { projectId, retentionDays: null, now });
    expect(result.runs[0]?.caseCount).toBe(0);
  });
});
