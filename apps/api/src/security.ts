import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createIngestionKey(pepper: string): {
  key: string;
  prefix: string;
  hash: string;
} {
  const prefix = randomBytes(6).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const key = `lens_ingest_${prefix}_${secret}`;
  return { key, prefix, hash: hashIngestionKey(key, pepper) };
}

export function ingestionKeyPrefix(key: string): string | undefined {
  const match = /^lens_ingest_([A-Za-z0-9_-]{8})_[A-Za-z0-9_-]{40,}$/.exec(key);
  return match?.[1];
}

export function hashIngestionKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}

export function verifyIngestionKey(key: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashIngestionKey(key, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
