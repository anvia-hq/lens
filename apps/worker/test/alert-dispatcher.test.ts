import type { AlertDelivery, AlertIncident, DispatchAlertJob } from "@lens/contracts";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbFunctions = vi.hoisted(() => ({
  loadDeliveryForDispatch: vi.fn(),
  markDeliveryAttempt: vi.fn(),
  markDeliveryFinished: vi.fn(),
}));

const queueFunctions = vi.hoisted(() => ({
  deliverAlert: vi.fn(),
}));

vi.mock("@lens/db", async (importOriginal) => ({
  ...(await importOriginal()),
  ...dbFunctions,
}));

vi.mock("@lens/queue", async (importOriginal) => ({
  ...(await importOriginal()),
  deliverAlert: queueFunctions.deliverAlert,
}));

import { AlertDeliveryError } from "@lens/queue";
import { createAlertDispatchProcessor } from "../src/alert-dispatcher.js";
import type { ProcessorDependencies } from "../src/processors.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const incidentId = "20000000-0000-4000-8000-000000000002";
const deliveryId = "30000000-0000-4000-8000-000000000003";
const channelId = "40000000-0000-4000-8000-000000000004";

const incident: AlertIncident = {
  id: incidentId,
  projectId,
  ruleId: "50000000-0000-4000-8000-000000000005",
  ruleName: "Production errors",
  kind: "trace_error_rate",
  status: "open",
  summary: "Trace error rate is 50.0% (threshold 10.0%)",
  observedValue: 0.5,
  threshold: 0.1,
  sampleCount: 20,
  evidence: {},
  firstTriggeredAt: "2026-09-05T00:00:00.000Z",
  lastTriggeredAt: "2026-09-05T00:00:00.000Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  resolution: null,
};

const delivery: AlertDelivery = {
  id: deliveryId,
  incidentId,
  channelId,
  channelName: "Ops webhook",
  channelType: "webhook",
  status: "pending",
  attempts: 0,
  error: null,
  createdAt: "2026-09-05T00:00:00.000Z",
  deliveredAt: null,
};

const channel = {
  id: channelId,
  projectId,
  type: "webhook" as const,
  name: "Ops webhook",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
};

function deps() {
  return {
    postgres: { db: {} },
    queues: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    appUrl: "http://localhost:3000",
    clickhouse: {},
    materializeDelayMs: 0,
  } as unknown as ProcessorDependencies;
}

function job(attemptsMade = 0, attempts = 5) {
  return {
    data: { deliveryId } satisfies DispatchAlertJob,
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<DispatchAlertJob>;
}

function payload(
  overrides: { delivery?: Partial<AlertDelivery>; channel?: typeof channel | null } = {},
) {
  return {
    delivery: { ...delivery, ...overrides.delivery },
    channel: overrides.channel === undefined ? channel : overrides.channel,
    incident,
    projectName: "Integration",
  };
}

describe("alert dispatch processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbFunctions.markDeliveryAttempt.mockResolvedValue(undefined);
    dbFunctions.markDeliveryFinished.mockResolvedValue(undefined);
    queueFunctions.deliverAlert.mockResolvedValue(undefined);
  });

  it("does nothing when the delivery is missing or already finished", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(undefined);
    await createAlertDispatchProcessor(deps())(job());
    expect(queueFunctions.deliverAlert).not.toHaveBeenCalled();
    expect(dbFunctions.markDeliveryFinished).not.toHaveBeenCalled();

    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(
      payload({ delivery: { status: "delivered" } }),
    );
    await createAlertDispatchProcessor(deps())(job());
    expect(queueFunctions.deliverAlert).not.toHaveBeenCalled();
  });

  it("fails the delivery without fetching when the channel was deleted", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(payload({ channel: null }));
    await createAlertDispatchProcessor(deps())(job());
    expect(queueFunctions.deliverAlert).not.toHaveBeenCalled();
    expect(dbFunctions.markDeliveryFinished).toHaveBeenCalledWith(
      {},
      deliveryId,
      "failed",
      1,
      "channel deleted",
    );
  });

  it("delivers the rendered message and records the delivery", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(payload());
    await createAlertDispatchProcessor(deps())(job());
    const [target, message, body] = queueFunctions.deliverAlert.mock.calls[0] ?? [];
    expect(target).toEqual({ type: "webhook", config: channel.config });
    expect(message).toContain("[Anvia Lens] Production errors");
    expect(message).toContain("Observed: 50.0% / threshold 10.0%");
    expect(body).toEqual({ projectId, incident });
    expect(dbFunctions.markDeliveryFinished).toHaveBeenCalledWith(
      {},
      deliveryId,
      "delivered",
      1,
      null,
    );
  });

  it("records the attempt and rethrows retryable errors with attempts left", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(payload());
    queueFunctions.deliverAlert.mockRejectedValue(
      new AlertDeliveryError("delivery failed with status 500", true, 500),
    );
    const processor = createAlertDispatchProcessor(deps());
    await expect(processor(job(1))).rejects.toBeInstanceOf(AlertDeliveryError);
    expect(dbFunctions.markDeliveryAttempt).toHaveBeenCalledWith(
      {},
      deliveryId,
      2,
      "delivery failed with status 500",
    );
    expect(dbFunctions.markDeliveryFinished).not.toHaveBeenCalled();
  });

  it("fails the delivery on the final retryable attempt without throwing", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(payload({ delivery: { attempts: 4 } }));
    queueFunctions.deliverAlert.mockRejectedValue(
      new AlertDeliveryError("request failed: timeout", true),
    );
    await createAlertDispatchProcessor(deps())(job(4));
    expect(dbFunctions.markDeliveryAttempt).not.toHaveBeenCalled();
    expect(dbFunctions.markDeliveryFinished).toHaveBeenCalledWith(
      {},
      deliveryId,
      "failed",
      5,
      "request failed: timeout",
    );
  });

  it("fails the delivery immediately on non-retryable errors", async () => {
    dbFunctions.loadDeliveryForDispatch.mockResolvedValue(payload());
    queueFunctions.deliverAlert.mockRejectedValue(
      new AlertDeliveryError("delivery failed with status 400", false, 400),
    );
    await createAlertDispatchProcessor(deps())(job(0));
    expect(dbFunctions.markDeliveryAttempt).not.toHaveBeenCalled();
    expect(dbFunctions.markDeliveryFinished).toHaveBeenCalledWith(
      {},
      deliveryId,
      "failed",
      1,
      "delivery failed with status 400",
    );
  });
});
