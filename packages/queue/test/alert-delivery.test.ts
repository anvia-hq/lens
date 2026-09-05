import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlertDeliveryError,
  type AlertDeliveryInput,
  deliverAlert,
  formatObserved,
  renderAlertMessage,
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

function firstCall(calls: unknown[][]): [string, RequestInit] {
  const call = calls.at(0);
  if (call === undefined) throw new Error("Expected a fetch call");
  return call as [string, RequestInit];
}

describe("renderAlertMessage", () => {
  it("formats latency rules in milliseconds", () => {
    expect(formatObserved("trace_p95_latency_ms", 812.4)).toBe("812 ms");
    expect(formatObserved("trace_error_rate", 0.1234)).toBe("12.3%");
  });

  it("renders the full plain-text message", () => {
    expect(renderAlertMessage(input)).toBe(
      [
        "[Anvia Lens] Production errors",
        "Trace error rate is 12.0% (threshold 5.0%)",
        "Project: Anvia",
        "Observed: 12.0% / threshold 5.0%",
        "http://localhost:3000/project-1/alerts/incident-1",
      ].join("\n"),
    );
  });

  it("omits the observed line for event alerts and the threshold clause when absent", () => {
    const event = renderAlertMessage({ ...input, observedValue: null, threshold: null });
    expect(event).not.toContain("Observed:");
    const partial = renderAlertMessage({ ...input, threshold: null });
    expect(partial).toContain("Observed: 12.0%");
    expect(partial).not.toMatch(/Observed:.*threshold/);
  });
});

describe("deliverAlert", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: { ok: boolean; status?: number; text?: string } = { ok: true }) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? 200,
      text: async () => response.text ?? "",
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts the message text to Slack and Discord webhooks", async () => {
    const fetchMock = stubFetch();
    await deliverAlert(
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      "hello",
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/x",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "hello" }) }),
    );
    await deliverAlert(
      { type: "discord", config: { webhookUrl: "https://discord.com/api/webhooks/1/x" } },
      "hello",
      undefined,
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://discord.com/api/webhooks/1/x",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "hello" }) }),
    );
  });

  it("truncates Discord messages to 2000 characters", async () => {
    const fetchMock = stubFetch();
    await deliverAlert(
      { type: "discord", config: { webhookUrl: "https://discord.com/api/webhooks/1/x" } },
      "x".repeat(2500),
      undefined,
    );
    const [, init] = firstCall(fetchMock.mock.calls);
    const body = JSON.parse(init.body as string) as { content: string };
    expect(body.content).toHaveLength(2000);
  });

  it("posts to the Telegram bot API", async () => {
    const fetchMock = stubFetch();
    await deliverAlert(
      { type: "telegram", config: { botToken: "123:abc", chatId: "@alerts" } },
      "hello",
      undefined,
    );
    const [url, init] = firstCall(fetchMock.mock.calls);
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "@alerts", text: "hello" });
  });

  it("signs webhook deliveries with HMAC over the exact raw body", async () => {
    const fetchMock = stubFetch();
    const incident = { id: "incident-1", summary: "boom" };
    await deliverAlert(
      {
        type: "webhook",
        config: { url: "https://example.com/hook", secret: "s3cret-value-16chars" },
      },
      "hello",
      { projectId: "project-1", incident: incident as never },
    );
    const [url, init] = firstCall(fetchMock.mock.calls);
    expect(url).toBe("https://example.com/hook");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-lens-topic"]).toBe("alert.opened");
    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({
      event: "alert.opened",
      projectId: "project-1",
      incident,
      message: "hello",
    });
    expect(headers["x-lens-signature"]).toBe(
      `sha256=${createHmac("sha256", "s3cret-value-16chars").update(body).digest("hex")}`,
    );
  });

  it("omits the signature header when no secret is configured", async () => {
    const fetchMock = stubFetch();
    await deliverAlert(
      { type: "webhook", config: { url: "https://example.com/hook" } },
      "hello",
      undefined,
    );
    const [, init] = firstCall(fetchMock.mock.calls);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-lens-topic"]).toBe("alert.opened");
    expect(headers["x-lens-signature"]).toBeUndefined();
  });

  it("maps HTTP failures to retryable errors for 429 and 5xx only", async () => {
    for (const status of [429, 500, 503]) {
      stubFetch({ ok: false, status, text: "slow down" });
      const error = await deliverAlert(
        { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
        "hello",
        undefined,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AlertDeliveryError);
      expect(error).toMatchObject({ retryable: true, status });
      expect((error as AlertDeliveryError).message).toContain("slow down");
    }
    stubFetch({ ok: false, status: 400, text: "bad request" });
    const error = await deliverAlert(
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      "hello",
      undefined,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ retryable: false, status: 400 });
  });

  it("treats network failures as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED")));
    const error = await deliverAlert(
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/x" } },
      "hello",
      undefined,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AlertDeliveryError);
    expect(error).toMatchObject({ retryable: true });
  });
});
