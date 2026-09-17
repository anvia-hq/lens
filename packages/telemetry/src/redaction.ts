import type { JsonValue } from "@lens/contracts";

const REDACTED = "[REDACTED]";

export const defaultRedactionPatterns: readonly string[] = Object.freeze([
  "http.request.header.authorization",
  "http.request.header.cookie",
  "http.response.header.set-cookie",
  "db.connection_string",
  "api_key",
  "access_token",
  "password",
  "secret",
  "*.api_key",
  "*.access_token",
  "*.password",
  "*.secret",
]);

export type AttributeRedactor = (
  attributes: Record<string, JsonValue>,
) => Record<string, JsonValue>;

export function createAttributeRedactor(
  patterns: readonly string[] = defaultRedactionPatterns,
): AttributeRedactor {
  const matchers = patterns.map(globRegExp);
  const matches = (key: string, path: string): boolean =>
    matchers.some((matcher) => matcher.test(key) || matcher.test(path));

  const redactValue = (value: JsonValue, path: string): JsonValue => {
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, path));
    }
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          const itemPath = path.length === 0 ? key : `${path}.${key}`;
          return [key, matches(key, itemPath) ? REDACTED : redactValue(item, itemPath)];
        }),
      );
    }
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
    try {
      return JSON.stringify(redactValue(JSON.parse(value) as JsonValue, path));
    } catch {
      return value;
    }
  };

  return (attributes) =>
    Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        key,
        matches(key, key) ? REDACTED : redactValue(value, key),
      ]),
    );
}

export function globMatch(pattern: string, value: string): boolean {
  return globRegExp(pattern).test(value);
}

function globRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i");
}
