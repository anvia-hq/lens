import { describe, expect, it } from "vitest";
import {
  decodeOtlpRequest,
  encodeOtlpResponse,
  globMatch,
  normalizeOtlpRequest,
} from "../src/index";

const traceId = "00112233445566778899aabbccddeeff";
const spanId = "0011223344556677";

describe("OTLP ingestion", () => {
  it("normalizes Anvia attributes and redacts before queueing", () => {
    const request = decodeOtlpRequest(
      new TextEncoder().encode(
        JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: "service.name", value: { stringValue: "support-service" } },
                  {
                    key: "http.request.header.authorization",
                    value: { stringValue: "Bearer secret" },
                  },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: "@anvia/otel", version: "0.2.14" },
                  spans: [
                    {
                      traceId,
                      spanId,
                      name: "model.turn.1",
                      kind: 3,
                      startTimeUnixNano: "1785916800000000000",
                      endTimeUnixNano: "1785916800123000000",
                      attributes: [
                        { key: "anvia.generation.model", value: { stringValue: "gpt-test" } },
                        {
                          key: "anvia.generation.input",
                          value: { stringValue: '[{"role":"user","content":"hello"}]' },
                        },
                        { key: "anvia.usage.input_tokens", value: { intValue: "12" } },
                        { key: "anvia.usage.output_tokens", value: { intValue: "4" } },
                        { key: "metadata.secret", value: { stringValue: "do-not-store" } },
                      ],
                      status: { code: 1 },
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
    const result = normalizeOtlpRequest(request, {
      projectId: "00000000-0000-0000-0000-000000000001",
      retentionDays: 30,
      redactionPatterns: ["metadata.*"],
      now: new Date("2026-08-05T00:00:00.000Z"),
    });
    expect(result.rejectedSpans).toBe(0);
    expect(result.spans[0]).toMatchObject({
      observationKind: "generation",
      serviceName: "support-service",
      model: "gpt-test",
      inputTokens: 12,
      outputTokens: 4,
      durationNano: "123000000",
      status: "ok",
    });
    expect(result.spans[0]?.resourceAttributes["http.request.header.authorization"]).toBe(
      "[REDACTED]",
    );
    expect(result.spans[0]?.spanAttributes["metadata.secret"]).toBe("[REDACTED]");
    expect(result.spans[0]?.input).toEqual([{ role: "user", content: "hello" }]);
  });

  it("decodes a binary protobuf export request", () => {
    const span = message([
      bytesField(1, hexBytes(traceId)),
      bytesField(2, hexBytes(spanId)),
      stringField(6, "agent.support"),
      varintField(7, 1n),
      fixed64Field(8, 1_785_916_800_000_000_000n),
      fixed64Field(9, 1_785_916_800_100_000_000n),
      messageField(10, keyValue("anvia.trace.name", stringAny("support"))),
      messageField(16, message([varintField(3, 1n)])),
    ]);
    const scopeSpans = message([messageField(2, span)]);
    const resourceSpans = message([messageField(2, scopeSpans)]);
    const request = decodeOtlpRequest(
      message([messageField(1, resourceSpans)]),
      "application/x-protobuf",
    );
    expect(request.resourceSpans[0]?.scopeSpans[0]?.spans[0]).toMatchObject({
      traceId,
      spanId,
      name: "agent.support",
      startTimeUnixNano: "1785916800000000000",
      endTimeUnixNano: "1785916800100000000",
      status: { code: 1 },
    });
  });

  it("rejects invalid IDs and writes OTLP partial-success responses", () => {
    const request = decodeOtlpRequest(
      new TextEncoder().encode(
        JSON.stringify({
          resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: "bad", spanId, name: "bad" }] }] }],
        }),
      ),
      "application/json",
    );
    const result = normalizeOtlpRequest(request, {
      projectId: "00000000-0000-0000-0000-000000000001",
      retentionDays: null,
    });
    expect(result.rejectedSpans).toBe(1);
    expect(
      JSON.parse(new TextDecoder().decode(encodeOtlpResponse("application/json", 1, "bad"))),
    ).toEqual({
      partialSuccess: { rejectedSpans: "1", errorMessage: "bad" },
    });
    expect(encodeOtlpResponse("application/x-protobuf", 1, "bad").byteLength).toBeGreaterThan(0);
  });

  it("matches case-insensitive attribute globs", () => {
    expect(globMatch("metadata.*", "metadata.secret")).toBe(true);
    expect(globMatch("*.api_key", "provider.API_KEY")).toBe(true);
    expect(globMatch("*.password", "metadata.token")).toBe(false);
  });
});

function message(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function varint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0x7fn) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Uint8Array.from(bytes);
}

function varintField(field: number, value: bigint): Uint8Array {
  return message([varint(BigInt(field << 3)), varint(value)]);
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return message([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]);
}

function stringField(field: number, value: string): Uint8Array {
  return bytesField(field, new TextEncoder().encode(value));
}

function messageField(field: number, value: Uint8Array): Uint8Array {
  return bytesField(field, value);
}

function fixed64Field(field: number, value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1)
    bytes[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  return message([varint(BigInt((field << 3) | 1)), bytes]);
}

function stringAny(value: string): Uint8Array {
  return stringField(1, value);
}

function keyValue(key: string, value: Uint8Array): Uint8Array {
  return message([stringField(1, key), messageField(2, value)]);
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}
