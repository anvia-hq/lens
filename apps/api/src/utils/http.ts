import type { Context } from "hono";
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
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}
