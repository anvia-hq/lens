import { describe, expect, it } from "vitest";
import { decodeOtlpRequest, defaultRedactionPatterns, normalizeOtlpRequest } from "../src/index.js";

const traceId = "00112233445566778899aabbccddeeff";
const spanId = "0011223344556677";
const now = new Date("2026-08-05T00:00:00.000Z");

function normalize(
  attributes: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  redactionPatterns?: readonly string[],
) {
  const request = decodeOtlpRequest(
    new TextEncoder().encode(
      JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "support-service" } },
                { key: "service.version", value: { stringValue: "2.4.1" } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: "telemetry-test", version: "1.0.0" },
                spans: [
                  {
                    traceId,
                    spanId,
                    name: "model.turn",
                    kind: 3,
                    startTimeUnixNano: "1785916800000000000",
                    endTimeUnixNano: "1785916800123000000",
                    attributes: Object.entries(attributes).map(([key, value]) => ({
                      key,
                      value,
                    })),
                    status: { code: 1 },
                    ...overrides,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ),
    "application/json",
  );
  return normalizeOtlpRequest(request, {
    projectId: "00000000-0000-0000-0000-000000000001",
    retentionDays: 30,
    now,
    ...(redactionPatterns === undefined ? {} : { additionalRedactionPatterns: redactionPatterns }),
  });
}

describe("trace normalization", () => {
  it("normalizes model, usage, cost, and resource fields", () => {
    const result = normalize({
      "langfuse.observation.type": { stringValue: "generation" },
      "langfuse.observation.model.name": { stringValue: "gpt-test" },
      "langfuse.observation.usage_details": {
        stringValue: '{"input":12,"cached_input_tokens":5,"output":4,"total":16}',
      },
      "langfuse.observation.cost_details": {
        stringValue: '{"input":0.0012,"output":0.0008,"total":0.002}',
      },
      "deployment.environment.name": { stringValue: "production" },
      "anvia.release": { stringValue: "2026.08.05" },
    });

    expect(result).toMatchObject({ rejectedSpans: 0, errors: [] });
    expect(result.spans[0]).toMatchObject({
      serviceName: "support-service",
      serviceVersion: "2.4.1",
      environment: "production",
      release: "2026.08.05",
      model: "gpt-test",
      inputTokens: 12,
      cachedInputTokens: 5,
      outputTokens: 4,
      totalTokens: 16,
      inputCost: 0.0012,
      outputCost: 0.0008,
      totalCost: 0.002,
      durationNano: "123000000",
      status: "ok",
    });
  });

  it.each([
    [
      {
        "anvia.generation.model": "default",
        "anvia.generation.default_model": "configured-model",
      },
      "configured-model",
    ],
    [
      {
        "anvia.generation.model": "explicit-model",
        "anvia.generation.default_model": "configured-model",
      },
      "explicit-model",
    ],
    [
      {
        "anvia.generation.model": " DEFAULT ",
        "gen_ai.request.model": "request-model",
      },
      "request-model",
    ],
    [
      {
        "langfuse.observation.model.name": "langfuse-model",
        "anvia.generation.model_id": "anvia-model",
      },
      "langfuse-model",
    ],
  ])("applies model precedence for %#", (values, expected) => {
    const attributes = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { stringValue: value }]),
    );
    expect(normalize(attributes).spans[0]?.model).toBe(expected);
  });

  it("preserves the complete Langfuse observation taxonomy", () => {
    const kinds = [
      "span",
      "generation",
      "event",
      "embedding",
      "agent",
      "tool",
      "chain",
      "retriever",
      "evaluator",
      "guardrail",
    ] as const;
    const request = decodeOtlpRequest(
      new TextEncoder().encode(
        JSON.stringify({
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: kinds.map((kind, index) => ({
                    traceId,
                    spanId: (index + 1).toString(16).padStart(16, "0"),
                    name: `langfuse.${kind}`,
                    startTimeUnixNano: String(1000 + index * 2),
                    endTimeUnixNano: String(1001 + index * 2),
                    attributes: [
                      { key: "langfuse.observation.type", value: { stringValue: kind } },
                    ],
                  })),
                },
              ],
            },
          ],
        }),
      ),
      "application/json",
    );

    expect(
      normalizeOtlpRequest(request, { projectId: "project", retentionDays: null, now }).spans.map(
        (span) => span.observationKind,
      ),
    ).toEqual(kinds);
  });

  it("redacts nested payloads, events, links, and custom patterns", () => {
    expect(Object.isFrozen(defaultRedactionPatterns)).toBe(true);
    const result = normalize(
      {
        "anvia.generation.input": {
          stringValue: '{"user":"hello","password":"hidden","nested":{"token":"custom"}}',
        },
        "metadata.secret": { stringValue: "hidden" },
      },
      {
        events: [
          {
            name: "event",
            attributes: [{ key: "password", value: { stringValue: "hidden" } }],
          },
        ],
        links: [
          {
            traceId,
            spanId,
            attributes: [{ key: "custom.token", value: { stringValue: "hidden" } }],
          },
        ],
      },
      ["*.token"],
    );

    expect(result.spans[0]?.input).toEqual({
      user: "hello",
      password: "[REDACTED]",
      nested: { token: "[REDACTED]" },
    });
    expect(result.spans[0]?.spanAttributes["metadata.secret"]).toBe("[REDACTED]");
    expect(result.spans[0]?.events[0]).toMatchObject({
      attributes: { password: "[REDACTED]" },
    });
    expect(result.spans[0]?.links[0]).toMatchObject({
      attributes: { "custom.token": "[REDACTED]" },
    });
  });

  it("rejects unsafe integer strings instead of emitting Infinity", () => {
    const result = normalize({
      "anvia.usage.input_tokens": { intValue: "9".repeat(400) },
    });
    expect(result.spans[0]?.inputTokens).toBe(0);
    expect(Number.isFinite(result.spans[0]?.inputTokens)).toBe(true);
  });

  it("rejects invalid spans with bounded error messages", () => {
    const result = normalize({}, { traceId: "bad", name: "x".repeat(1_000) });
    expect(result.rejectedSpans).toBe(1);
    expect(result.spans).toEqual([]);
    expect(result.errors[0]?.length).toBeLessThan(180);
  });

  it("validates normalization options and produces unique versions", () => {
    expect(() =>
      normalizeOtlpRequest({ resourceSpans: [] }, { projectId: "project", retentionDays: -1 }),
    ).toThrow("Retention days");

    const first = normalize({}).spans[0]?.ingestVersion;
    const second = normalize({}).spans[0]?.ingestVersion;
    expect(BigInt(second ?? 0)).toBeGreaterThan(BigInt(first ?? 0));
  });
});
