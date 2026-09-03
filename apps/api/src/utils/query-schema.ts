import { z } from "zod";

/**
 * Shared zod building blocks for query-string validation.
 *
 * zValidator("query") hands schemas `string` for keys occurring once and
 * `string[]` for repeated keys, while the parsers these schemas replaced read
 * via `c.req.query(key)`, which returns the first occurrence. The `firstValue`
 * wrapper keeps that behavior. Declare object fields in the same order the
 * checks used to run: the first zod issue is the error clients see.
 */

/** Lowercased type shape hono's superRefine context satisfies. */
interface IssueContext {
  addIssue: (issue: { code: "custom"; message: string }) => void;
}

function singleText(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : undefined;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

/** Pass the first occurrence of a repeated key to the wrapped schema. */
export function firstValue<S extends z.ZodType>(schema: S) {
  return z.preprocess((value) => (Array.isArray(value) ? value[0] : value), schema);
}

/** Optional ISO date string; empty values are treated as absent. */
export function isoDate(key: "from" | "to") {
  return z.preprocess(
    (value) => emptyToUndefined(singleText(value)),
    z
      .string()
      .refine((value) => Number.isFinite(Date.parse(value)), {
        message: `${key} must be an ISO date`,
      })
      .optional(),
  );
}

/** Trimmed free-text filter capped at `max` characters; empty values are absent. */
export function clippedText(key: string, max = 256) {
  return z.preprocess(
    (value) => emptyToUndefined(singleText(value)?.trim()),
    z
      .string()
      .max(max, { message: `${key} must be at most ${max} characters` })
      .optional(),
  );
}

/** Trimmed enum value; empty values are absent. */
export function trimmedEnum<const E extends readonly [string, ...string[]]>(
  values: E,
  message: string,
) {
  return z.preprocess(
    (value) => emptyToUndefined(singleText(value)?.trim()),
    z.enum(values, { message }).optional(),
  );
}

/** Non-negative finite number; empty values are treated as absent. */
export function nonNegativeNumber(key: string) {
  const message = `${key} must be a non-negative number`;
  return z.preprocess(
    (value) => emptyToUndefined(singleText(value)),
    z.coerce
      .number({ message })
      .refine((value) => Number.isFinite(value) && value >= 0, { message })
      .optional(),
  );
}

/**
 * Repeated multi-value filter: trimmed, empties dropped, capped at 50 entries,
 * then deduplicated — matching `c.req.queries(key)` parsers. With `allowed`,
 * entries must be members and the output narrows to the literal union.
 */
export function valueList<const E extends readonly string[]>(
  queryKey: string,
  options?: { allowed?: E; allowedMessage?: string },
) {
  const allowed = options?.allowed;
  const allowedMessage = options?.allowedMessage;
  return z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      const list = (Array.isArray(value) ? value : [value])
        .map((entry) => entry.trim())
        .filter(Boolean);
      return list.length > 0 ? list : undefined;
    },
    z
      .array(z.string())
      .max(50, { message: `${queryKey} accepts at most 50 values` })
      .refine(
        (list) => allowed === undefined || list.every((entry) => allowed.includes(entry)),
        allowedMessage === undefined ? undefined : { message: allowedMessage },
      )
      .transform((list): E[number][] => Array.from(new Set(list)))
      .optional(),
  );
}

export const PAGE_SIZE_MESSAGE = "pageSize must be 25, 50, or 100";

export function pageField(message: string) {
  return firstValue(
    z.coerce
      .number({ message })
      .int({ message })
      .min(1, { message })
      .max(1_000_000, { message })
      .default(1),
  );
}

export function pageSizeField(fallback: 25 | 50 | 100) {
  return firstValue(
    z.coerce
      .number({ message: PAGE_SIZE_MESSAGE })
      .transform((value): 25 | 50 | 100 => value as 25 | 50 | 100)
      .refine((value) => value === 25 || value === 50 || value === 100, {
        message: PAGE_SIZE_MESSAGE,
      })
      .default(fallback),
  );
}

export function sortField<F extends string>(fields: readonly F[], fallback: F, message: string) {
  return firstValue(z.enum(fields, { message }).default(fallback));
}

export function orderField() {
  return firstValue(
    z.enum(["asc", "desc"], { message: "order must be asc or desc" }).default("desc"),
  );
}

/** Cross-field check: `from` must not parse after `to`. */
export function fromBeforeTo(value: { from?: string; to?: string }, ctx: IssueContext) {
  if (
    value.from !== undefined &&
    value.to !== undefined &&
    Date.parse(value.from) > Date.parse(value.to)
  ) {
    ctx.addIssue({ code: "custom", message: "from must not be after to" });
  }
}

/** Cross-field checks: each `min` key must not exceed its `max` counterpart. */
export function orderedPairs<K extends string>(pairs: readonly (readonly [K, K])[]) {
  return (value: { [P in K]?: number | undefined }, ctx: IssueContext) => {
    for (const [min, max] of pairs) {
      const low = value[min];
      const high = value[max];
      if (low !== undefined && high !== undefined && low > high) {
        ctx.addIssue({ code: "custom", message: `${min} must not exceed ${max}` });
      }
    }
  };
}

/** Drop keys whose value is `undefined`, mirroring the old conditional filters. */
export function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
