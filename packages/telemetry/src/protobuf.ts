import type { JsonValue } from "@lens/contracts";
import type {
  OtlpEvent,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpLink,
  OtlpResourceSpans,
  OtlpScopeSpans,
  OtlpSpan,
} from "./types.js";

class Reader {
  offset = 0;

  constructor(readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.bytes[this.offset++];
      if (byte === undefined) throw new Error("Unexpected end of protobuf varint");
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new Error("Invalid protobuf varint");
  }

  tag(): { field: number; wire: number } {
    const tag = Number(this.varint());
    return { field: tag >>> 3, wire: tag & 7 };
  }

  fixed64(): bigint {
    if (this.offset + 8 > this.bytes.length) throw new Error("Unexpected end of protobuf fixed64");
    let value = 0n;
    for (let index = 0; index < 8; index += 1) {
      value |= BigInt(this.bytes[this.offset + index] ?? 0) << BigInt(index * 8);
    }
    this.offset += 8;
    return value;
  }

  fixed32(): number {
    if (this.offset + 4 > this.bytes.length) throw new Error("Unexpected end of protobuf fixed32");
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
    const value = view.getUint32(0, true);
    this.offset += 4;
    return value;
  }

  double(): number {
    if (this.offset + 8 > this.bytes.length) throw new Error("Unexpected end of protobuf double");
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
    const value = view.getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  data(): Uint8Array {
    const length = Number(this.varint());
    const end = this.offset + length;
    if (!Number.isSafeInteger(length) || end > this.bytes.length) {
      throw new Error("Invalid protobuf length-delimited field");
    }
    const value = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  string(): string {
    return new TextDecoder().decode(this.data());
  }

  message<T>(decoder: (reader: Reader) => T): T {
    return decoder(new Reader(this.data()));
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.offset += 8;
    else if (wire === 2) this.data();
    else if (wire === 5) this.offset += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
    if (this.offset > this.bytes.length) throw new Error("Unexpected end of protobuf field");
  }
}

const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

function integerValue(value: bigint): JsonValue {
  const signed = value > 0x7fff_ffff_ffff_ffffn ? value - 0x1_0000_0000_0000_0000n : value;
  return signed >= Number.MIN_SAFE_INTEGER && signed <= Number.MAX_SAFE_INTEGER
    ? Number(signed)
    : signed.toString();
}

function decodeAnyValue(reader: Reader): JsonValue {
  let value: JsonValue = null;
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) value = reader.string();
    else if (field === 2) value = reader.varint() !== 0n;
    else if (field === 3) value = integerValue(reader.varint());
    else if (field === 4) value = reader.double();
    else if (field === 5) value = reader.message(decodeArrayValue);
    else if (field === 6) value = reader.message(decodeKeyValueList);
    else if (field === 7) value = Buffer.from(reader.data()).toString("base64");
    else reader.skip(wire);
  }
  return value;
}

function decodeArrayValue(reader: Reader): JsonValue[] {
  const values: JsonValue[] = [];
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) values.push(reader.message(decodeAnyValue));
    else reader.skip(wire);
  }
  return values;
}

function decodeKeyValue(reader: Reader): OtlpKeyValue {
  let key = "";
  let value: JsonValue = null;
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) key = reader.string();
    else if (field === 2) value = reader.message(decodeAnyValue);
    else reader.skip(wire);
  }
  return { key, value };
}

function decodeKeyValueList(reader: Reader): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      const item = reader.message(decodeKeyValue);
      result[item.key] = item.value;
    } else reader.skip(wire);
  }
  return result;
}

function decodeResource(reader: Reader): { attributes: OtlpKeyValue[] } {
  const attributes: OtlpKeyValue[] = [];
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) attributes.push(reader.message(decodeKeyValue));
    else reader.skip(wire);
  }
  return { attributes };
}

function decodeScope(reader: Reader): OtlpScopeSpans["scope"] {
  const scope: OtlpScopeSpans["scope"] = { name: "", version: "", attributes: [] };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) scope.name = reader.string();
    else if (field === 2) scope.version = reader.string();
    else if (field === 3) scope.attributes.push(reader.message(decodeKeyValue));
    else reader.skip(wire);
  }
  return scope;
}

function decodeEvent(reader: Reader): OtlpEvent {
  const event: OtlpEvent = {
    timeUnixNano: "0",
    name: "",
    attributes: [],
    droppedAttributesCount: 0,
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) event.timeUnixNano = reader.fixed64().toString();
    else if (field === 2) event.name = reader.string();
    else if (field === 3) event.attributes.push(reader.message(decodeKeyValue));
    else if (field === 4) event.droppedAttributesCount = Number(reader.varint());
    else reader.skip(wire);
  }
  return event;
}

function decodeLink(reader: Reader): OtlpLink {
  const link: OtlpLink = {
    traceId: "",
    spanId: "",
    traceState: "",
    attributes: [],
    droppedAttributesCount: 0,
    flags: 0,
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) link.traceId = hex(reader.data());
    else if (field === 2) link.spanId = hex(reader.data());
    else if (field === 3) link.traceState = reader.string();
    else if (field === 4) link.attributes.push(reader.message(decodeKeyValue));
    else if (field === 5) link.droppedAttributesCount = Number(reader.varint());
    else if (field === 6) link.flags = Number(reader.varint());
    else reader.skip(wire);
  }
  return link;
}

function decodeStatus(reader: Reader): OtlpSpan["status"] {
  const status = { code: 0, message: "" };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 2) status.message = reader.string();
    else if (field === 3) status.code = Number(reader.varint());
    else reader.skip(wire);
  }
  return status;
}

function decodeSpan(reader: Reader): OtlpSpan {
  const span: OtlpSpan = {
    traceId: "",
    spanId: "",
    parentSpanId: "",
    traceState: "",
    flags: 0,
    name: "",
    kind: 0,
    startTimeUnixNano: "0",
    endTimeUnixNano: "0",
    attributes: [],
    events: [],
    links: [],
    status: { code: 0, message: "" },
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) span.traceId = hex(reader.data());
    else if (field === 2) span.spanId = hex(reader.data());
    else if (field === 3) span.traceState = reader.string();
    else if (field === 4) span.parentSpanId = hex(reader.data());
    else if (field === 5) span.flags = Number(reader.varint());
    else if (field === 6) span.name = reader.string();
    else if (field === 7) span.kind = Number(reader.varint());
    else if (field === 8) span.startTimeUnixNano = reader.fixed64().toString();
    else if (field === 9) span.endTimeUnixNano = reader.fixed64().toString();
    else if (field === 10) span.attributes.push(reader.message(decodeKeyValue));
    else if (field === 12) span.events.push(reader.message(decodeEvent));
    else if (field === 14) span.links.push(reader.message(decodeLink));
    else if (field === 16) span.status = reader.message(decodeStatus);
    else reader.skip(wire);
  }
  return span;
}

function decodeScopeSpans(reader: Reader): OtlpScopeSpans {
  const scopeSpans: OtlpScopeSpans = {
    scope: { name: "", version: "", attributes: [] },
    spans: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) scopeSpans.scope = reader.message(decodeScope);
    else if (field === 2) scopeSpans.spans.push(reader.message(decodeSpan));
    else if (field === 3) scopeSpans.schemaUrl = reader.string();
    else reader.skip(wire);
  }
  return scopeSpans;
}

function decodeResourceSpans(reader: Reader): OtlpResourceSpans {
  const resourceSpans: OtlpResourceSpans = {
    resource: { attributes: [] },
    scopeSpans: [],
    schemaUrl: "",
  };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) resourceSpans.resource = reader.message(decodeResource);
    else if (field === 2) resourceSpans.scopeSpans.push(reader.message(decodeScopeSpans));
    else if (field === 3) resourceSpans.schemaUrl = reader.string();
    else reader.skip(wire);
  }
  return resourceSpans;
}

export function decodeProtobufRequest(bytes: Uint8Array): OtlpExportRequest {
  const request: OtlpExportRequest = { resourceSpans: [] };
  const reader = new Reader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) request.resourceSpans.push(reader.message(decodeResourceSpans));
    else reader.skip(wire);
  }
  return request;
}

function writeVarint(value: bigint): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0x7fn) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return bytes;
}

export function encodeProtobufResponse(rejectedSpans = 0, errorMessage = ""): Uint8Array {
  if (rejectedSpans === 0 && errorMessage.length === 0) return new Uint8Array();
  const partial: number[] = [];
  if (rejectedSpans > 0) partial.push(8, ...writeVarint(BigInt(rejectedSpans)));
  if (errorMessage.length > 0) {
    const message = new TextEncoder().encode(errorMessage);
    partial.push(18, ...writeVarint(BigInt(message.length)), ...message);
  }
  return Uint8Array.from([10, ...writeVarint(BigInt(partial.length)), ...partial]);
}
