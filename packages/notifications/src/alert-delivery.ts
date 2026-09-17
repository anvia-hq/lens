import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import type { AlertDeliveryTarget, AlertIncident, AlertRuleKind } from "@lens/contracts";

export type AlertDeliveryInput = {
  ruleName: string;
  kind: AlertRuleKind;
  summary: string;
  projectName: string;
  observedValue: number | null;
  threshold: number | null;
  incidentUrl: string;
};

export type AlertWebhookPayload =
  | { event: "alert.opened"; projectId: string; incident: AlertIncident }
  | { event: "alert.test"; projectId: string };

export type AlertTransportRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

export type AlertTransportResponse = {
  status: number;
  body: string;
  retryAfter: string | undefined;
};

export type AlertTransport = (request: AlertTransportRequest) => Promise<AlertTransportResponse>;

export type AlertDeliveryOptions = {
  timeoutMs?: number;
  transport?: AlertTransport;
  now?: () => Date;
};

export function formatObserved(kind: AlertRuleKind, value: number): string {
  return kind === "trace_p95_latency_ms"
    ? `${Math.round(value)} ms`
    : `${(value * 100).toFixed(1)}%`;
}

export function renderAlertMessage(input: AlertDeliveryInput): string {
  const lines = [`[Anvia Lens] ${input.ruleName}`, input.summary, `Project: ${input.projectName}`];
  if (input.observedValue !== null) {
    const threshold =
      input.threshold !== null ? ` / threshold ${formatObserved(input.kind, input.threshold)}` : "";
    lines.push(`Observed: ${formatObserved(input.kind, input.observedValue)}${threshold}`);
  }
  lines.push(input.incidentUrl);
  return lines.join("\n");
}

export class AlertDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AlertDeliveryError";
  }
}

const maxErrorMessageLength = 200;
const maxRetryAfterMs = 60 * 60_000;
export const alertDeliveryBackoffType = "alert-delivery";

export function alertDeliveryBackoffStrategy(
  attemptsMade: number,
  type?: string,
  error?: Error,
): number {
  if (type !== alertDeliveryBackoffType) {
    throw new Error(`Unsupported backoff strategy: ${type}`);
  }
  const exponentialMs = 2 ** Math.max(0, attemptsMade - 1) * 1_000;
  const retryAfterMs = error instanceof AlertDeliveryError ? (error.retryAfterMs ?? 0) : 0;
  return Math.max(exponentialMs, retryAfterMs);
}

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  options: Required<Pick<AlertDeliveryOptions, "timeoutMs" | "transport">>,
): Promise<void> {
  let response: AlertTransportResponse;
  try {
    response = await options.transport({ url, body, headers, timeoutMs: options.timeoutMs });
  } catch (error) {
    if (error instanceof AlertDeliveryError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new AlertDeliveryError(`request failed: ${detail}`, true, undefined, undefined, {
      cause: error,
    });
  }
  if (response.status < 200 || response.status >= 300) {
    const detail = response.body.slice(0, maxErrorMessageLength);
    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;
    throw new AlertDeliveryError(
      `delivery failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      retryable,
      response.status,
      retryable ? parseRetryAfter(response.retryAfter) : undefined,
    );
  }
}

export async function deliverAlert(
  target: AlertDeliveryTarget,
  message: string,
  webhookPayload: AlertWebhookPayload | undefined,
  options: AlertDeliveryOptions = {},
): Promise<void> {
  const transport = options.transport ?? sendPublicHttpRequest;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Alert delivery timeout must be a positive safe integer");
  }
  const requestOptions = { transport, timeoutMs };
  switch (target.type) {
    case "slack":
      await postJson(
        target.config.webhookUrl,
        JSON.stringify({ text: message.slice(0, 40_000) }),
        {},
        requestOptions,
      );
      return;
    case "discord":
      await postJson(
        target.config.webhookUrl,
        JSON.stringify({ content: message.slice(0, 2_000) }),
        {},
        requestOptions,
      );
      return;
    case "telegram": {
      const url = `https://api.telegram.org/bot${target.config.botToken}/sendMessage`;
      await postJson(
        url,
        JSON.stringify({ chat_id: target.config.chatId, text: message.slice(0, 4_096) }),
        {},
        requestOptions,
      );
      return;
    }
    case "webhook": {
      if (webhookPayload === undefined) {
        throw new AlertDeliveryError("Webhook delivery payload is required", false);
      }
      const body = JSON.stringify({ ...webhookPayload, message });
      const timestamp = Math.floor((options.now?.() ?? new Date()).getTime() / 1_000).toString();
      const headers: Record<string, string> = {
        "x-lens-topic": webhookPayload.event,
        "x-lens-timestamp": timestamp,
      };
      const { secret } = target.config;
      if (secret) {
        const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
        headers["x-lens-signature"] = `t=${timestamp},v1=${signature}`;
      }
      await postJson(target.config.url, body, headers, requestOptions);
    }
  }
}

const blockedAddresses = createBlockedAddressList();

function createBlockedAddressList(): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    list.addSubnet(network, prefix, "ipv4");
  }
  for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["100::", 64],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    list.addSubnet(network, prefix, "ipv6");
  }
  return list;
}

async function publicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const normalizedHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  const literalFamily = isIP(normalizedHostname);
  const addresses = literalFamily
    ? [{ address: normalizedHostname, family: literalFamily }]
    : await lookup(normalizedHostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Webhook hostname did not resolve");
  for (const address of addresses) {
    const family = address.family === 6 ? "ipv6" : "ipv4";
    if (
      address.address.toLowerCase().startsWith("::ffff:") ||
      blockedAddresses.check(address.address, family)
    ) {
      throw new AlertDeliveryError("Webhook target resolves to a non-public address", false);
    }
  }
  const selected = addresses[0];
  if (selected === undefined) throw new Error("Webhook hostname did not resolve");
  return { address: selected.address, family: selected.family === 6 ? 6 : 4 };
}

export async function sendPublicHttpRequest(
  input: AlertTransportRequest,
): Promise<AlertTransportResponse> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch (error) {
    throw new AlertDeliveryError("Webhook URL is invalid", false, undefined, undefined, {
      cause: error,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AlertDeliveryError("Webhook URL must use HTTP or HTTPS", false);
  }
  if (url.username || url.password) {
    throw new AlertDeliveryError("Webhook URL cannot contain credentials", false);
  }
  const address = await publicAddress(url.hostname);
  const originalHostname =
    url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const requestOptions: RequestOptions = {
    protocol: url.protocol,
    hostname: address.address,
    family: address.family,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: "POST",
    servername:
      url.protocol === "https:" && isIP(originalHostname) === 0 ? originalHostname : undefined,
    headers: {
      host: url.host,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(input.body),
      ...input.headers,
    },
  };

  return new Promise((resolve, reject) => {
    const outgoing = request(requestOptions, (response) => {
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk: string) => {
        if (body.length < maxErrorMessageLength) {
          body += chunk.slice(0, maxErrorMessageLength - body.length);
        }
      });
      response.on("error", reject);
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          body,
          retryAfter: Array.isArray(response.headers["retry-after"])
            ? response.headers["retry-after"][0]
            : response.headers["retry-after"],
        }),
      );
    });
    outgoing.setTimeout(input.timeoutMs, () => outgoing.destroy(new Error("request timed out")));
    outgoing.on("error", reject);
    outgoing.end(input.body);
  });
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return undefined;
  return Math.min(Math.round(delay), maxRetryAfterMs);
}
