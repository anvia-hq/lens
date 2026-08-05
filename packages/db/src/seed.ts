import { createHmac } from "node:crypto";
import { loadConfig } from "@lens/config";
import { hashPassword } from "better-auth/crypto";
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
const DEMO_PASSWORD = "LensDemo2026!";
const DEMO_INGESTION_KEY = "lens_ingest_demo2026_4Yp9Xq7Wm2Ns8Kd5Rt3Vh6Bj1Lc0ZaEeFuGiPoUyQ";

const config = loadConfig();
const postgres = createPostgres(config);
const clickhouse = createClickHouse(config);

try {
  const now = new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

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
    await tx
      .insert(account)
      .values({
        id: "seed-account-demo",
        accountId: DEMO_USER_ID,
        providerId: "credential",
        userId: DEMO_USER_ID,
        password: passwordHash,
        createdAt: new Date("2026-01-12T09:30:00.000Z"),
        updatedAt: now,
      })
      .onConflictDoUpdate({ target: account.id, set: { password: passwordHash, updatedAt: now } });
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
        redactionPatterns: ["authorization", "*.password", "*.api_key", "customer.ssn"],
        createdAt: new Date("2026-01-12T09:40:00.000Z"),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: project.id,
        set: {
          name: "Production Agents",
          state: "active",
          retentionDays: "30",
          redactionPatterns: ["authorization", "*.password", "*.api_key", "customer.ssn"],
          updatedAt: now,
        },
      });
    await tx
      .insert(projectApiKey)
      .values({
        id: "22222222-2222-4222-8222-222222222222",
        projectId: PROJECT_ID,
        name: "Demo application",
        prefix: "demo2026",
        secretHash: createHmac("sha256", config.INGESTION_KEY_PEPPER)
          .update(DEMO_INGESTION_KEY)
          .digest("hex"),
        createdBy: DEMO_USER_ID,
        createdAt: new Date("2026-01-12T09:45:00.000Z"),
        lastUsedAt: new Date(now.getTime() - 18 * 60_000),
      })
      .onConflictDoUpdate({
        target: projectApiKey.id,
        set: {
          secretHash: createHmac("sha256", config.INGESTION_KEY_PEPPER)
            .update(DEMO_INGESTION_KEY)
            .digest("hex"),
          revokedAt: null,
          lastUsedAt: new Date(now.getTime() - 18 * 60_000),
        },
      });
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

  const metrics = await queryMetrics(
    clickhouse,
    PROJECT_ID,
    new Date(now.getTime() - 24 * 60 * 60_000).toISOString(),
    new Date(now.getTime() + 60_000).toISOString(),
  );

  console.log("Lens realistic demo data is ready.");
  console.log(`  Web:           ${config.PUBLIC_APP_URL}`);
  console.log(`  Login:         ${DEMO_EMAIL}`);
  console.log(`  Password:      ${DEMO_PASSWORD}`);
  console.log(`  Team:          Acme AI`);
  console.log(`  Project:       Production Agents (${PROJECT_ID})`);
  console.log(`  Ingestion key: ${DEMO_INGESTION_KEY}`);
  console.log(
    `  Seeded:        ${metrics.traces} traces, ${metrics.spans} spans, ${metrics.errors} errors`,
  );
} finally {
  await postgres.close();
  await clickhouse.close();
}
