import { Buffer } from "node:buffer";
import type { AlertChannelInput } from "@lens/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  encryptAlertChannelConfigForMigration,
  migrateAlertChannelSecrets,
  reencryptAlertChannelConfigForRotation,
  rotateAlertChannelSecrets,
} from "../src/alert-channel-migration.js";
import {
  createAlertChannel,
  getAlertChannelWithConfig,
  listAlertChannels,
  listAlertChannelsByIds,
  loadDeliveryForDispatch,
  updateAlertChannel,
} from "../src/alert-channel-store.js";
import {
  decryptAlertSecret,
  isEncryptedAlertSecret,
  parseAlertSecretKey,
} from "../src/alert-secrets.js";

const RAW_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_RAW_KEY = Buffer.alloc(32, 9).toString("base64");
const ring = parseAlertSecretKey(RAW_KEY);

const projectId = "10000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000004";

// Universal drizzle-builder stub: every method returns the same thenable chain,
// so `await db.select().from().where()` (and any builder tail) resolves rows.
function mockDb(rows: unknown[] | (() => unknown[])) {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  // oxlint-disable-next-line no-thenable -- the stub must be thenable like real drizzle builders
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

function publicChannelRow() {
  return {
    id: channelId,
    projectId,
    type: "webhook",
    name: "Ops hook",
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
  };
}

describe("alert channel secret encryption", () => {
  it("encrypts secret fields on create without returning them", async () => {
    const db = mockDb([publicChannelRow()]);
    const input: AlertChannelInput = {
      type: "webhook",
      name: "Ops hook",
      url: "https://example.com/hook",
      secret: "s3cret-value-16chars",
    };
    const channel = await createAlertChannel(db as never, projectId, "user-1", input, ring);
    expect(channel).not.toHaveProperty("config");
    const written = db.builder.values?.mock.calls[0]?.[0] as
      | { config: { url: string; secret: string } }
      | undefined;
    expect(written?.config.url).toBe("https://example.com/hook");
    expect(isEncryptedAlertSecret(written?.config.secret)).toBe(true);
    expect(decryptAlertSecret(written?.config.secret ?? "", ring)).toBe("s3cret-value-16chars");
  });

  it("encrypts secret fields on update without returning them", async () => {
    const db = mockDb([publicChannelRow()]);
    const channel = await updateAlertChannel(
      db as never,
      projectId,
      channelId,
      { type: "slack", name: "s", webhookUrl: "https://hooks.slack.com/x" },
      ring,
    );
    expect(channel).not.toHaveProperty("config");
    const written = db.builder.set?.mock.calls[0]?.[0] as
      | { config: { webhookUrl: string } }
      | undefined;
    expect(isEncryptedAlertSecret(written?.config.webhookUrl)).toBe(true);
    expect(decryptAlertSecret(written?.config.webhookUrl ?? "", ring)).toBe(
      "https://hooks.slack.com/x",
    );
  });

  it("decrypts stored secrets on delivery read paths", async () => {
    const stored = {
      id: channelId,
      projectId,
      type: "telegram",
      name: "Pager",
      config: {
        botToken:
          '{"v":1,"kid":"v1","nonce":"AAAAAAAAAAAAAAAA","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
        chatId: "@alerts",
      },
      createdBy: "user-1",
      createdAt: new Date("2026-09-05T00:00:00.000Z"),
      updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    };
    const { encryptStoredConfig } = await import("../src/alert-channel-store.js");
    const encrypted = {
      ...stored,
      config: encryptStoredConfig({ botToken: "123:abc", chatId: "@alerts" }, ring),
    };
    const db = mockDb([encrypted]);
    const channel = await getAlertChannelWithConfig(db as never, projectId, channelId, ring);
    expect(channel).toMatchObject({ config: { botToken: "123:abc", chatId: "@alerts" } });

    const dbByIds = mockDb([encrypted]);
    const channels = await listAlertChannelsByIds(dbByIds as never, projectId, [channelId], ring);
    expect(channels[0]).toMatchObject({ config: { botToken: "123:abc" } });
    expect(stored.config.botToken).not.toContain("123:abc");
  });

  it("keeps public list responses free of secrets", async () => {
    const db = mockDb([publicChannelRow()]);
    const channels = await listAlertChannels(db as never, projectId);
    expect(channels).toHaveLength(1);
    expect(channels[0]).not.toHaveProperty("config");
    expect(JSON.stringify(channels)).not.toContain("s3cret");
  });

  it("rejects plaintext rows on delivery reads until migrated", async () => {
    const plaintext = {
      ...publicChannelRow(),
      type: "slack",
      config: { webhookUrl: "https://hooks.slack.com/x" },
      createdBy: "user-1",
    };
    const db = mockDb([plaintext]);
    await expect(
      getAlertChannelWithConfig(db as never, projectId, channelId, ring),
    ).rejects.toThrow(/plaintext/);
    const dispatch = mockDb([
      {
        delivery: {
          id: "d",
          projectId,
          incidentId: "i",
          channelId,
          channelName: "s",
          channelType: "slack",
          status: "pending",
          attempts: 0,
          error: null,
          createdAt: new Date("2026-09-05T00:00:00.000Z"),
          deliveredAt: null,
        },
        channel: plaintext,
        incident: {
          id: "i",
          projectId,
          ruleId: "r",
          ruleName: "n",
          kind: "trace_error_rate",
          subjectKey: "s",
          status: "open",
          summary: "sum",
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
        },
        projectName: "Integration",
      },
    ]);
    await expect(loadDeliveryForDispatch(dispatch as never, "d", ring)).rejects.toThrow(
      /plaintext/,
    );
  });
});

describe("alert channel migration and rotation", () => {
  it("encrypts plaintext rows and skips rows already encrypted (idempotent)", () => {
    const plaintext = {
      id: "1",
      type: "slack" as const,
      config: { webhookUrl: "https://hooks.slack.com/x" },
    };
    const first = encryptAlertChannelConfigForMigration(plaintext, ring);
    expect(first.changed).toBe(true);
    expect(isEncryptedAlertSecret((first.config as { webhookUrl: string }).webhookUrl)).toBe(true);

    const second = encryptAlertChannelConfigForMigration(
      { id: "1", type: "slack", config: first.config },
      ring,
    );
    expect(second.changed).toBe(false);

    const noSecret = encryptAlertChannelConfigForMigration(
      { id: "2", type: "webhook", config: { url: "https://example.com/hook" } },
      ring,
    );
    expect(noSecret.changed).toBe(false);
  });

  it("rewrites rows through the database and reports counts", async () => {
    const rows = [
      { id: "1", type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      {
        id: "2",
        type: "webhook",
        config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
      },
    ];
    const updates: unknown[] = [];
    const db = {
      select: () => ({ from: () => Promise.resolve(rows) }),
      update: () => ({
        set: (values: unknown) => ({
          where: () => {
            updates.push(values);
            return Promise.resolve();
          },
        }),
      }),
    };
    const first = await migrateAlertChannelSecrets(db as never, ring);
    expect(first).toEqual({ scanned: 2, encrypted: 2, skipped: 0 });
    expect(updates).toHaveLength(2);

    const encryptedRows = rows.map((row, index) => ({
      ...row,
      config: (updates[index] as { config: Record<string, unknown> }).config,
    }));
    const rerun = {
      select: () => ({ from: () => Promise.resolve(encryptedRows) }),
      update: () => ({
        set: () => ({
          where: () => {
            throw new Error("second run must not write");
          },
        }),
      }),
    };
    const second = await migrateAlertChannelSecrets(rerun as never, ring);
    expect(second).toEqual({ scanned: 2, encrypted: 0, skipped: 2 });
  });

  it("rotates envelopes to the new active key and leaves current rows alone", async () => {
    const oldRing = parseAlertSecretKey(`old:${OTHER_RAW_KEY}`);
    const { encryptStoredConfig } = await import("../src/alert-channel-store.js");
    const oldEnvelope = encryptStoredConfig(
      { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
      oldRing,
    );
    const newRing = parseAlertSecretKey(`${RAW_KEY},old:${OTHER_RAW_KEY}`);
    // Active entry without an explicit kid defaults to "v1"; give it the new id.
    const rotated: typeof newRing = {
      active: { id: "new", bytes: newRing.active.bytes },
      previous: [{ id: "old", bytes: oldRing.active.bytes }],
    };
    const result = reencryptAlertChannelConfigForRotation(
      { id: "1", type: "webhook", config: oldEnvelope as Record<string, unknown> },
      rotated,
    );
    expect(result.changed).toBe(true);
    const secret = (result.config as { secret: string }).secret;
    expect(JSON.parse(secret).kid).toBe("new");
    expect(decryptAlertSecret(secret, rotated)).toBe("s3cret-value-16chars");

    const again = reencryptAlertChannelConfigForRotation(
      { id: "1", type: "webhook", config: result.config },
      rotated,
    );
    expect(again.changed).toBe(false);

    const rows = [{ id: "1", type: "webhook", config: oldEnvelope }];
    const updates: unknown[] = [];
    const db = {
      select: () => ({ from: () => Promise.resolve(rows) }),
      update: () => ({
        set: (values: unknown) => ({
          where: () => {
            updates.push(values);
            return Promise.resolve();
          },
        }),
      }),
    };
    const rotatedResult = await rotateAlertChannelSecrets(db as never, rotated);
    expect(rotatedResult).toEqual({ scanned: 1, encrypted: 1, skipped: 0 });
    expect(updates).toHaveLength(1);
  });
});
