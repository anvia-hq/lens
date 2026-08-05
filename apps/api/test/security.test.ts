import { describe, expect, it } from "vitest";
import { createIngestionKey, ingestionKeyPrefix, verifyIngestionKey } from "../src/security";

describe("project ingestion keys", () => {
  it("stores a verifiable hash without retaining the key", () => {
    const generated = createIngestionKey("test-pepper-value");
    expect(ingestionKeyPrefix(generated.key)).toBe(generated.prefix);
    expect(verifyIngestionKey(generated.key, generated.hash, "test-pepper-value")).toBe(true);
    expect(verifyIngestionKey(`${generated.key}x`, generated.hash, "test-pepper-value")).toBe(
      false,
    );
  });
});
