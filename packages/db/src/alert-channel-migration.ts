import { eq } from "drizzle-orm";
import {
  type AlertSecretKeyring,
  decryptAlertSecret,
  encryptAlertSecret,
  envelopeKeyId,
  isEncryptedAlertSecret,
  loadAlertSecretKeyring,
} from "./alert-secrets.js";
import type { LensPostgres } from "./index.js";
import { alertChannel } from "./schema.js";

export type AlertChannelMigrationRow = {
  id: string;
  type: "slack" | "discord" | "telegram" | "webhook";
  config: Record<string, unknown>;
};

export type AlertChannelMigrationResult = {
  scanned: number;
  encrypted: number;
  skipped: number;
};

const SECRET_FIELDS: Record<AlertChannelMigrationRow["type"], readonly string[]> = {
  slack: ["webhookUrl"],
  discord: ["webhookUrl"],
  telegram: ["botToken"],
  webhook: ["secret"],
};

/**
 * Encrypt one stored config in memory. Plaintext secrets are encrypted with
 * the active key; values already in the envelope format are left untouched so
 * the migration (and rotation) is idempotent.
 */
export function encryptAlertChannelConfigForMigration(
  row: AlertChannelMigrationRow,
  keyring: AlertSecretKeyring,
): { config: Record<string, unknown>; changed: boolean } {
  const secretFields = SECRET_FIELDS[row.type];
  let changed = false;
  const config: Record<string, unknown> = { ...row.config };
  for (const field of secretFields) {
    const value = row.config[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value === "") continue;
    if (isEncryptedAlertSecret(value)) continue;
    config[field] = encryptAlertSecret(value, keyring);
    changed = true;
  }
  return { config, changed };
}

/**
 * Re-encrypt one stored config under the active key. Rows already encrypted
 * with the active key id are left untouched; rows encrypted with a previous
 * key id are decrypted with the keyring and re-encrypted. Plaintext rows are
 * left alone (the migration owns those).
 */
export function reencryptAlertChannelConfigForRotation(
  row: AlertChannelMigrationRow,
  keyring: AlertSecretKeyring,
): { config: Record<string, unknown>; changed: boolean } {
  const secretFields = SECRET_FIELDS[row.type];
  let changed = false;
  const config: Record<string, unknown> = { ...row.config };
  for (const field of secretFields) {
    const value = row.config[field];
    if (!isEncryptedAlertSecret(value)) continue;
    if (envelopeKeyId(value) === keyring.active.id) continue;
    config[field] = encryptAlertSecret(decryptAlertSecret(value, keyring), keyring);
    changed = true;
  }
  return { config, changed };
}

async function rewriteChangedConfigs(
  db: LensPostgres,
  keyring: AlertSecretKeyring,
  rewrite: (
    row: AlertChannelMigrationRow,
    keyring: AlertSecretKeyring,
  ) => { config: Record<string, unknown>; changed: boolean },
): Promise<AlertChannelMigrationResult> {
  const rows = await db
    .select({ id: alertChannel.id, type: alertChannel.type, config: alertChannel.config })
    .from(alertChannel);
  let encrypted = 0;
  for (const row of rows) {
    const { config, changed } = rewrite(
      { id: row.id, type: row.type, config: row.config as Record<string, unknown> },
      keyring,
    );
    if (!changed) continue;
    await db
      .update(alertChannel)
      .set({ config: config as typeof alertChannel.$inferInsert.config, updatedAt: new Date() })
      .where(eq(alertChannel.id, row.id));
    encrypted += 1;
  }
  return { scanned: rows.length, encrypted, skipped: rows.length - encrypted };
}

/**
 * One-shot migration: encrypt every plaintext alert channel secret with the
 * active key. Safe to run twice; rows already in the envelope format are
 * skipped.
 */
export async function migrateAlertChannelSecrets(
  db: LensPostgres,
  keyring: AlertSecretKeyring = loadAlertSecretKeyring(),
): Promise<AlertChannelMigrationResult> {
  return rewriteChangedConfigs(db, keyring, encryptAlertChannelConfigForMigration);
}

/**
 * Key rotation: re-encrypt every row still under a previous key id with the
 * active key. The keyring must contain the previous keys so old envelopes can
 * be decrypted (comma-separated `LENS_ALERT_SECRET_KEY=new,old`).
 */
export async function rotateAlertChannelSecrets(
  db: LensPostgres,
  keyring: AlertSecretKeyring = loadAlertSecretKeyring(),
): Promise<AlertChannelMigrationResult> {
  return rewriteChangedConfigs(db, keyring, reencryptAlertChannelConfigForRotation);
}
