import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  decryptAlertSecret,
  encryptAlertSecret,
  isEncryptedAlertSecret,
  loadAlertSecretKeyring,
  parseAlertSecretKey,
} from "../src/alert-secrets.js";

const RAW_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_RAW_KEY = Buffer.alloc(32, 9).toString("base64");

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
    expect(() => parseAlertSecretKey("not-valid!!!")).toThrow(/Invalid LENS_ALERT_SECRET_KEY/);
    expect(() => parseAlertSecretKey(Buffer.alloc(4).toString("base64"))).toThrow(/at least 32/);
  });

  it("supports key ids and comma-separated rotation keyrings", () => {
    const ring = parseAlertSecretKey(`new:${RAW_KEY},old:${OTHER_RAW_KEY}`);
    expect(ring.active.id).toBe("new");
    expect(ring.previous.map((key) => key.id)).toEqual(["old"]);
    const oldRing = parseAlertSecretKey(`old:${OTHER_RAW_KEY}`);
    const envelope = encryptAlertSecret("s3cret-value-16chars", oldRing);
    expect(decryptAlertSecret(envelope, ring)).toBe("s3cret-value-16chars");
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
