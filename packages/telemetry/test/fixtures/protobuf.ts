export function message(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function varint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0x7fn) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Uint8Array.from(bytes);
}

export function varintField(field: number, value: bigint): Uint8Array {
  return message([varint(BigInt(field << 3)), varint(value)]);
}

export function bytesField(field: number, value: Uint8Array): Uint8Array {
  return message([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]);
}

export function stringField(field: number, value: string): Uint8Array {
  return bytesField(field, new TextEncoder().encode(value));
}

export function messageField(field: number, value: Uint8Array): Uint8Array {
  return bytesField(field, value);
}

export function fixed32Field(field: number, value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return message([varint(BigInt((field << 3) | 5)), bytes]);
}

export function fixed64Field(field: number, value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
  return message([varint(BigInt((field << 3) | 1)), bytes]);
}

export function doubleField(field: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return message([varint(BigInt((field << 3) | 1)), bytes]);
}

export function stringAny(value: string): Uint8Array {
  return stringField(1, value);
}

export function intAny(value: bigint): Uint8Array {
  return varintField(3, value);
}

export function doubleAny(value: number): Uint8Array {
  return doubleField(4, value);
}

export function keyValue(key: string, value: Uint8Array): Uint8Array {
  return message([stringField(1, key), messageField(2, value)]);
}

export function hexBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}
