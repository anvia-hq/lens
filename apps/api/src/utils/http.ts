import { zValidator } from "@hono/zod-validator";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { z } from "zod";
import type { AppEnv, SessionValue } from "./types.js";

export async function safeJson(c: Context): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await c.req.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function requiredSession(c: Context<AppEnv>): NonNullable<SessionValue> {
  const session = c.get("session");
  if (session === null) throw new Error("Session middleware invariant failed");
  return session;
}

export function apiError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

type InvalidMessage = string | ((error: { issues: Array<{ message: string }> }) => string);

function resolveInvalidMessage(
  message: InvalidMessage,
  error?: { issues: Array<{ message: string }> },
): string {
  if (typeof message === "string") return message;
  return error?.issues[0]?.message ?? "Invalid request body";
}

/** zValidator middleware narrowed to the concrete context these routers use. */
type RouteMiddleware = (c: Context<AppEnv>, next: Next) => Promise<Response | undefined>;

type JsonInputHandler<S extends z.ZodType> = MiddlewareHandler<
  AppEnv,
  string,
  { in: { json?: z.input<S> }; out: { json: z.output<S> } }
>;

/**
 * JSON body validation middleware with the request-envelope behavior these
 * endpoints had under `safeJson` + `schema.safeParse`:
 * - bodies are parsed regardless of content type (hono/validator skips
 *   non-JSON content types, so those take the legacy path below);
 * - unparsable or non-object bodies fail the schema and answer with the
 *   endpoint's 400 envelope instead of throwing into the 500 error handler.
 */
export function jsonInput<S extends z.ZodType>(
  schema: S,
  code: string,
  message: InvalidMessage,
): JsonInputHandler<S> {
  const jsonContentType = /^application\/([a-z-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/i;
  const validate = zValidator("json", schema, (result, c) =>
    result.success
      ? undefined
      : apiError(c, 400, code, resolveInvalidMessage(message, result.error)),
  ) as unknown as RouteMiddleware;
  return (async (c, next) => {
    if (!jsonContentType.test(c.req.header("content-type") ?? "")) {
      const parsed = schema.safeParse(await safeJson(c));
      if (!parsed.success) {
        return apiError(c, 400, code, resolveInvalidMessage(message, parsed.error));
      }
      // Every body schema is an object or a union of objects, so parsed data is
      // a validated object; zValidator's channel just needs it untyped.
      const validated = parsed.data as object;
      c.req.addValidatedData("json", validated);
      await next();
      return;
    }
    try {
      await c.req.json();
    } catch {
      const parsed = schema.safeParse(undefined);
      return apiError(
        c,
        400,
        code,
        resolveInvalidMessage(message, parsed.success ? undefined : parsed.error),
      );
    }
    return validate(c, next);
  }) as JsonInputHandler<S>;
}

/** Query validation middleware; `code` defaults to the historic `invalid_query`. */
export function queryInput<S extends z.ZodType>(schema: S, code = "invalid_query") {
  return zValidator("query", schema, (result, c) =>
    result.success
      ? undefined
      : apiError(c, 400, code, result.error.issues[0]?.message ?? "Invalid query"),
  );
}
