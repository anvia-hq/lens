import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const origin = "http://127.0.0.1:3001";
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(label, operation, timeout = 60_000) {
  const start = Date.now();
  let error;
  do {
    try {
      const value = await operation();
      if (value) return value;
    } catch (cause) {
      error = cause;
    }
    await delay(500);
  } while (Date.now() - start < timeout);
  throw new Error(`${label} timed out after ${timeout}ms`, { cause: error });
}

export class Fixture {
  constructor(url) {
    this.url = url;
    this.cookie = "";
    this.password = randomBytes(24).toString("hex");
  }
  async request(path, body, authorization) {
    const response = await fetch(`${this.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: this.cookie,
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    assert(response.ok, `${path}: HTTP ${response.status}`);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) this.cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    const value = await response.json();
    assert(!value.partialSuccess?.rejectedSpans, "OTLP rejected spans");
    assert(!value.partialSuccess?.rejectedLogRecords, "OTLP rejected evaluations");
    return value;
  }
  async initialize() {
    await this.request("/api/auth/bootstrap", {
      email: "release-fixture@example.invalid",
      name: "Release fixture",
      password: this.password,
    });
    const project = await this.request("/api/v1/projects", {
      name: "Release fixture",
      slug: "release-fixture",
    });
    this.projectId = project.id;
    const key = await this.request(`/api/v1/projects/${project.id}/keys`, {
      name: "Synthetic release fixture",
    });
    this.authorization = `Basic ${Buffer.from(`${key.publicKey}:${key.secretKey}`).toString("base64")}`;
  }
  async signIn() {
    this.cookie = "";
    await this.request("/api/auth/sign-in/email", {
      email: "release-fixture@example.invalid",
      password: this.password,
    });
    const projects = await this.request("/api/v1/projects");
    assert(
      projects.items.some((item) => item.id === this.projectId),
      "Project membership was lost",
    );
  }
  async submit() {
    const traceId = randomBytes(16).toString("hex");
    const spanId = randomBytes(8).toString("hex");
    const timestamp = BigInt(Date.now()) * 1_000_000n;
    await this.request(
      "/api/public/otel/v1/traces",
      {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: "service.name", value: { stringValue: "release-fixture" } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId,
                    name: "release-fixture",
                    kind: 1,
                    startTimeUnixNano: String(timestamp),
                    endTimeUnixNano: String(timestamp + 10_000_000n),
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      },
      this.authorization,
    );
    await this.request(
      "/api/public/otel/v1/logs",
      {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    traceId,
                    spanId,
                    timeUnixNano: String(timestamp),
                    eventName: "gen_ai.evaluation.result",
                    attributes: [
                      { key: "gen_ai.evaluation.name", value: { stringValue: "release-check" } },
                      { key: "gen_ai.evaluation.score.value", value: { doubleValue: 1 } },
                      { key: "anvia.eval.outcome", value: { stringValue: "pass" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      this.authorization,
    );
    return traceId;
  }
  async readable(traceId) {
    // The list uses materialized summaries; raw-span acceptance alone cannot pass.
    const base = `/api/v1/projects/${this.projectId}`;
    const traces = await this.request(`${base}/traces?traceId=${traceId}`);
    if (!traces.items.some((item) => item.traceId === traceId)) return false;
    const detail = await this.request(`${base}/traces/${traceId}`);
    assert.equal(detail.spans.length, 1);
    const evaluations = await this.request(`${base}/evaluations?traceId=${traceId}`);
    return evaluations.items.some(
      (item) =>
        item.traceId === traceId &&
        item.metricName === "release-check" &&
        item.outcome === "pass" &&
        item.numericValue === 1,
    );
  }
  async verify(traceId, timeout) {
    await until(`Trace and evaluation ${traceId}`, () => this.readable(traceId), timeout);
  }
}
