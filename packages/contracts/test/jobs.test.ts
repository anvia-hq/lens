import { describe, expect, it } from "vitest";
import {
  dispatchAlertJobSchema,
  evaluateAlertsJobSchema,
  ingestEvaluationsJobSchema,
  ingestTraceJobSchema,
  jobOutboxEventSchema,
  materializeTraceJobSchema,
  queueJobNames,
  queueJobSchemas,
} from "../src/index.js";
import { evaluationResult, evaluationRun, normalizedSpan, projectId } from "./fixtures.js";

describe("queue job contracts", () => {
  it("versions and validates telemetry ingestion jobs", () => {
    expect(
      ingestTraceJobSchema.parse({
        projectId,
        ingestId: "ingest-1",
        receivedAt: "2026-09-17T00:00:00.000Z",
        spans: [normalizedSpan()],
      }).schemaVersion,
    ).toBe(1);
    expect(
      ingestTraceJobSchema.safeParse({
        projectId,
        ingestId: "ingest-1",
        receivedAt: "invalid",
        spans: [normalizedSpan()],
      }).success,
    ).toBe(false);
    expect(materializeTraceJobSchema.safeParse({ projectId, traceId: "short" }).success).toBe(
      false,
    );
  });

  it("versions and validates evaluation ingestion jobs", () => {
    const parsed = ingestEvaluationsJobSchema.parse({
      projectId,
      ingestId: "ingest-1",
      receivedAt: "2026-09-17T00:00:00.000Z",
      evaluations: [evaluationResult()],
      runs: [evaluationRun()],
    });
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.evaluations).toHaveLength(1);
  });

  it("exposes a complete name-to-schema registry", () => {
    expect(queueJobNames).toMatchObject({
      ingest: "ingest",
      evaluations: "ingest",
      dispatch: "dispatch-alert",
    });
    expect(Object.keys(queueJobSchemas)).toEqual([
      "ingest",
      "evaluations",
      "materialize",
      "maintenance",
      "costs",
      "alerts",
      "dispatch",
    ]);
    expect(evaluateAlertsJobSchema.parse({}).schemaVersion).toBe(1);
    expect(dispatchAlertJobSchema.safeParse({ deliveryId: "not-a-uuid" }).success).toBe(false);
  });

  it("correlates outbox job names and payloads", () => {
    expect(
      jobOutboxEventSchema.safeParse({
        queue: "maintenance",
        name: "delete-data",
        payload: { requestId: "10000000-0000-4000-8000-000000000002" },
      }).success,
    ).toBe(true);
    expect(
      jobOutboxEventSchema.safeParse({
        queue: "maintenance",
        name: "delete-data",
        payload: { projectId },
      }).success,
    ).toBe(false);
  });
});
