import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type IngestionCredentials = {
  publicKey: string;
  secretKey: string;
  hash: string;
};

export type BasicCredentials = {
  publicKey: string;
  secretKey: string;
};

export type McpCredentials = {
  token: string;
  hash: string;
  prefix: string;
};

export function createIngestionCredentials(pepper: string): IngestionCredentials {
  const publicKey = `pk-lens-${randomBytes(18).toString("base64url")}`;
  const secretKey = `sk-lens-${randomBytes(32).toString("base64url")}`;
  return { publicKey, secretKey, hash: hashIngestionSecret(secretKey, pepper) };
}

export function createMcpCredentials(pepper: string): McpCredentials {
  const token = `mcp-lens-${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashMcpToken(token, pepper), prefix: token.slice(0, 21) };
}

export function parseBearerAuthorization(value: string | undefined): string | undefined {
  const token = /^Bearer\s+(mcp-lens-[A-Za-z0-9_-]{43})$/i.exec(value ?? "")?.[1];
  return token;
}

export function hashMcpToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`mcp-token:${token}`).digest("hex");
}

export function parseBasicAuthorization(value: string | undefined): BasicCredentials | undefined {
  const encoded = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(value ?? "")?.[1];
  if (encoded === undefined || encoded.length % 4 !== 0) return undefined;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  if (Buffer.from(decoded, "utf8").toString("base64") !== encoded) return undefined;
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) return undefined;
  return {
    publicKey: decoded.slice(0, separator),
    secretKey: decoded.slice(separator + 1),
  };
}

export function hashIngestionSecret(secretKey: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secretKey).digest("hex");
}

export function verifyIngestionSecret(
  secretKey: string,
  expectedHash: string,
  pepper: string,
): boolean {
  const actual = Buffer.from(hashIngestionSecret(secretKey, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
