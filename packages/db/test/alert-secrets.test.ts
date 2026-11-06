import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  decryptAlertSecret,
  encryptAlertSecret,
  isEncryptedAlertSecret,
  loadAlertSecretKeyring,
  parseAlertSecretKey,
} from "../src/alert-secrets.js";

const RAW_KEY = `v1:${Buffer.alloc(32, 7).toString("base64")}`;
const OTHER_RAW_KEY = `v2:${Buffer.alloc(32, 9).toString("base64")}`;

function keyring(raw: string = RAW_KEY) {
  return parseAlertSecretKey(raw);
}

describe("alert secret envelope", () => {
  it("round-trips encrypt/decrypt with a random nonce per value", () => {
    const ring = keyring();
    const first = encryptAlertSecret("https://hooks.slack.com/x", ring);
    const second = encryptAlertSecret("https://hooks.slack.com/x", ring);
    expect(first).not.toBe(second);
    expect(decryptAlertSecret(first, ring)).toBe("https://hooks.slack.com/x");
    expect(decryptAlertSecret(second, ring)).toBe("https://hooks.slack.com/x");
    expect(isEncryptedAlertSecret(first)).toBe(true);
    expect(isEncryptedAlertSecret("plaintext")).toBe(false);
  });

  it("detects tampered ciphertext", () => {
    const ring = keyring();
    const envelope = JSON.parse(encryptAlertSecret("s3cret-value-16chars", ring)) as {
      data: string;
    };
    const tampered = Buffer.from(envelope.data, "base64");
    const last = tampered[tampered.length - 1] ?? 0;
    tampered[tampered.length - 1] = last ^ 0xff;
    envelope.data = tampered.toString("base64");
    expect(() => decryptAlertSecret(JSON.stringify(envelope), ring)).toThrow(
      /authentication|expected encrypted format/,
    );
  });

  it("rejects the wrong key", () => {
    const ring = keyring();
    const envelope = encryptAlertSecret("s3cret-value-16chars", ring);
    expect(() => decryptAlertSecret(envelope, keyring(OTHER_RAW_KEY))).toThrow(
      /unknown key id|authentication/,
    );
  });

  it("rejects malformed envelopes", () => {
    const ring = keyring();
    expect(() => decryptAlertSecret("not-json", ring)).toThrow(/expected encrypted format/);
    expect(() => decryptAlertSecret(JSON.stringify({ v: 1 }), ring)).toThrow(
      /expected encrypted format/,
    );
  });

  it("fails fast on a missing or malformed key", () => {
    expect(() => parseAlertSecretKey(undefined)).toThrow(/Invalid LENS_ALERT_SECRET_KEY/);
    expect(() => parseAlertSecretKey("")).toThrow(/Invalid LENS_ALERT_SECRET_KEY/);
    expect(() => parseAlertSecretKey("not-valid!!!")).toThrow(/explicit key id/);
    expect(() => parseAlertSecretKey("v1:not-valid!!!")).toThrow(/base64 or hex/);
    expect(() => parseAlertSecretKey("v1:")).toThrow(/must not be empty/);
    expect(() => parseAlertSecretKey(`v1:${Buffer.alloc(4).toString("base64")}`)).toThrow(
      /at least 32/,
    );
    expect(() => parseAlertSecretKey(`${RAW_KEY},${RAW_KEY}`)).toThrow(/duplicate key id/);
  });

  it("supports key ids and comma-separated rotation keyrings", () => {
    const ring = parseAlertSecretKey(`${RAW_KEY},${OTHER_RAW_KEY}`);
    expect(ring.active.id).toBe("v1");
    expect(ring.previous.map((key) => key.id)).toEqual(["v2"]);
    const otherRing = parseAlertSecretKey(`other:${Buffer.alloc(32, 5).toString("base64")}`);
    const envelope = encryptAlertSecret("s3cret-value-16chars", otherRing);
    expect(() => decryptAlertSecret(envelope, ring)).toThrow(/unknown key id/);
    const oldRing = parseAlertSecretKey(OTHER_RAW_KEY);
    const oldEnvelope = encryptAlertSecret("s3cret-value-16chars", oldRing);
    // Same key material under the v2 id decrypts with the combined keyring.
    expect(decryptAlertSecret(oldEnvelope, ring)).toBe("s3cret-value-16chars");
    const both = parseAlertSecretKey(`${OTHER_RAW_KEY},${RAW_KEY}`);
    expect(decryptAlertSecret(oldEnvelope, both)).toBe("s3cret-value-16chars");
  });

  it("uses a dev fallback outside production and requires a real key in production", () => {
    const dev = loadAlertSecretKeyring({ NODE_ENV: "development" });
    expect(decryptAlertSecret(encryptAlertSecret("x", dev), dev)).toBe("x");
    expect(() => loadAlertSecretKeyring({ NODE_ENV: "production" })).toThrow(
      /Production requires an explicit key/,
    );
    const prod = loadAlertSecretKeyring({ NODE_ENV: "production", LENS_ALERT_SECRET_KEY: RAW_KEY });
    expect(decryptAlertSecret(encryptAlertSecret("x", prod), prod)).toBe("x");
  });
});
