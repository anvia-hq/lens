import type { NormalizeOptions } from "./normalization-types.js";
import {
  type AttributeRedactor,
  createAttributeRedactor,
  defaultRedactionPatterns,
} from "./redaction.js";

const NANOS_PER_MILLISECOND = 1_000_000n;
const MILLIS_PER_DAY = 86_400_000;

/**
 * Hands out strictly increasing ingest versions. Versions must stay unique and
 * ordered across every normalization that shares a clock, so the high-water mark
 * lives here instead of in a hidden module variable.
 */
export type IngestVersionClock = {
  /** Returns `candidate`, or one past the last version issued if that is not greater. */
  issue: (candidate: bigint) => bigint;
};

export function createIngestVersionClock(): IngestVersionClock {
  let last = 0n;
  return {
    issue: (candidate) => {
      last = candidate > last ? candidate : last + 1n;
      return last;
    },
  };
}

/** Clock shared by all normalizations in this process unless a caller supplies its own. */
export const processIngestVersionClock: IngestVersionClock = createIngestVersionClock();

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
  const clock = options.versionClock ?? processIngestVersionClock;
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
      return clock.issue(candidate).toString();
    },
  };
}
