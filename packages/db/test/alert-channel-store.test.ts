import type { AlertChannelInput, AlertDelivery } from "@lens/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertChannelCount,
  channelConfigFromInput,
  createAlertChannel,
  createPendingDeliveries,
  deleteAlertChannel,
  getAlertChannelWithConfig,
  listAlertChannels,
  listAlertChannelsByIds,
  listIncidentDeliveries,
  loadDeliveryForDispatch,
  markDeliveryAttempt,
  markDeliveryFinished,
  updateAlertChannel,
} from "../src/alert-channel-store.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000004";
const incidentId = "20000000-0000-4000-8000-000000000002";
const deliveryId = "30000000-0000-4000-8000-000000000003";

const channelRow = {
  id: channelId,
  projectId,
  type: "webhook",
  name: "Ops hook",
  config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
  createdBy: "user-1",
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
  updatedAt: new Date("2026-09-05T00:00:00.000Z"),
};

const deliveryRow = {
  id: deliveryId,
  projectId,
  incidentId,
  channelId,
  channelName: "Ops hook",
  channelType: "webhook",
  status: "pending",
  attempts: 0,
  error: null,
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
  deliveredAt: null,
};

function incidentRow() {
  return {
    id: incidentId,
    projectId,
    ruleId: "50000000-0000-4000-8000-000000000005",
    ruleName: "Error rate watch",
    kind: "trace_error_rate",
    subjectKey: "threshold",
    status: "open",
    summary: "Trace error rate is 100.0% (threshold 1.0%)",
    observedValue: "0.5",
    threshold: "0.01",
    sampleCount: 1,
    evidence: {},
    ruleSnapshot: null,
    firstTriggeredAt: new Date("2026-09-05T00:00:00.000Z"),
    lastTriggeredAt: new Date("2026-09-05T00:00:00.000Z"),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };
}

// Universal drizzle-builder stub: every method returns the same thenable chain,
// so `await db.select().from().where()` (and any builder tail) resolves rows.
function mockDb(rows: unknown[] | (() => unknown[])) {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  // biome-ignore lint/suspicious/noThenProperty: the stub must be thenable like real drizzle builders
  Object.defineProperty(builder, "then", {
    value: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(typeof rows === "function" ? rows() : rows).then(onFulfilled, onRejected),
  });
  Object.defineProperty(builder, "catch", {
    value: (onRejected: (reason: unknown) => unknown) =>
      Promise.resolve(typeof rows === "function" ? rows() : rows).catch(onRejected),
  });
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "leftJoin",
    "innerJoin",
    "values",
    "set",
    "returning",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  return {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    builder,
  };
}

function publicChannelRow(overrides: Record<string, unknown> = {}) {
  const { config: _config, createdBy: _createdBy, ...publicRow } = channelRow;
  return { ...publicRow, ...overrides };
}

describe("channelConfigFromInput", () => {
  it("maps each channel type to its stored config shape", () => {
    const slack = { type: "slack", name: "s", webhookUrl: "https://hooks.slack.com/x" };
    const telegram = { type: "telegram", name: "t", botToken: "123:abc", chatId: "@alerts" };
    const webhook = {
      type: "webhook",
      name: "w",
      url: "https://example.com/hook",
      secret: "s3cret-value-16chars",
    };
    expect(channelConfigFromInput(slack as AlertChannelInput)).toEqual({
      webhookUrl: "https://hooks.slack.com/x",
    });
    expect(channelConfigFromInput({ ...slack, type: "discord" } as AlertChannelInput)).toEqual({
      webhookUrl: "https://hooks.slack.com/x",
    });
    expect(channelConfigFromInput(telegram as AlertChannelInput)).toEqual({
      botToken: "123:abc",
      chatId: "@alerts",
    });
    expect(channelConfigFromInput(webhook as AlertChannelInput)).toEqual({
      url: "https://example.com/hook",
      secret: "s3cret-value-16chars",
    });
    const { secret: _secret, ...withoutSecret } = webhook;
    expect(channelConfigFromInput(withoutSecret as AlertChannelInput)).toEqual({
      url: "https://example.com/hook",
    });
  });
});

describe("alert channel store", () => {
  let db: ReturnType<typeof mockDb>;

  beforeEach(() => {
    db = mockDb([]);
  });

  it("lists public channel columns only", async () => {
    db = mockDb([publicChannelRow()]);
    const channels = await listAlertChannels(db as never, projectId);
    expect(channels).toEqual([
      {
        id: channelId,
        projectId,
        type: "webhook",
        name: "Ops hook",
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
    ]);
  });

  it("counts channels", async () => {
    db = mockDb([{ total: 3n }]);
    expect(await alertChannelCount(db as never, projectId)).toBe(3);
  });

  it("returns the stored channel with config when found", async () => {
    db = mockDb([channelRow]);
    const channel = await getAlertChannelWithConfig(db as never, projectId, channelId);
    expect(channel).toMatchObject({ id: channelId, config: channelRow.config });
  });

  it("creates a channel and returns public columns", async () => {
    db = mockDb([publicChannelRow()]);
    const input: AlertChannelInput = {
      type: "webhook",
      name: "Ops hook",
      url: "https://example.com/hook",
      secret: "s3cret-value-16chars",
    };
    const channel = await createAlertChannel(db as never, projectId, "user-1", input);
    expect(channel.id).toBe(channelId);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        type: "webhook",
        name: "Ops hook",
        config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
        createdBy: "user-1",
      }),
    );
  });

  it("throws when create returns no row", async () => {
    await expect(
      createAlertChannel(db as never, projectId, "user-1", {
        type: "slack",
        name: "s",
        webhookUrl: "https://hooks.slack.com/x",
      }),
    ).rejects.toThrow("Alert channel was not created");
  });

  it("updates a channel and reports missing rows", async () => {
    db = mockDb([publicChannelRow({ name: "Renamed" })]);
    const channel = await updateAlertChannel(db as never, projectId, channelId, {
      type: "discord",
      name: "Renamed",
      webhookUrl: "https://discord.com/api/webhooks/1/x",
    });
    expect(channel?.name).toBe("Renamed");
    db = mockDb([]);
    expect(
      await updateAlertChannel(db as never, projectId, channelId, {
        type: "discord",
        name: "Renamed",
        webhookUrl: "https://discord.com/api/webhooks/1/x",
      }),
    ).toBeUndefined();
  });

  it("deletes the channel and strips it from rule channel ids", async () => {
    db = mockDb([{ id: channelId }]);
    expect(await deleteAlertChannel(db as never, projectId, channelId)).toBe(true);
    const setCall = db.builder.set?.mock.lastCall?.[0] as { channelIds: unknown } | undefined;
    expect(setCall).toHaveProperty("channelIds");
    expect(db.builder.where).toHaveBeenCalled();

    db = mockDb([]);
    expect(await deleteAlertChannel(db as never, projectId, channelId)).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("skips the query when listing channels by empty ids", async () => {
    expect(await listAlertChannelsByIds(db as never, projectId, [])).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("creates pending deliveries with snapshots, preserving input order", async () => {
    const second = {
      ...channelRow,
      id: "40000000-0000-4000-8000-000000000099",
      name: "Other hook",
    };
    // Return rows in reverse to prove reordering by input.
    db = mockDb(() => [
      { ...deliveryRow, id: "d2", channelId: second.id, channelName: "Other hook" },
      deliveryRow,
    ]);
    const deliveries = await createPendingDeliveries(db as never, projectId, incidentId, [
      channelRow,
      second,
    ] as never);
    expect(deliveries.map((delivery: AlertDelivery) => delivery.channelId)).toEqual([
      channelId,
      second.id,
    ]);
    expect(deliveries[0]).toMatchObject({
      channelName: "Ops hook",
      channelType: "webhook",
      status: "pending",
      attempts: 0,
      deliveredAt: null,
    });
    expect(await createPendingDeliveries(db as never, projectId, incidentId, [])).toEqual([]);
  });

  it("lists incident deliveries", async () => {
    db = mockDb([deliveryRow]);
    const deliveries = await listIncidentDeliveries(db as never, projectId, incidentId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.createdAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("loads the dispatch payload with a nullable channel", async () => {
    db = mockDb([
      {
        delivery: deliveryRow,
        channel: channelRow,
        incident: incidentRow(),
        projectName: "Integration",
      },
    ]);
    const payload = await loadDeliveryForDispatch(db as never, deliveryId);
    expect(payload).toMatchObject({
      channel: { id: channelId },
      projectName: "Integration",
      incident: { id: incidentId, observedValue: 0.5 },
    });

    db = mockDb([
      {
        delivery: deliveryRow,
        channel: null,
        incident: incidentRow(),
        projectName: "Integration",
      },
    ]);
    const deleted = await loadDeliveryForDispatch(db as never, deliveryId);
    expect(deleted?.channel).toBeNull();

    db = mockDb([]);
    expect(await loadDeliveryForDispatch(db as never, deliveryId)).toBeUndefined();
  });

  it("marks attempts without changing status", async () => {
    await markDeliveryAttempt(db as never, deliveryId, 2, "delivery failed with status 500");
    expect(db.update).toHaveBeenCalled();
    expect(db.builder.set).toHaveBeenCalledWith({
      attempts: 2,
      error: "delivery failed with status 500",
    });
  });

  it("sets deliveredAt only when finished as delivered", async () => {
    await markDeliveryFinished(db as never, deliveryId, "delivered", 1, null);
    expect(db.builder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", deliveredAt: expect.any(Date) }),
    );
    db = mockDb([]);
    await markDeliveryFinished(db as never, deliveryId, "failed", 5, "boom");
    expect(db.builder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "boom" }),
    );
    expect(db.builder.set?.mock.lastCall?.[0]).not.toHaveProperty("deliveredAt");
  });
});
