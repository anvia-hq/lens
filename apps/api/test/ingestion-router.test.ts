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

describe("trace ingestion backpressure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateIngestionKey.mockResolvedValue({
      apiKeyId: "key-1",
      project: { id: "project-1", state: "active", retentionDays: "30" },
    });
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
      spans: [{ traceId: "a".repeat(32) }],
      rejectedSpans: 0,
      errors: [],
    });
  });

  it("rejects before decoding when the waiting-job limit is reached", async () => {
    const { add, app, getWaitingCount } = testApp();
    getWaitingCount.mockResolvedValue(500);

    const response = await request(app);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(mocks.decodeOtlpRequest).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("returns a retryable response when Redis rejects the job", async () => {
    const { add, app, getWaitingCount, logger } = testApp();
    getWaitingCount.mockResolvedValue(0);
    add.mockRejectedValue(new Error("OOM command not allowed"));

    const response = await request(app);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), projectId: "project-1" },
      "failed to enqueue telemetry",
    );
    expect(mocks.recordProjectKeyUsage).not.toHaveBeenCalled();
  });
});

describe("evaluation log ingestion backpressure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateIngestionKey.mockResolvedValue({
      apiKeyId: "key-1",
      project: { id: "project-1", state: "active", retentionDays: "30" },
    });
    mocks.withinFixedWindowRateLimit.mockResolvedValue(true);
    mocks.decodeOtlpLogsRequest.mockReturnValue({});
    mocks.normalizeOtlpLogsRequest.mockReturnValue({
      evaluations: [{}],
      runs: [],
      rejectedLogRecords: 0,
      errors: [],
    });
  });

  it("returns a retryable response when Redis rejects the evaluation job", async () => {
    const add = vi.fn().mockRejectedValue(new Error("OOM command not allowed"));
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const logger = { warn: vi.fn() };
    const counter = { inc: vi.fn() };
    const app = createLogsIngestionRouter(
      {
        config: {
          INGESTION_KEY_PEPPER: "test-ingestion-pepper",
          INGESTION_QUEUE_MAX_WAITING: 500,
          OTLP_MAX_BODY_BYTES: 1_024,
          OTLP_RATE_LIMIT_PER_MINUTE: 600,
        },
        queues: { evaluations: { add, getWaitingCount } },
        postgres: { db: {} },
        redis: {},
        logger,
      } as unknown as ApiDependencies,
      {
        evaluationsAccepted: counter,
        evaluationLogsRejected: counter,
        duration: { observe: vi.fn() },
      } as unknown as ApiMetrics,
    );

    const response = await request(app);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), projectId: "project-1" },
      "failed to enqueue evaluations",
    );
    expect(mocks.recordProjectKeyUsage).not.toHaveBeenCalled();
  });
});

function testApp() {
  const add = vi.fn();
  const getWaitingCount = vi.fn();
  const logger = { warn: vi.fn() };
  const counter = { inc: vi.fn() };
  const metrics = {
    accepted: counter,
    rejected: counter,
    duration: { observe: vi.fn() },
  } as unknown as ApiMetrics;
  const app = createIngestionRouter(
    {
      config: {
        INGESTION_KEY_PEPPER: "test-ingestion-pepper",
        INGESTION_QUEUE_MAX_WAITING: 500,
        OTLP_MAX_BODY_BYTES: 1_024,
        OTLP_RATE_LIMIT_PER_MINUTE: 600,
      },
      queues: { ingest: { add, getWaitingCount } },
      postgres: { db: {} },
      redis: {},
      logger,
    } as unknown as ApiDependencies,
    metrics,
  );
  return { add, app, getWaitingCount, logger };
}

function request(app: { request: ReturnType<typeof createIngestionRouter>["request"] }) {
  return app.request("/", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from("public:secret").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
}
