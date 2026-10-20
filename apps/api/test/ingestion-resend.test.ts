import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiMetrics } from "../src/utils/metrics.js";
import type { ApiDependencies } from "../src/utils/types.js";

const mocks = vi.hoisted(() => ({
  authenticateIngestionKey: vi.fn(),
  recordProjectKeyUsage: vi.fn(),
  withinFixedWindowRateLimit: vi.fn(),
  decodeOtlpLogsRequest: vi.fn(),
  decodeOtlpRequest: vi.fn(),
  normalizeOtlpLogsRequest: vi.fn(),
  normalizeOtlpRequest: vi.fn(),
}));

vi.mock("../src/modules/ingestion/services.js", () => ({
  authenticateIngestionKey: mocks.authenticateIngestionKey,
  recordProjectKeyUsage: mocks.recordProjectKeyUsage,
}));
vi.mock("../src/utils/rate-limit.js", () => ({
  withinFixedWindowRateLimit: mocks.withinFixedWindowRateLimit,
}));
vi.mock("@lens/telemetry", () => ({
  decodeOtlpLogsRequest: mocks.decodeOtlpLogsRequest,
  decodeOtlpRequest: mocks.decodeOtlpRequest,
  encodeOtlpLogsResponse: vi.fn(() => new Uint8Array()),
  encodeOtlpResponse: vi.fn(() => new Uint8Array()),
  normalizeOtlpLogsRequest: mocks.normalizeOtlpLogsRequest,
  normalizeOtlpRequest: mocks.normalizeOtlpRequest,
  parseOtlpContentType: vi.fn(() => "application/json"),
}));

import { createLogsIngestionRouter } from "../src/modules/ingestion/logs-router.js";
import { createIngestionRouter } from "../src/modules/ingestion/router.js";

const project = { id: "project-1", state: "active", retentionDays: "30" };
const traceSpans = [{ traceId: "a".repeat(32) }];

function traceQueue() {
  return {
    add: vi.fn(),
    getJob: vi.fn(),
    getWaitingCount: vi.fn().mockResolvedValue(0),
  };
}

function evaluationsQueue() {
  return {
    add: vi.fn(),
    getJob: vi.fn(),
    getWaitingCount: vi.fn().mockResolvedValue(0),
  };
}

function metrics() {
  const counter = { inc: vi.fn() };
  return {
    accepted: counter,
    rejected: counter,
    evaluationsAccepted: counter,
    evaluationLogsRejected: counter,
    duration: { observe: vi.fn() },
  } as unknown as ApiMetrics;
}

function traceApp(queue: ReturnType<typeof traceQueue>) {
  return createIngestionRouter(
    {
      config: {
        INGESTION_KEY_PEPPER: "test-ingestion-pepper",
        INGESTION_QUEUE_MAX_WAITING: 500,
        OTLP_MAX_BODY_BYTES: 1_024,
        OTLP_RATE_LIMIT_PER_MINUTE: 600,
      },
      queues: { ingest: queue },
      postgres: { db: {} },
      redis: {},
      logger: { warn: vi.fn() },
    } as unknown as ApiDependencies,
    metrics(),
  );
}

function logsApp(queue: ReturnType<typeof evaluationsQueue>) {
  return createLogsIngestionRouter(
    {
      config: {
        INGESTION_KEY_PEPPER: "test-ingestion-pepper",
        INGESTION_QUEUE_MAX_WAITING: 500,
        OTLP_MAX_BODY_BYTES: 1_024,
        OTLP_RATE_LIMIT_PER_MINUTE: 600,
      },
      queues: { evaluations: queue },
      postgres: { db: {} },
      redis: {},
      logger: { warn: vi.fn() },
    } as unknown as ApiDependencies,
    metrics(),
  );
}

function post(app: {
  request: (input: string, init?: RequestInit) => Response | Promise<Response>;
}) {
  return app.request("/", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from("public:secret").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
}

describe("ingestion re-send after a failed job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateIngestionKey.mockResolvedValue({ apiKeyId: "key-1", project });
    mocks.withinFixedWindowRateLimit.mockResolvedValue(true);
    mocks.decodeOtlpLogsRequest.mockReturnValue({});
    mocks.decodeOtlpRequest.mockReturnValue({});
    mocks.normalizeOtlpLogsRequest.mockReturnValue({
      evaluations: [{}],
      runs: [],
      rejectedLogRecords: 0,
      errors: [],
    });
    mocks.normalizeOtlpRequest.mockReturnValue({
      spans: traceSpans,
      rejectedSpans: 0,
      errors: [],
    });
  });

  it("retries the failed trace job instead of dropping the re-send", async () => {
    const queue = traceQueue();
    const retry = vi.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ isFailed: vi.fn().mockResolvedValue(true), retry });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    const expectedId = `ingest-${createHash("sha256").update(project.id).update("{}").digest("hex")}`;
    expect(queue.getJob).toHaveBeenCalledWith(expectedId);
    expect(retry).toHaveBeenCalledWith("failed", { resetAttemptsMade: true });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("treats a lost retry race as success when the job already left failed", async () => {
    const queue = traceQueue();
    const loserError = Object.assign(
      new Error("Job job-1 is not in the failed state. reprocessJob"),
      { code: -3 },
    );
    const retry = vi.fn().mockRejectedValueOnce(loserError);
    queue.getJob
      .mockResolvedValueOnce({ isFailed: vi.fn().mockResolvedValue(true), retry })
      .mockResolvedValueOnce({ isFailed: vi.fn().mockResolvedValue(false) });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    expect(retry).toHaveBeenCalledWith("failed", { resetAttemptsMade: true });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("treats a lost retry race as success on the message alone", async () => {
    const queue = traceQueue();
    const retry = vi
      .fn()
      .mockRejectedValueOnce(new Error("Job job-1 is not in the failed state. reprocessJob"));
    queue.getJob
      .mockResolvedValueOnce({ isFailed: vi.fn().mockResolvedValue(true), retry })
      .mockResolvedValueOnce({ isFailed: vi.fn().mockResolvedValue(false) });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("still fails the re-send when the job is failed after a retry race error", async () => {
    const queue = traceQueue();
    const loserError = Object.assign(
      new Error("Job job-1 is not in the failed state. reprocessJob"),
      { code: -3 },
    );
    const retry = vi.fn().mockRejectedValueOnce(loserError);
    queue.getJob.mockResolvedValue({ isFailed: vi.fn().mockResolvedValue(true), retry });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(503);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("returns 503 when retry fails with a genuine error", async () => {
    const queue = traceQueue();
    const retry = vi.fn().mockRejectedValueOnce(new Error("Connection is closed"));
    queue.getJob.mockResolvedValue({ isFailed: vi.fn().mockResolvedValue(true), retry });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(503);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("queues a trace batch when no job exists yet", async () => {
    const queue = traceQueue();
    queue.getJob.mockResolvedValue(undefined);
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    expect(queue.add).toHaveBeenCalledOnce();
    expect(queue.add.mock.calls[0]?.[2]).toMatchObject({
      jobId: `ingest-${createHash("sha256").update(project.id).update("{}").digest("hex")}`,
    });
  });

  it("leaves a still-pending trace job alone on re-send", async () => {
    const queue = traceQueue();
    const retry = vi.fn();
    queue.getJob.mockResolvedValue({ isFailed: vi.fn().mockResolvedValue(false), retry });
    const app = traceApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    expect(retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("retries the failed evaluations job instead of dropping the re-send", async () => {
    const queue = evaluationsQueue();
    const retry = vi.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ isFailed: vi.fn().mockResolvedValue(true), retry });
    const app = logsApp(queue);

    const response = await post(app);

    expect(response.status).toBe(200);
    const expectedId = `evaluations-${createHash("sha256").update(project.id).update("{}").digest("hex")}`;
    expect(queue.getJob).toHaveBeenCalledWith(expectedId);
    expect(retry).toHaveBeenCalledWith("failed", { resetAttemptsMade: true });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
