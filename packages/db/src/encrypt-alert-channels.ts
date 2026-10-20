/**
 * Re-encrypt alert channel secrets under a new key version.
 *
 * Usage:
 *   1. Generate a new key:  openssl rand -base64 32
 *   2. Migrate:              LENS_ALERT_SECRET_KEY=<new> pnpm --filter @lens/db db:encrypt-alert-channels
 *      (rows already encrypted are skipped; safe to run twice)
 *   3. Rotate:               LENS_ALERT_SECRET_KEY=<new>,<old> pnpm --filter @lens/db db:rotate-alert-channels
 *      (rows still under the old key id are re-encrypted with the new active key)
 *   4. Remove the old key from the environment once rotation reports 0 remaining.
 *
 * Existing deployments must set LENS_ALERT_SECRET_KEY before running the
 * migration; delivery read paths reject plaintext rows until they are migrated.
 */
import { loadConfig } from "@lens/config";
import { createPostgres, migrateAlertChannelSecrets, rotateAlertChannelSecrets } from "./index.js";
import { loadAlertSecretKeyring } from "./alert-secrets.js";

const mode = process.argv[2] === "rotate" ? "rotate" : "migrate";

const config = loadConfig();
const postgres = createPostgres(config);
try {
  const keyring = loadAlertSecretKeyring(process.env);
  const result =
    mode === "rotate"
      ? await rotateAlertChannelSecrets(postgres.db, keyring)
      : await migrateAlertChannelSecrets(postgres.db, keyring);
  console.log(
    `alert channel secrets ${mode}: scanned=${result.scanned} updated=${result.encrypted} skipped=${result.skipped} activeKey=${keyring.active.id}`,
  );
} finally {
  await postgres.close();
}
