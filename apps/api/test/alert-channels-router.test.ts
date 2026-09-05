import type { AlertChannel, AlertChannelInput } from "@lens/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ role: "owner" }));

const dbFunctions = vi.hoisted(() => ({
  alertChannelCount: vi.fn(),
  createAlertChannel: vi.fn(),
  deleteAlertChannel: vi.fn(),
  getAlertChannelWithConfig: vi.fn(),
  listAlertChannels: vi.fn(),
  updateAlertChannel: vi.fn(),
}));

const queueFunctions = vi.hoisted(() => ({
  deliverAlert: vi.fn(),
}));

vi.mock("../src/utils/access.js", () => ({
  requireProjectAccess: vi.fn().mockImplementation(() =>
    Promise.resolve({
      project: { id: "10000000-0000-4000-8000-000000000001", name: "Integration" },
      role: access.role,
    }),
  ),
  canManage: (role: string) => role === "owner" || role === "admin",
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
import { createAlertsRouter } from "../src/modules/alerts/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000004";

const webhookInput: AlertChannelInput = {
  type: "webhook",
  name: "Ops hook",
  url: "https://example.com/hook",
  secret: "s3cret-value-16chars",
};

const storedChannel: AlertChannel = {
  id: channelId,
  projectId,
  type: "webhook",
  name: "Ops hook",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};

describe("alert channels API", () => {
  beforeEach(() => {
    access.role = "owner";
    vi.clearAllMocks();
    dbFunctions.listAlertChannels.mockResolvedValue([storedChannel]);
    dbFunctions.alertChannelCount.mockResolvedValue(0);
    dbFunctions.createAlertChannel.mockResolvedValue(storedChannel);
    dbFunctions.updateAlertChannel.mockResolvedValue(storedChannel);
    dbFunctions.deleteAlertChannel.mockResolvedValue(true);
    dbFunctions.getAlertChannelWithConfig.mockResolvedValue({
      ...storedChannel,
      config: { url: webhookInput.url, secret: webhookInput.secret },
    });
    queueFunctions.deliverAlert.mockResolvedValue(undefined);
  });

  it("creates a channel and returns it without config", async () => {
    const response = await app().request(`/projects/${projectId}/alert-channels`, {
      method: "POST",
      body: JSON.stringify(webhookInput),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(storedChannel);
    expect(dbFunctions.createAlertChannel).toHaveBeenCalledWith(
      {},
      projectId,
      "user-1",
      webhookInput,
    );
  });

  it("rejects the 26th channel with a conflict", async () => {
    dbFunctions.alertChannelCount.mockResolvedValue(25);
    const response = await app().request(`/projects/${projectId}/alert-channels`, {
      method: "POST",
      body: JSON.stringify(webhookInput),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "channel_limit" } });
    expect(dbFunctions.createAlertChannel).not.toHaveBeenCalled();
  });

  it("rejects invalid channel bodies", async () => {
    const response = await app().request(`/projects/${projectId}/alert-channels`, {
      method: "POST",
      body: JSON.stringify({ type: "webhook", name: "", url: "not-a-url" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_channel" } });
  });

  it("forbids members from managing channels", async () => {
    access.role = "member";
    const response = await app().request(`/projects/${projectId}/alert-channels`, {
      method: "POST",
      body: JSON.stringify(webhookInput),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "forbidden", message: "Admin access is required" },
    });
    expect(dbFunctions.createAlertChannel).not.toHaveBeenCalled();
  });

  it("conflicts on duplicate channel names", async () => {
    dbFunctions.createAlertChannel.mockRejectedValue({ code: "23505" });
    const response = await app().request(`/projects/${projectId}/alert-channels`, {
      method: "POST",
      body: JSON.stringify(webhookInput),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "duplicate_rule" } });
  });

  it("lists channels without exposing config", async () => {
    const response = await app().request(`/projects/${projectId}/alert-channels`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [storedChannel] });
  });

  it("sends a synchronous test delivery", async () => {
    const response = await app().request(
      `/projects/${projectId}/alert-channels/${channelId}/test`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [target, message] = queueFunctions.deliverAlert.mock.calls[0] ?? [];
    expect(target).toEqual({
      type: "webhook",
      config: { url: webhookInput.url, secret: webhookInput.secret },
    });
    expect(message).toContain("[Anvia Lens] Test alert");
    expect(message).toContain("Project: Integration");
  });

  it("reports a failed test delivery with the transport error", async () => {
    queueFunctions.deliverAlert.mockRejectedValue(
      new AlertDeliveryError("delivery failed with status 500: oops", true, 500),
    );
    const response = await app().request(
      `/projects/${projectId}/alert-channels/${channelId}/test`,
      { method: "POST" },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "delivery_failed", message: "delivery failed with status 500: oops" },
    });
  });

  it("404s a test against a missing channel", async () => {
    dbFunctions.getAlertChannelWithConfig.mockResolvedValue(undefined);
    const response = await app().request(
      `/projects/${projectId}/alert-channels/${channelId}/test`,
      { method: "POST" },
    );
    expect(response.status).toBe(404);
    expect(queueFunctions.deliverAlert).not.toHaveBeenCalled();
  });
});

function app() {
  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  return api.route(
    "/projects",
    createAlertsRouter({
      postgres: { db: {} },
      config: { PUBLIC_APP_URL: "http://localhost:3000" },
      queues: {},
      logger: { warn: vi.fn() },
    } as unknown as ApiDependencies),
  );
}
