import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const nodeMocks = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: nodeMocks.lookup }));
vi.mock("node:http", () => ({ request: nodeMocks.httpRequest }));
vi.mock("node:https", () => ({ request: nodeMocks.httpsRequest }));

import {
  AlertDeliveryError,
  type AlertDeliveryInput,
  type AlertTransport,
  alertDeliveryBackoffStrategy,
  alertDeliveryBackoffType,
  deliverAlert,
  formatObserved,
  renderAlertMessage,
  sendPublicHttpRequest,
} from "../src/index";

const input: AlertDeliveryInput = {
  ruleName: "Production errors",
  kind: "trace_error_rate",
  summary: "Trace error rate is 12.0% (threshold 5.0%)",
  projectName: "Anvia",
  observedValue: 0.12,
  threshold: 0.05,
  incidentUrl: "http://localhost:3000/project-1/alerts/incident-1",
};

function successfulTransport() {
  return vi.fn<AlertTransport>().mockResolvedValue({
    status: 200,
    body: "",
    retryAfter: undefined,
  });
}

function mockNodeResponse(
  requestMock: typeof nodeMocks.httpRequest,
  response: {
    status?: number;
    body?: string;
    retryAfter?: string | string[];
    streamError?: Error;
  } = {},
) {
  requestMock.mockImplementation((options, callback) => {
    void options;
    const incoming = new EventEmitter() as EventEmitter & {
      headers: Record<string, string | string[] | undefined>;
      setEncoding: ReturnType<typeof vi.fn>;
      statusCode?: number;
    };
    incoming.statusCode = response.status ?? 200;
    incoming.headers = { "retry-after": response.retryAfter };
    incoming.setEncoding = vi.fn();
    const outgoing = new EventEmitter() as EventEmitter & {
      end: ReturnType<typeof vi.fn>;
      setTimeout: ReturnType<typeof vi.fn>;
    };
    outgoing.setTimeout = vi.fn();
    outgoing.end = vi.fn(() => {
      callback(incoming);
      if (response.streamError !== undefined) {
        incoming.emit("error", response.streamError);
        return;
      }
      incoming.emit("data", response.body ?? "");
      incoming.emit("end");
    });
    return outgoing;
  });
}

describe("alert messages", () => {
  it("formats observed values and renders optional measurements", () => {
    expect(formatObserved("trace_p95_latency_ms", 812.4)).toBe("812 ms");
    expect(formatObserved("trace_error_rate", 0.1234)).toBe("12.3%");
    expect(renderAlertMessage(input)).toContain("Observed: 12.0% / threshold 5.0%");
    expect(renderAlertMessage({ ...input, threshold: null })).toContain("Observed: 12.0%\n");
    expect(renderAlertMessage({ ...input, observedValue: null, threshold: null })).not.toContain(
      "Observed:",
    );
  });
});

describe("deliverAlert", () => {
  it("uses provider payloads and message limits", async () => {
    const transport = successfulTransport();
    await deliverAlert(
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      "x".repeat(40_100),
      undefined,
      { transport },
    );
    await deliverAlert(
      { type: "discord", config: { webhookUrl: "https://discord.com/api/webhooks/1/x" } },
      "x".repeat(2_100),
      undefined,
      { transport },
    );
    await deliverAlert(
      { type: "telegram", config: { botToken: "123:abc", chatId: "@alerts" } },
      "x".repeat(4_200),
      undefined,
      { transport },
    );

    expect(JSON.parse(transport.mock.calls[0]?.[0].body ?? "{}").text).toHaveLength(40_000);
    expect(JSON.parse(transport.mock.calls[1]?.[0].body ?? "{}").content).toHaveLength(2_000);
    const telegram = transport.mock.calls[2]?.[0];
    expect(telegram?.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(telegram?.body ?? "{}").text).toHaveLength(4_096);
  });

  it("signs timestamped webhook payloads", async () => {
    const transport = successfulTransport();
    const incident = { id: "incident-1", summary: "boom" };
    await deliverAlert(
      {
        type: "webhook",
        config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
      },
      "hello",
      { event: "alert.opened", projectId: "project-1", incident: incident as never },
      { transport, now: () => new Date("2026-09-17T00:00:00.000Z") },
    );

    const request = transport.mock.calls[0]?.[0];
    expect(JSON.parse(request?.body ?? "{}")).toEqual({
      event: "alert.opened",
      projectId: "project-1",
      incident,
      message: "hello",
    });
    expect(request?.headers["x-lens-topic"]).toBe("alert.opened");
    expect(request?.headers["x-lens-timestamp"]).toBe("1789603200");
    expect(request?.headers["x-lens-signature"]).toBe(
      `t=1789603200,v1=${createHmac("sha256", "s3cret-value-16chars")
        .update(`1789603200.${request?.body}`)
        .digest("hex")}`,
    );
  });

  it("requires explicit webhook payloads and supports unsigned test events", async () => {
    const transport = successfulTransport();
    await expect(
      deliverAlert(
        { type: "webhook", config: { url: "https://example.com/hook" } },
        "hello",
        undefined,
        { transport },
      ),
    ).rejects.toMatchObject({ retryable: false });

    await deliverAlert(
      { type: "webhook", config: { url: "https://example.com/hook" } },
      "hello",
      { event: "alert.test", projectId: "project-1" },
      { transport },
    );
    expect(transport.mock.calls[0]?.[0].headers["x-lens-signature"]).toBeUndefined();
    expect(transport.mock.calls[0]?.[0].headers["x-lens-topic"]).toBe("alert.test");
  });

  it.each([408, 425, 429, 500, 503])("retries transient HTTP %s responses", async (status) => {
    const transport = vi.fn<AlertTransport>().mockResolvedValue({
      status,
      body: "slow down",
      retryAfter: status === 429 ? "120" : undefined,
    });
    const error = await deliverAlert(
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      "hello",
      undefined,
      { transport },
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      retryable: true,
      status,
      ...(status === 429 ? { retryAfterMs: 120_000 } : {}),
    });
  });

  it("does not retry client errors and treats network failures as transient", async () => {
    const clientError = vi.fn<AlertTransport>().mockResolvedValue({
      status: 400,
      body: "bad request",
      retryAfter: undefined,
    });
    await expect(
      deliverAlert(
        { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
        "hello",
        undefined,
        { transport: clientError },
      ),
    ).rejects.toMatchObject({ retryable: false, status: 400 });

    const unavailable = vi.fn<AlertTransport>().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      deliverAlert(
        { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
        "hello",
        undefined,
        { transport: unavailable },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("validates timeouts and uses provider retry delays in BullMQ backoff", async () => {
    await expect(
      deliverAlert(
        { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
        "hello",
        undefined,
        { timeoutMs: 0, transport: successfulTransport() },
      ),
    ).rejects.toBeInstanceOf(RangeError);
    const error = new AlertDeliveryError("rate limited", true, 429, 10_000);
    expect(alertDeliveryBackoffStrategy(2, alertDeliveryBackoffType, error)).toBe(10_000);
    expect(() => alertDeliveryBackoffStrategy(1, "unknown", error)).toThrow(
      "Unsupported backoff strategy",
    );
  });
});

describe("public webhook transport", () => {
  it.each([
    "http://127.0.0.1/hook",
    "http://10.0.0.1/hook",
    "http://[::1]/hook",
    "http://[::ffff:127.0.0.1]/hook",
  ])("blocks non-public target %s", async (url) => {
    await expect(
      sendPublicHttpRequest({ url, body: "{}", headers: {}, timeoutMs: 100 }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("rejects URL credentials and unsupported protocols", async () => {
    await expect(
      sendPublicHttpRequest({ url: "not a URL", body: "{}", headers: {}, timeoutMs: 100 }),
    ).rejects.toMatchObject({ message: "Webhook URL is invalid", retryable: false });
    await expect(
      sendPublicHttpRequest({
        url: "https://user:pass@example.com/hook",
        body: "{}",
        headers: {},
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ retryable: false });
    await expect(
      sendPublicHttpRequest({ url: "file:///tmp/hook", body: "{}", headers: {}, timeoutMs: 100 }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("pins DNS resolution and sends bounded HTTP responses", async () => {
    nodeMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mockNodeResponse(nodeMocks.httpRequest, {
      status: 202,
      body: "x".repeat(250),
      retryAfter: ["5"],
    });

    const response = await sendPublicHttpRequest({
      url: "http://receiver.example:8080/hook?q=1",
      body: '{"ok":true}',
      headers: { "x-test": "yes" },
      timeoutMs: 500,
    });

    expect(response).toEqual({ status: 202, body: "x".repeat(200), retryAfter: "5" });
    expect(nodeMocks.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "93.184.216.34",
        port: "8080",
        path: "/hook?q=1",
        headers: expect.objectContaining({ host: "receiver.example:8080", "x-test": "yes" }),
      }),
      expect.any(Function),
    );
  });

  it("uses pinned TLS server names and exposes connection failures", async () => {
    nodeMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mockNodeResponse(nodeMocks.httpsRequest);
    await expect(
      sendPublicHttpRequest({
        url: "https://receiver.example/hook",
        body: "{}",
        headers: {},
        timeoutMs: 500,
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(nodeMocks.httpsRequest).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "93.184.216.34", servername: "receiver.example" }),
      expect.any(Function),
    );

    mockNodeResponse(nodeMocks.httpsRequest);
    await expect(
      sendPublicHttpRequest({
        url: "https://93.184.216.34/hook",
        body: "{}",
        headers: {},
        timeoutMs: 500,
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(nodeMocks.httpsRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ hostname: "93.184.216.34", servername: undefined }),
      expect.any(Function),
    );

    nodeMocks.lookup.mockResolvedValue([]);
    await expect(
      sendPublicHttpRequest({
        url: "https://missing.example/hook",
        body: "{}",
        headers: {},
        timeoutMs: 500,
      }),
    ).rejects.toThrow("did not resolve");
  });

  it("rejects when the response stream fails", async () => {
    nodeMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mockNodeResponse(nodeMocks.httpRequest, { streamError: new Error("response reset") });

    await expect(
      sendPublicHttpRequest({
        url: "http://receiver.example/hook",
        body: "{}",
        headers: {},
        timeoutMs: 500,
      }),
    ).rejects.toThrow("response reset");
  });
});
