import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for alert channel secrets at rest.
 *
 * Only the secret-bearing fields of an alert channel config are encrypted
 * (webhook URLs, Telegram bot tokens, generic webhook signing secrets);
 * non-secret routing fields such as `chatId` and `url` stay in plaintext so
 * rows remain inspectable and existing validation still applies.
 *
 * Ciphertext envelope (stored as a JSON string inside the config field):
 *   { "v": 1, "kid": "<key id>", "nonce": "<base64>", "data": "<base64>" }
 * where `data` is AES-256-GCM ciphertext over the UTF-8 secret.
 * The key id travels with the ciphertext so keys can be rotated.
 */

export const ALERT_SECRET_ENVELOPE_VERSION = 1;

const GCM_NONCE_BYTES = 12;
const MIN_KEY_BYTES = 32;

export type AlertSecretKey = {
  /** Key id stored in the envelope; used to select the key on decrypt/rotation. */
  id: string;
  /** Raw 32-byte AES key material. */
  bytes: Uint8Array;
};

export type AlertSecretKeyring = {
  /** Key used for new encryptions. */
  active: AlertSecretKey;
  /** Older keys still accepted for decryption (rotation path). */
  previous: AlertSecretKey[];
};

type EncryptedEnvelope = {
  v: number;
  kid: string;
  nonce: string;
  data: string;
};

function fail(message: string): never {
  throw new Error(`Invalid LENS_ALERT_SECRET_KEY: ${message}`);
}

/**
 * Parse `LENS_ALERT_SECRET_KEY` into raw key material.
 *
 * Accepted forms (explicit key ids are required so rotation is unambiguous):
 * - `kid:base64-key`
 * - `kid:hex-key`
 *
 * Also accepts comma-separated lists (`new-kid:new-key,old-kid:old-key`) so a
 * rotation can ship both the new and the previous key. The first entry is the
 * active key used for new encryptions; the rest decrypt existing envelopes.
 */
export function parseAlertSecretKey(raw: string | undefined): AlertSecretKeyring {
  if (raw === undefined || raw.trim() === "") {
    fail('missing. Set LENS_ALERT_SECRET_KEY to "kid:base64-key" (32-byte key).');
  }
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    fail('missing. Set LENS_ALERT_SECRET_KEY to "kid:base64-key" (32-byte key).');
  }
  const ids = new Set<string>();
  const keys = entries.map((entry) => {
    const key = parseSingleKey(entry);
    if (ids.has(key.id)) fail(`duplicate key id "${key.id}".`);
    ids.add(key.id);
    return key;
  });
  const [active, ...previous] = keys as [AlertSecretKey, ...AlertSecretKey[]];
  return { active, previous };
}

function parseSingleKey(entry: string): AlertSecretKey {
  const colon = entry.indexOf(":");
  if (colon <= 0) fail('expected "kid:base64-key" (explicit key id required).');
  const id = entry.slice(0, colon).trim();
  const material = entry.slice(colon + 1).trim();
  if (id === "") fail('key id must not be empty (expected "kid:base64-key").');
  if (material === "") fail("key material must not be empty.");
  const bytes = decodeKeyMaterial(material);
  if (bytes.length < MIN_KEY_BYTES) {
    fail(`decoded key is ${bytes.length} bytes; at least ${MIN_KEY_BYTES} bytes are required.`);
  }
  // AES-256-GCM needs exactly 32 bytes; truncate longer keys deterministically.
  return { id, bytes: bytes.slice(0, MIN_KEY_BYTES) };
}

function decodeKeyMaterial(material: string): Uint8Array {
  if (/^[0-9a-fA-F]+$/.test(material) && material.length % 2 === 0) {
    try {
      return new Uint8Array(Buffer.from(material, "hex"));
    } catch {
      // Fall through to base64 below so the error message stays consistent.
    }
  }
  try {
    const decoded = Buffer.from(material, "base64");
    // Reject values that do not round-trip: Buffer.from silently skips junk.
    const canonical = decoded.toString("base64").replace(/=+$/, "");
    const input = material.replace(/\s+/g, "").replace(/=+$/, "");
    if (canonical !== input) fail("not valid base64 or hex.");
    return new Uint8Array(decoded);
  } catch {
    fail("not valid base64 or hex.");
  }
}

/**
 * Resolve the active keyring from the environment.
 *
 * Production requires an explicit `LENS_ALERT_SECRET_KEY`. Outside production
 * a deterministic development fallback is used so local setups keep working;
 * it must never be used in production (enforced below).
 */
export function loadAlertSecretKeyring(env: NodeJS.ProcessEnv = process.env): AlertSecretKeyring {
  const nodeEnv = env["NODE_ENV"] ?? "development";
  const raw = env["LENS_ALERT_SECRET_KEY"];
  if (raw !== undefined && raw.trim() !== "") return parseAlertSecretKey(raw);
  if (nodeEnv === "production") {
    fail(
      "missing. Production requires an explicit key; generate one with `openssl rand -base64 32`.",
    );
  }
  // Development/test fallback only. Distinct per process so ciphertext still
  // exercises the envelope path without pretending to be a real secret.
  return {
    active: {
      id: "dev",
      bytes: new Uint8Array(
        Buffer.from("lens-dev-alert-secret-key-32bytes!!".slice(0, 32), "utf8"),
      ),
    },
    previous: [],
  };
}

function findKey(keyring: AlertSecretKeyring, kid: string): AlertSecretKey | undefined {
  if (keyring.active.id === kid) return keyring.active;
  return keyring.previous.find((key) => key.id === kid);
}

export function encryptAlertSecret(plaintext: string, keyring: AlertSecretKeyring): string {
  const active = keyring.active;
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(active.bytes), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: ALERT_SECRET_ENVELOPE_VERSION,
    kid: active.id,
    nonce: nonce.toString("base64"),
    data: Buffer.concat([cipher.getAuthTag(), ciphertext]).toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptAlertSecret(envelopeText: string, keyring: AlertSecretKeyring): string {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(envelopeText) as EncryptedEnvelope;
  } catch {
    throw new Error("Alert secret is not in the expected encrypted format.");
  }
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    envelope.v !== ALERT_SECRET_ENVELOPE_VERSION ||
    typeof envelope.kid !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.data !== "string"
  ) {
    throw new Error("Alert secret is not in the expected encrypted format.");
  }
  const key = findKey(keyring, envelope.kid);
  if (key === undefined) {
    throw new Error(
      `Alert secret was encrypted with unknown key id "${envelope.kid}". Provide the previous key for rotation.`,
    );
  }
  const nonce = Buffer.from(envelope.nonce, "base64");
  const combined = Buffer.from(envelope.data, "base64");
  if (nonce.length !== GCM_NONCE_BYTES || combined.length < 17) {
    throw new Error("Alert secret is not in the expected encrypted format.");
  }
  const authTag = combined.subarray(0, 16);
  const ciphertext = combined.subarray(16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key.bytes), nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Alert secret failed authentication (wrong key or tampered data).");
  }
}

/** True when a stored config value already carries an encrypted envelope. */
export function isEncryptedAlertSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedEnvelope>;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.v === ALERT_SECRET_ENVELOPE_VERSION &&
      typeof parsed.kid === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.data === "string"
    );
  } catch {
    return false;
  }
}

/** Key id stored in an encrypted envelope, or undefined for non-envelopes. */
export function envelopeKeyId(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedEnvelope>;
    return typeof parsed?.kid === "string" ? parsed.kid : undefined;
  } catch {
    return undefined;
  }
}
