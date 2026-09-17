export type TraceCursor = { startedAt: string; traceId: string };

export function encodeCursor(startedAt: string, traceId: string): string {
  return Buffer.from(JSON.stringify([startedAt, traceId]), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): TraceCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return undefined;
    }
    return { startedAt: parsed[0], traceId: parsed[1] };
  } catch {
    return undefined;
  }
}
