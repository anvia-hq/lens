import { describe, expect, it } from "vitest";
import {
  decodeOtlpLogsRequest,
  decodeOtlpRequest,
  encodeOtlpLogsResponse,
  encodeOtlpResponse,
  parseOtlpContentType,
} from "../src/index.js";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("OTLP transport", () => {
  it.each([
    ["application/json", "application/json"],
    [" APPLICATION/JSON ; charset=utf-8", "application/json"],
    ["application/x-protobuf", "application/x-protobuf"],
    ["text/plain", undefined],
    [undefined, undefined],
  ] as const)("parses content type %s", (value, expected) => {
    expect(parseOtlpContentType(value)).toBe(expected);
  });

  it("decodes empty JSON trace and log envelopes", () => {
    expect(decodeOtlpRequest(new TextEncoder().encode("{}"), "application/json")).toEqual({
      resourceSpans: [],
    });
    expect(decodeOtlpLogsRequest(new TextEncoder().encode("{}"), "application/json")).toEqual({
      resourceLogs: [],
    });
  });

  it("rejects malformed JSON payloads", () => {
    expect(() => decodeOtlpRequest(new TextEncoder().encode("{"), "application/json")).toThrow();
    expect(() =>
      decodeOtlpLogsRequest(new TextEncoder().encode("["), "application/json"),
    ).toThrow();
  });

  it("encodes empty and partial-success JSON responses", () => {
    expect(text(encodeOtlpResponse("application/json"))).toBe("{}");
    expect(JSON.parse(text(encodeOtlpResponse("application/json", 2, "invalid IDs")))).toEqual({
      partialSuccess: { rejectedSpans: "2", errorMessage: "invalid IDs" },
    });
    expect(JSON.parse(text(encodeOtlpLogsResponse("application/json", 3, "invalid logs")))).toEqual(
      {
        partialSuccess: { rejectedLogRecords: "3", errorMessage: "invalid logs" },
      },
    );
  });

  it("round-trips protobuf partial-success counters through stable wire bytes", () => {
    expect(Array.from(encodeOtlpResponse("application/x-protobuf"))).toEqual([]);
    expect(encodeOtlpResponse("application/x-protobuf", 2, "bad").byteLength).toBeGreaterThan(0);
    expect(encodeOtlpLogsResponse("application/x-protobuf", 2, "bad").byteLength).toBeGreaterThan(
      0,
    );
  });
});
