import type { JsonValue } from "@lens/contracts";

export class ProtobufReader {
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
    const field = tag >>> 3;
    if (field === 0) throw new Error("Invalid protobuf field number 0");
    return { field, wire: tag & 7 };
  }

  fixed64(): bigint {
    this.ensureAvailable(8, "fixed64");
    let value = 0n;
    for (let index = 0; index < 8; index += 1) {
      value |= BigInt(this.bytes[this.offset + index] ?? 0) << BigInt(index * 8);
    }
    this.offset += 8;
    return value;
  }

  fixed32(): number {
    this.ensureAvailable(4, "fixed32");
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
    const value = view.getUint32(0, true);
    this.offset += 4;
    return value;
  }

  double(): number {
    this.ensureAvailable(8, "double");
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
    const value = view.getFloat64(0, true);
    this.offset += 8;
    if (!Number.isFinite(value)) throw new Error("Protobuf double must be finite");
    return value;
  }

  data(): Uint8Array {
    const rawLength = this.varint();
    if (rawLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Invalid protobuf length-delimited field");
    }
    const length = Number(rawLength);
    const end = this.offset + length;
    if (!Number.isSafeInteger(end) || end > this.bytes.length) {
      throw new Error("Invalid protobuf length-delimited field");
    }
    const value = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  string(): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(this.data());
  }

  message<T>(decoder: (reader: ProtobufReader) => T): T {
    return decoder(new ProtobufReader(this.data()));
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.advance(8, "fixed64 field");
    else if (wire === 2) this.data();
    else if (wire === 5) this.advance(4, "fixed32 field");
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }

  private advance(length: number, label: string): void {
    this.ensureAvailable(length, label);
    this.offset += length;
  }

  private ensureAvailable(length: number, label: string): void {
    if (this.offset + length > this.bytes.length) {
      throw new Error(`Unexpected end of protobuf ${label}`);
    }
  }
}

export function expectWire(wire: number, expected: number, label: string): void {
  if (wire !== expected) {
    throw new Error(`Invalid protobuf wire type ${wire} for ${label}; expected ${expected}`);
  }
}

export function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function unixNano(reader: ProtobufReader, wire: number, label: string): string {
  if (wire === 1) return reader.fixed64().toString();
  if (wire === 0) return reader.varint().toString();
  throw new Error(`Invalid protobuf wire type ${wire} for ${label}`);
}

export function flagsValue(reader: ProtobufReader, wire: number, label: string): number {
  if (wire === 5) return reader.fixed32();
  if (wire === 0) return safeUnsignedNumber(reader.varint(), label);
  throw new Error(`Invalid protobuf wire type ${wire} for ${label}`);
}

export function safeUnsignedNumber(value: bigint, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

export function integerValue(value: bigint): JsonValue {
  const signed = value > 0x7fff_ffff_ffff_ffffn ? value - 0x1_0000_0000_0000_0000n : value;
  return signed >= Number.MIN_SAFE_INTEGER && signed <= Number.MAX_SAFE_INTEGER
    ? Number(signed)
    : signed.toString();
}
