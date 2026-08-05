import { describe, expect, it } from "vitest";
import {
  createIngestionCredentials,
  parseBasicAuthorization,
  verifyIngestionSecret,
} from "../src/security";

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
