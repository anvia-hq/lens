import { createHmac } from "node:crypto";
import type {
  AlertChannelConfig,
  AlertChannelType,
  AlertIncident,
  AlertRuleKind,
} from "@lens/contracts";

export type AlertDeliveryInput = {
  ruleName: string;
  kind: AlertRuleKind;
  summary: string;
  projectName: string;
  observedValue: number | null;
  threshold: number | null;
  incidentUrl: string;
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
  ) {
    super(message);
  }
}

// Correlated type/config pair; produced only by assertAlertTarget.
type AlertDeliveryTarget =
  | { type: "slack" | "discord"; config: { webhookUrl: string } }
  | { type: "telegram"; config: { botToken: string; chatId: string } }
  | { type: "webhook"; config: { url: string; secret?: string } };

// Channel rows are written through channelConfigFromInput and zod-validated at the
// API boundary, so type and config always correspond — but rows are persisted JSON,
// so re-check the pairing before trusting it (guards corrupted/migrated rows).
function assertAlertTarget(target: {
  type: AlertChannelType;
  config: AlertChannelConfig;
}): AlertDeliveryTarget {
  const { type, config } = target;
  if ("webhookUrl" in config) {
    if (type === "slack" || type === "discord") return { type, config };
  } else if ("botToken" in config && "chatId" in config) {
    if (type === "telegram") return { type, config };
  } else if ("url" in config) {
    if (type === "webhook") return { type, config };
  }
  throw new AlertDeliveryError(`alert channel type "${type}" has an invalid config shape`, false);
}

const maxErrorMessageLength = 200;

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Network failure / abort: transient by nature.
    const detail = error instanceof Error ? error.message : String(error);
    throw new AlertDeliveryError(`request failed: ${detail}`, true);
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, maxErrorMessageLength);
    throw new AlertDeliveryError(
      `delivery failed with status ${response.status}${text ? `: ${text}` : ""}`,
      response.status === 429 || response.status >= 500,
      response.status,
    );
  }
}

export async function deliverAlert(
  target: { type: AlertChannelType; config: AlertChannelConfig },
  message: string,
  webhookBody: { projectId: string; incident: AlertIncident } | undefined,
  timeoutMs = 10_000,
): Promise<void> {
  const channel = assertAlertTarget(target);
  switch (channel.type) {
    case "slack":
    case "discord": {
      const body =
        channel.type === "slack"
          ? JSON.stringify({ text: message })
          : JSON.stringify({ content: message.slice(0, 2000) }); // Discord 2000-char limit
      await postJson(channel.config.webhookUrl, body, {}, timeoutMs);
      return;
    }
    case "telegram": {
      // botToken is embedded in the URL — never log it.
      const url = `https://api.telegram.org/bot${channel.config.botToken}/sendMessage`;
      await postJson(
        url,
        JSON.stringify({ chat_id: channel.config.chatId, text: message }),
        {},
        timeoutMs,
      );
      return;
    }
    case "webhook": {
      const body = JSON.stringify({
        event: "alert.opened",
        projectId: webhookBody?.projectId ?? "",
        incident: webhookBody?.incident,
        message,
      });
      const headers: Record<string, string> = { "x-lens-topic": "alert.opened" };
      const { secret } = channel.config;
      if (secret) {
        // HMAC over the exact raw body string sent.
        headers["x-lens-signature"] =
          `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      }
      await postJson(channel.config.url, body, headers, timeoutMs);
      return;
    }
  }
}
