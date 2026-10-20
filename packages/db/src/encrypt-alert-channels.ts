/**
 * Re-encrypt alert channel secrets under a new key version.
 *
 * Standalone re-run / rotation helper. The plaintext-to-ciphertext migration
 * also runs automatically inside `db:migrate` (and the `migrate` container),
 * so upgrades do not leave delivery broken in between.
 *
 * Usage (source checkout):
 *   1. Generate a new key with an explicit id, e.g. LENS_ALERT_SECRET_KEY="2026-10:$(openssl rand -base64 32)"
 *   2. Re-run migrate:       LENS_ALERT_SECRET_KEY=<kid:new-key> pnpm --filter @lens/db db:encrypt-alert-channels
 *      (rows already encrypted are skipped; safe to run twice)
 *   3. Rotate:               LENS_ALERT_SECRET_KEY=<new-kid:new-key>,<old-kid:old-key> pnpm --filter @lens/db db:rotate-alert-channels
 *      (rows still under the old key id are re-encrypted with the new active key)
 *   4. Re-run until `updated=0`, then remove the old key from the environment.
 *
 * Usage (published image):
 *   docker compose run --rm api node packages/db/dist/encrypt-alert-channels.js migrate
 *   docker compose run --rm api node packages/db/dist/encrypt-alert-channels.js rotate
 *
 * Existing deployments must set LENS_ALERT_SECRET_KEY before upgrading; the
 * automatic migration encrypts plaintext rows on `db:migrate`.
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
