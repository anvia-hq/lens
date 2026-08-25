import { describe, expect, it } from "vitest";
import {
  createIngestionCredentials,
  createMcpCredentials,
  hashMcpToken,
  parseBasicAuthorization,
  parseBearerAuthorization,
  verifyIngestionSecret,
} from "../src/utils/security";

describe("Langfuse-compatible project credentials", () => {
  it("creates a public key and stores a verifiable secret hash", () => {
    const generated = createIngestionCredentials("test-pepper-value");
    expect(generated.publicKey).toMatch(/^pk-lens-[A-Za-z0-9_-]{24}$/);
    expect(generated.secretKey).toMatch(/^sk-lens-[A-Za-z0-9_-]{43}$/);
    expect(verifyIngestionSecret(generated.secretKey, generated.hash, "test-pepper-value")).toBe(
      true,
    );
    expect(
      verifyIngestionSecret(`${generated.secretKey}x`, generated.hash, "test-pepper-value"),
    ).toBe(false);
  });

  it("parses the Basic credentials emitted by the Langfuse processor", () => {
    const encoded = Buffer.from("pk-lens-public:sk-lens-secret").toString("base64");
    expect(parseBasicAuthorization(`Basic ${encoded}`)).toEqual({
      publicKey: "pk-lens-public",
      secretKey: "sk-lens-secret",
    });
    expect(parseBasicAuthorization(`basic ${encoded}`)).toEqual({
      publicKey: "pk-lens-public",
      secretKey: "sk-lens-secret",
    });
  });

  it("rejects malformed or incomplete Basic credentials", () => {
    expect(parseBasicAuthorization(undefined)).toBeUndefined();
    expect(parseBasicAuthorization("Bearer token")).toBeUndefined();
    expect(parseBasicAuthorization("Basic not-base64")).toBeUndefined();
    expect(
      parseBasicAuthorization(`Basic ${Buffer.from("public-only").toString("base64")}`),
    ).toBeUndefined();
  });
});

describe("MCP credentials", () => {
  it("creates a one-time token with a domain-separated hash", () => {
    const generated = createMcpCredentials("test-pepper-value");
    expect(generated.token).toMatch(/^mcp-lens-[A-Za-z0-9_-]{43}$/);
    expect(generated.prefix).toBe(generated.token.slice(0, 21));
    expect(generated.hash).toBe(hashMcpToken(generated.token, "test-pepper-value"));
    expect(generated.hash).not.toBe(hashMcpToken(generated.token, "different-pepper"));
  });

  it("accepts only Lens MCP Bearer tokens", () => {
    const token = createMcpCredentials("test-pepper-value").token;
    expect(parseBearerAuthorization(`Bearer ${token}`)).toBe(token);
    expect(parseBearerAuthorization(`bearer ${token}`)).toBe(token);
    expect(parseBearerAuthorization(undefined)).toBeUndefined();
    expect(parseBearerAuthorization("Bearer arbitrary-token")).toBeUndefined();
    expect(parseBearerAuthorization(`Basic ${token}`)).toBeUndefined();
  });
});
