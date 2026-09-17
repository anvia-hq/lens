import { describe, expect, it } from "vitest";
import {
  decodeOtlpLogsRequest,
  decodeOtlpRequest,
  encodeOtlpResponse,
  globMatch,
} from "../src/index.js";
import {
  bytesField,
  doubleAny,
  fixed32Field,
  fixed64Field,
  hexBytes,
  intAny,
  keyValue,
  message,
  messageField,
  stringAny,
  stringField,
  varintField,
} from "./fixtures/protobuf.js";

const traceId = "00112233445566778899aabbccddeeff";
const spanId = "0011223344556677";

describe("OTLP codecs", () => {
  it.each(["[]", '"not-an-envelope"', "null", "true"])(
    "rejects a structurally invalid JSON root: %s",
    (payload) => {
      expect(() =>
        decodeOtlpRequest(new TextEncoder().encode(payload), "application/json"),
      ).toThrow("must be an object");
    },
  );

  it("rejects malformed JSON field types and AnyValues", () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(() =>
      decodeOtlpRequest(encode({ resourceSpans: "invalid" }), "application/json"),
    ).toThrow("resourceSpans must be an array");
    expect(() =>
      decodeOtlpRequest(
        encode({
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      attributes: [{ key: "invalid", value: { boolValue: "false" } }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        "application/json",
      ),
    ).toThrow("boolValue must be a boolean");
    expect(() =>
      decodeOtlpLogsRequest(
        encode({ resourceLogs: [{ scopeLogs: [{ logRecords: "invalid" }] }] }),
        "application/json",
      ),
    ).toThrow("logRecords must be an array");
  });

  it("decodes protobuf traces and all common AnyValue variants", () => {
    const arrayAny = messageField(
      5,
      message([messageField(1, stringAny("first")), messageField(1, intAny(2n))]),
    );
    const listAny = messageField(
      6,
      message([messageField(1, keyValue("nested", stringAny("value")))]),
    );
    const span = message([
      bytesField(1, hexBytes(traceId)),
      bytesField(2, hexBytes(spanId)),
      stringField(3, "vendor=lens"),
      stringField(5, "agent.support"),
      varintField(6, 1n),
      fixed64Field(7, 1_785_916_800_000_000_000n),
      fixed64Field(8, 1_785_916_800_100_000_000n),
      messageField(9, keyValue("string", stringAny("value"))),
      messageField(9, keyValue("bool", varintField(2, 1n))),
      messageField(9, keyValue("int", intAny(42n))),
      messageField(9, keyValue("double", doubleAny(1.5))),
      messageField(9, keyValue("array", arrayAny)),
      messageField(9, keyValue("list", listAny)),
      messageField(9, keyValue("bytes", bytesField(7, Uint8Array.of(1, 2, 3)))),
      messageField(11, message([stringField(2, "event")])),
      messageField(
        13,
        message([
          bytesField(1, hexBytes(traceId)),
          bytesField(2, hexBytes(spanId)),
          fixed32Field(6, 1),
        ]),
      ),
      messageField(15, message([varintField(3, 1n)])),
      fixed32Field(16, 1),
    ]);
    const request = message([
      messageField(1, message([messageField(2, message([messageField(2, span)]))])),
    ]);

    const decoded = decodeOtlpRequest(request, "application/x-protobuf");
    expect(decoded.resourceSpans[0]?.scopeSpans[0]?.spans[0]).toMatchObject({
      traceId,
      spanId,
      traceState: "vendor=lens",
      flags: 1,
      name: "agent.support",
      attributes: [
        { key: "string", value: "value" },
        { key: "bool", value: true },
        { key: "int", value: 42 },
        { key: "double", value: 1.5 },
        { key: "array", value: ["first", 2] },
        { key: "list", value: { nested: "value" } },
        { key: "bytes", value: "AQID" },
      ],
      events: [{ name: "event" }],
      links: [{ traceId, spanId, flags: 1 }],
      status: { code: 1 },
    });
  });

  it("decodes protobuf log records", () => {
    const record = message([
      fixed64Field(1, 1_786_089_600_000_000_000n),
      varintField(3, 9n),
      stringField(4, "INFO"),
      messageField(5, stringAny("body")),
      messageField(6, keyValue("name", stringAny("value"))),
      bytesField(9, hexBytes(traceId)),
      bytesField(10, hexBytes(spanId)),
      stringField(11, "gen_ai.evaluation.result"),
    ]);
    const request = message([
      messageField(1, message([messageField(2, message([messageField(2, record)]))])),
    ]);

    expect(decodeOtlpLogsRequest(request, "application/x-protobuf")).toMatchObject({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  severityNumber: 9,
                  severityText: "INFO",
                  body: "body",
                  traceId,
                  spanId,
                  eventName: "gen_ai.evaluation.result",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("rejects malformed protobuf tags, wire types, and lengths", () => {
    expect(() => decodeOtlpRequest(Uint8Array.of(0), "application/x-protobuf")).toThrow(
      "field number 0",
    );
    expect(() => decodeOtlpRequest(Uint8Array.of(8, 1), "application/x-protobuf")).toThrow(
      "wire type",
    );
    expect(() => decodeOtlpRequest(Uint8Array.of(10, 5, 1), "application/x-protobuf")).toThrow(
      "length-delimited",
    );
  });

  it("keeps simple JSON and protobuf trace decoding equivalent", () => {
    const json = decodeOtlpRequest(
      new TextEncoder().encode(
        JSON.stringify({
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId,
                      spanId,
                      name: "parity",
                      startTimeUnixNano: "1000",
                      endTimeUnixNano: "2000",
                      attributes: [{ key: "key", value: { stringValue: "value" } }],
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
    const span = message([
      bytesField(1, hexBytes(traceId)),
      bytesField(2, hexBytes(spanId)),
      stringField(5, "parity"),
      fixed64Field(7, 1000n),
      fixed64Field(8, 2000n),
      messageField(9, keyValue("key", stringAny("value"))),
    ]);
    const protobuf = decodeOtlpRequest(
      message([messageField(1, message([messageField(2, message([messageField(2, span)]))]))]),
      "application/x-protobuf",
    );

    expect(protobuf).toEqual(json);
  });

  it("matches case-insensitive attribute globs and validates response counts", () => {
    expect(globMatch("metadata.*", "metadata.secret")).toBe(true);
    expect(globMatch("*.api_key", "provider.API_KEY")).toBe(true);
    expect(globMatch("*.password", "metadata.token")).toBe(false);
    expect(() => encodeOtlpResponse("application/x-protobuf", -1)).toThrow(
      "non-negative safe integer",
    );
  });
});
