import type { NormalizeOptions } from "./normalization-types.js";
import {
  type AttributeRedactor,
  createAttributeRedactor,
  defaultRedactionPatterns,
} from "./redaction.js";

const NANOS_PER_MILLISECOND = 1_000_000n;
const MILLIS_PER_DAY = 86_400_000;
let lastIngestVersion = 0n;

export type IngestionContext = {
  expiresAt: string | null;
  ingestedAt: string;
  nextIngestVersion: () => string;
  now: Date;
  redact: AttributeRedactor;
};

export function createIngestionContext(options: NormalizeOptions): IngestionContext {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new TypeError("Normalization time must be valid");
  if (
    options.retentionDays !== null &&
    (!Number.isSafeInteger(options.retentionDays) || options.retentionDays < 0)
  ) {
    throw new TypeError("Retention days must be a non-negative integer or null");
  }

  const expiresAt =
    options.retentionDays === null
      ? null
      : new Date(now.getTime() + options.retentionDays * MILLIS_PER_DAY).toISOString();
  const ingestedAt = now.toISOString();
  let sequence = 0n;

  return {
    expiresAt,
    ingestedAt,
    now,
    redact: createAttributeRedactor([
      ...defaultRedactionPatterns,
      ...(options.additionalRedactionPatterns ?? []),
    ]),
    nextIngestVersion: () => {
      const candidate = BigInt(now.getTime()) * NANOS_PER_MILLISECOND + sequence;
      sequence += 1n;
      lastIngestVersion = candidate > lastIngestVersion ? candidate : lastIngestVersion + 1n;
      return lastIngestVersion.toString();
    },
  };
}
