import type { JsonValue } from "@lens/contracts";
import {
  expectWire,
  integerValue,
  type ProtobufReader,
  safeUnsignedNumber,
} from "./protobuf-reader.js";
import type { OtlpKeyValue, OtlpScopeSpans } from "./types.js";

export function decodeAnyValue(reader: ProtobufReader): JsonValue {
  let value: JsonValue = null;
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "AnyValue.string_value");
      value = reader.string();
    } else if (field === 2) {
      expectWire(wire, 0, "AnyValue.bool_value");
      value = reader.varint() !== 0n;
    } else if (field === 3) {
      expectWire(wire, 0, "AnyValue.int_value");
      value = integerValue(reader.varint());
    } else if (field === 4) {
      expectWire(wire, 1, "AnyValue.double_value");
      value = reader.double();
    } else if (field === 5) {
      expectWire(wire, 2, "AnyValue.array_value");
      value = reader.message(decodeArrayValue);
    } else if (field === 6) {
      expectWire(wire, 2, "AnyValue.kvlist_value");
      value = reader.message(decodeKeyValueList);
    } else if (field === 7) {
      expectWire(wire, 2, "AnyValue.bytes_value");
      value = Buffer.from(reader.data()).toString("base64");
    } else reader.skip(wire);
  }
  return value;
}

function decodeArrayValue(reader: ProtobufReader): JsonValue[] {
  const values: JsonValue[] = [];
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "ArrayValue.values");
      values.push(reader.message(decodeAnyValue));
    } else reader.skip(wire);
  }
  return values;
}

export function decodeKeyValue(reader: ProtobufReader): OtlpKeyValue {
  let key = "";
  let value: JsonValue = null;
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "KeyValue.key");
      key = reader.string();
    } else if (field === 2) {
      expectWire(wire, 2, "KeyValue.value");
      value = reader.message(decodeAnyValue);
    } else reader.skip(wire);
  }
  return { key, value };
}

function decodeKeyValueList(reader: ProtobufReader): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "KeyValueList.values");
      const item = reader.message(decodeKeyValue);
      result[item.key] = item.value;
    } else reader.skip(wire);
  }
  return result;
}

export function decodeResource(reader: ProtobufReader): { attributes: OtlpKeyValue[] } {
  const attributes: OtlpKeyValue[] = [];
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "Resource.attributes");
      attributes.push(reader.message(decodeKeyValue));
    } else if (field === 2) {
      expectWire(wire, 0, "Resource.dropped_attributes_count");
      safeUnsignedNumber(reader.varint(), "Resource.dropped_attributes_count");
    } else reader.skip(wire);
  }
  return { attributes };
}

export function decodeScope(reader: ProtobufReader): OtlpScopeSpans["scope"] {
  const scope: OtlpScopeSpans["scope"] = { name: "", version: "", attributes: [] };
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1) {
      expectWire(wire, 2, "InstrumentationScope.name");
      scope.name = reader.string();
    } else if (field === 2) {
      expectWire(wire, 2, "InstrumentationScope.version");
      scope.version = reader.string();
    } else if (field === 3) {
      expectWire(wire, 2, "InstrumentationScope.attributes");
      scope.attributes.push(reader.message(decodeKeyValue));
    } else if (field === 4) {
      expectWire(wire, 0, "InstrumentationScope.dropped_attributes_count");
      safeUnsignedNumber(reader.varint(), "InstrumentationScope.dropped_attributes_count");
    } else reader.skip(wire);
  }
  return scope;
}
