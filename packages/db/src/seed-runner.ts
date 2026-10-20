import { createHmac, randomBytes } from "node:crypto";
import { type LensConfig, loadConfig } from "@lens/config";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import {
  account,
  createClickHouse,
  createPostgres,
  insertSpans,
  materializeTrace,
  member,
  organization,
  project,
  projectApiKey,
  queryMetrics,
  user,
} from "./index.js";
import { buildSeedTelemetry } from "./seed-data.js";

const DEMO_USER_ID = "seed-user-demo";
const TEAMMATE_USER_ID = "seed-user-maya";
const ORGANIZATION_ID = "seed-org-acme-ai";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_EMAIL = "demo@lens.local";
const DEMO_ACCOUNT_ID = "seed-account-demo";
const DEMO_API_KEY_ID = "22222222-2222-4222-8222-222222222222";
/**
 * Credentials shipped by older seed versions (now removed). Only used to detect
 * databases seeded before this fix so the operator can be warned; never written
 * back. The secret is compared by hash, using the same HMAC construction the old
 * seed used.
 */
const LEGACY_DEMO_SECRET_PLAINTEXT = "sk-lens-demo-4Yp9Xq7Wm2Ns8Kd5Rt3Vh6Bj1Lc0ZaEeFuGiPoUyQ";
const LEGACY_DEMO_PUBLIC_KEY = "pk-lens-demo-production-agents";
const LEGACY_DEMO_PASSWORD = "LensDemo2026!";

/** Explicit opt-in required to run the demo seed in production. */
const SEED_PRODUCTION_OPT_IN = "LENS_ALLOW_SEED";
/** Optional caller-supplied demo password (no default is shipped). */
const SEED_DEMO_PASSWORD_ENV = "LENS_SEED_DEMO_PASSWORD";
/** Optional caller-supplied demo ingestion secret key (no default is shipped). */
const SEED_DEMO_SECRET_KEY_ENV = "LENS_SEED_DEMO_SECRET_KEY";

export type SeedCredentials = {
  email: string;
  /** Present only on the run that creates the demo login. */
  password: string | null;
  /** Present only on the run that creates the demo API key. */
  publicKey: string | null;
  /** Present only on the run that creates the demo API key. */
  secretKey: string | null;
};

function readSeedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function generateDemoPassword(): string {
  return `lens-demo-${randomBytes(24).toString("base64url")}`;
}

function generateDemoPublicKey(): string {
  return `pk-lens-demo-${randomBytes(12).toString("base64url")}`;
}

function generateDemoSecretKey(): string {
  return `sk-lens-demo-${randomBytes(32).toString("base64url")}`;
}

function hashIngestionSecret(secretKey: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secretKey).digest("hex");
}

export async function runSeed(config: LensConfig = loadConfig()): Promise<SeedCredentials> {
  if (config.NODE_ENV === "production" && readSeedEnv(SEED_PRODUCTION_OPT_IN) !== "1") {
    throw new Error(
      `Refusing to run the demo seed in production. Set ${SEED_PRODUCTION_OPT_IN}=1 to confirm this is intentional.`,
    );
  }

  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);

  try {
    const now = new Date();

    const existingAccount = await postgres.db
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(eq(account.id, DEMO_ACCOUNT_ID))
      .limit(1);
    const existingApiKey = await postgres.db
      .select({
        id: projectApiKey.id,
        publicKey: projectApiKey.publicKey,
        secretHash: projectApiKey.secretHash,
        revokedAt: projectApiKey.revokedAt,
      })
      .from(projectApiKey)
      .where(eq(projectApiKey.id, DEMO_API_KEY_ID))
      .limit(1);

    // Credentials exist only in memory for this run: prefer caller-supplied values,
    // otherwise generate fresh random ones. Nothing is hardcoded, and re-runs never
    // rotate existing auth data.
    const accountExists = existingAccount.length > 0;
    const apiKeyExists = existingApiKey.length > 0;
    const demoPassword = accountExists
      ? null
      : (readSeedEnv(SEED_DEMO_PASSWORD_ENV) ?? generateDemoPassword());
    const demoPublicKey = apiKeyExists ? null : generateDemoPublicKey();
    const demoSecretKey = apiKeyExists
      ? null
      : (readSeedEnv(SEED_DEMO_SECRET_KEY_ENV) ?? generateDemoSecretKey());
    const passwordHash = demoPassword === null ? null : await hashPassword(demoPassword);
    const demoSecretHash =
      demoSecretKey === null
        ? null
        : hashIngestionSecret(demoSecretKey, config.INGESTION_KEY_PEPPER);

    // Databases seeded by an older release still hold the publicly known demo
    // password and ingestion key. Flag them without touching them: rotation is an
    // explicit operator action (change the password, revoke the key).
    const legacyPasswordInUse =
      existingAccount[0]?.password !== undefined &&
      existingAccount[0]?.password !== null &&
      (await verifyPassword({
        hash: existingAccount[0].password,
        password: LEGACY_DEMO_PASSWORD,
      }));
    const legacyKeyInUse =
      existingApiKey[0]?.publicKey === LEGACY_DEMO_PUBLIC_KEY ||
      existingApiKey[0]?.secretHash ===
        hashIngestionSecret(LEGACY_DEMO_SECRET_PLAINTEXT, config.INGESTION_KEY_PEPPER);

    await postgres.db.transaction(async (tx) => {
      await tx
        .insert(user)
        .values({
          id: DEMO_USER_ID,
          name: "Alex Morgan",
          email: DEMO_EMAIL,
          emailVerified: true,
          image: "https://api.dicebear.com/9.x/notionists/svg?seed=Alex",
          createdAt: new Date("2026-01-12T09:30:00.000Z"),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: user.id,
          set: { name: "Alex Morgan", emailVerified: true, updatedAt: now },
        });
      // An existing credential row keeps its password hash: re-running the seed
      // must never silently rotate the demo login. When the row already exists the
      // pre-check found it, so the insert below is a no-op (onConflictDoNothing).
      await tx
        .insert(account)
        .values(
          passwordHash === null
            ? {
                id: DEMO_ACCOUNT_ID,
                accountId: DEMO_USER_ID,
                providerId: "credential",
                userId: DEMO_USER_ID,
                createdAt: new Date("2026-01-12T09:30:00.000Z"),
                updatedAt: now,
              }
            : {
                id: DEMO_ACCOUNT_ID,
                accountId: DEMO_USER_ID,
                providerId: "credential",
                userId: DEMO_USER_ID,
                password: passwordHash,
                createdAt: new Date("2026-01-12T09:30:00.000Z"),
                updatedAt: now,
              },
        )
        .onConflictDoNothing();
      await tx
        .insert(user)
        .values({
          id: TEAMMATE_USER_ID,
          name: "Maya Chen",
          email: "maya@lens.local",
          emailVerified: true,
          image: "https://api.dicebear.com/9.x/notionists/svg?seed=Maya",
          createdAt: new Date("2026-02-03T14:15:00.000Z"),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: user.id,
          set: { name: "Maya Chen", emailVerified: true, updatedAt: now },
        });
      await tx
        .insert(organization)
        .values({
          id: ORGANIZATION_ID,
          name: "Acme AI",
          slug: "acme-ai-demo",
          metadata: JSON.stringify({ plan: "growth", region: "us-east-1" }),
          createdAt: new Date("2026-01-12T09:35:00.000Z"),
        })
        .onConflictDoUpdate({ target: organization.id, set: { name: "Acme AI" } });
      await tx
        .insert(member)
        .values([
          {
            id: "seed-member-demo",
            organizationId: ORGANIZATION_ID,
            userId: DEMO_USER_ID,
            role: "owner",
            createdAt: new Date("2026-01-12T09:35:00.000Z"),
          },
          {
            id: "seed-member-maya",
            organizationId: ORGANIZATION_ID,
            userId: TEAMMATE_USER_ID,
            role: "member",
            createdAt: new Date("2026-02-03T14:20:00.000Z"),
          },
        ])
        .onConflictDoNothing();
      await tx
        .insert(project)
        .values({
          id: PROJECT_ID,
          organizationId: ORGANIZATION_ID,
          name: "Production Agents",
          slug: "production-agents",
          state: "active",
          retentionDays: "30",
          createdAt: new Date("2026-01-12T09:40:00.000Z"),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: project.id,
          set: {
            name: "Production Agents",
            state: "active",
            retentionDays: "30",
            updatedAt: now,
          },
        });
      // A re-run never rotates the stored secret hash and never clears revokedAt,
      // so it cannot silently rotate or revive the demo API key. The pre-check
      // above only computes fresh key material when the row is absent, so the
      // insert below is a no-op (onConflictDoNothing) whenever the key exists.
      if (demoPublicKey !== null && demoSecretHash !== null) {
        await tx
          .insert(projectApiKey)
          .values({
            id: DEMO_API_KEY_ID,
            projectId: PROJECT_ID,
            name: "Demo application",
            publicKey: demoPublicKey,
            secretHash: demoSecretHash,
            createdBy: DEMO_USER_ID,
            createdAt: new Date("2026-01-12T09:45:00.000Z"),
            lastUsedAt: new Date(now.getTime() - 18 * 60_000),
          })
          .onConflictDoNothing();
      }
    });

    for (const table of ["spans", "trace_summaries"]) {
      await clickhouse.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id = {projectId:UUID} SETTINGS mutations_sync = 2`,
        query_params: { projectId: PROJECT_ID },
      });
    }

    const telemetry = buildSeedTelemetry(PROJECT_ID, now);
    await insertSpans(clickhouse, telemetry.spans);
    for (const traceId of telemetry.traceIds) {
      await materializeTrace(clickhouse, PROJECT_ID, traceId);
    }

    const metrics = await queryMetrics(clickhouse, PROJECT_ID, "24h", now);

    console.log("Anvia Lens realistic demo data is ready.");
    console.log(`  Web:           ${config.PUBLIC_APP_URL}`);
    console.log(`  Login:         ${DEMO_EMAIL}`);
    if (demoPassword !== null) {
      // One-time generated value the operator needs to sign in; printed only on the
      // run that creates the credential.
      console.log(`  Password:      (generated for this seed run only) ${demoPassword}`);
    } else if (legacyPasswordInUse) {
      // No rotation: the fix for a previously published password is an explicit
      // operator action, not a silent seed rewrite.
      console.warn(
        "  WARNING: the demo login still uses the previously published demo password. " +
          "Change it and treat any prior value as compromised.",
      );
    } else {
      console.log(`  Password:      (unchanged — demo login already exists)`);
    }
    console.log(`  Team:          Acme AI`);
    console.log(`  Project:       Production Agents (${PROJECT_ID})`);
    if (demoPublicKey !== null && demoSecretKey !== null) {
      // One-time generated values the operator needs to send telemetry; printed only
      // on the run that creates the key.
      console.log(`  Public key:    (generated for this seed run only) ${demoPublicKey}`);
      console.log(`  Secret key:    (generated for this seed run only) ${demoSecretKey}`);
    } else if (legacyKeyInUse) {
      // No rotation or revival: revoking the compromised key is an explicit
      // operator action, not a silent seed rewrite.
      console.warn(
        "  WARNING: the demo API key still uses previously published key material. " +
          "Revoke it and treat any prior value as compromised.",
      );
    } else {
      console.log(`  Public key:    (unchanged — demo API key already exists)`);
    }
    console.log(
      `  Seeded:        ${metrics.current.traces} traces, ${metrics.current.spans} spans, ${metrics.current.errors} errors`,
    );

    return {
      email: DEMO_EMAIL,
      password: demoPassword,
      publicKey: demoPublicKey,
      secretKey: demoSecretKey,
    };
  } finally {
    await postgres.close();
    await clickhouse.close();
  }
}
