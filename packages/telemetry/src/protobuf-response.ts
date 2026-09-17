export function encodeProtobufPartialSuccess(rejectedItems = 0, errorMessage = ""): Uint8Array {
  if (!Number.isSafeInteger(rejectedItems) || rejectedItems < 0) {
    throw new TypeError("Rejected item count must be a non-negative safe integer");
  }
  if (rejectedItems === 0 && errorMessage.length === 0) return new Uint8Array();

  const partial: number[] = [];
  if (rejectedItems > 0) partial.push(8, ...writeVarint(BigInt(rejectedItems)));
  if (errorMessage.length > 0) {
    const message = new TextEncoder().encode(errorMessage);
    partial.push(18, ...writeVarint(BigInt(message.length)), ...message);
  }
  return Uint8Array.from([10, ...writeVarint(BigInt(partial.length)), ...partial]);
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
