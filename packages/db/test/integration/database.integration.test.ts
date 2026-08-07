import type {
  EvaluationResult,
  EvaluationRun,
  NormalizedSpan,
  QualityGateInput,
} from "@lens/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createClickHouse,
  createManagedDataset,
  createManagedDatasetVersion,
  createPostgres,
  createQualityGate,
  deleteProjectTelemetry,
  deleteQualityGate,
  getEvaluationDatasetDetail,
  getEvaluationRunDetail,
  getManagedDataset,
  getManagedDatasetVersion,
  getPublishedManagedDataset,
  getQualityGate,
  getTrace,
  insertEvaluationRuns,
  insertEvaluations,
  insertSpans,
  listEvaluationRuns,
  listQualityGates,
  listTraces,
  managedDataset,
  materializeTrace,
  organization,
  project,
  publishManagedDatasetVersion,
  queryMetrics,
  reconcileProjectRetention,
  updateQualityGate,
  upsertManagedDatasetCase,
  user,
} from "../../src/index.js";
import { runMigrations } from "../../src/migration-runner.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const traceId = "1".repeat(32);
const rootSpanId = "1".repeat(16);
const generationSpanId = "2".repeat(16);
const now = new Date("2026-08-07T00:00:00.000Z");

describe.sequential("database integration", () => {
  const config = integrationConfig();
  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);

  beforeAll(async () => {
    await runMigrations(config);
    await postgres.db
      .insert(organization)
      .values({ id: "integration-org", name: "Integration", slug: "integration" })
      .onConflictDoNothing();
    await postgres.db
      .insert(user)
      .values({ id: "integration-user", name: "Integration", email: "integration@lens.test" })
      .onConflictDoNothing();
    await postgres.db
      .insert(project)
      .values({
        id: projectId,
        organizationId: "integration-org",
        name: "Integration",
        slug: "integration",
      })
      .onConflictDoNothing();
  }, 30_000);

  afterAll(async () => {
    await deleteProjectTelemetry(clickhouse, projectId);
    await postgres.close();
    await clickhouse.close();
  });

  it("applies PostgreSQL and ClickHouse migrations idempotently", async () => {
    await runMigrations(config);
    const result = await clickhouse.query({
      query: "SELECT countDistinct(filename) AS count FROM schema_migrations",
      format: "JSONEachRow",
    });
    expect(await result.json<{ count: number }[]>()).toEqual([{ count: 7 }]);
    const tables = await postgres.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('managed_dataset_cases', 'managed_dataset_versions', 'managed_datasets', 'projects', 'quality_gates')
      ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      "managed_dataset_cases",
      "managed_dataset_versions",
      "managed_datasets",
      "projects",
      "quality_gates",
    ]);
  });

  it("round-trips project-scoped quality gates", async () => {
    const input: QualityGateInput = {
      name: "Production",
      suiteName: "support",
      environment: "production",
      minimumCaseCount: 10,
      rules: [
        {
          type: "evaluation_threshold",
          metricName: "quality",
          measure: "pass_rate",
          operator: "gte",
          value: 0.9,
        },
      ],
    };
    const created = await createQualityGate(postgres.db, projectId, input);
    expect(await getQualityGate(postgres.db, projectId, created.id)).toMatchObject(input);
    expect(await listQualityGates(postgres.db, projectId)).toHaveLength(1);
    const updated = await updateQualityGate(postgres.db, projectId, created.id, {
      ...input,
      name: "Updated",
    });
    expect(updated?.name).toBe("Updated");
    expect(await deleteQualityGate(postgres.db, projectId, created.id)).toBe(true);
    expect(await deleteQualityGate(postgres.db, projectId, created.id)).toBe(false);
  });

  it("manages immutable, versioned evaluation datasets", async () => {
    const name = `integration-${Date.now()}`;
    const created = await createManagedDataset(postgres.db, projectId, "integration-user", {
      name,
      description: "Managed integration cases",
    });
    const draft = created.draft;
    expect(draft).toMatchObject({ version: "v1", status: "draft", caseCount: 0 });
    if (draft === null) throw new Error("Expected a v1 draft");
    await upsertManagedDatasetCase(postgres.db, projectId, created.id, draft.id, {
      id: "case-1",
      input: { question: "Hello" },
      expected: "Hi",
    });
    const published = await publishManagedDatasetVersion(
      postgres.db,
      projectId,
      created.id,
      draft.id,
    );
    expect(published).toMatchObject({ status: "published", caseCount: 1 });
    expect(await getPublishedManagedDataset(postgres.db, projectId, name)).toMatchObject({
      version: "v1",
      items: [{ id: "case-1", expected: "Hi" }],
    });
    expect(
      await upsertManagedDatasetCase(postgres.db, projectId, created.id, draft.id, {
        id: "case-2",
        input: "immutable",
      }),
    ).toBeUndefined();
    const next = await createManagedDatasetVersion(
      postgres.db,
      projectId,
      created.id,
      "integration-user",
      "v2",
    );
    expect(next).toMatchObject({ status: "draft", items: [{ id: "case-1" }] });
    expect(
      await getManagedDatasetVersion(postgres.db, projectId, created.id, next?.id ?? ""),
    ).toMatchObject({
      version: "v2",
    });
    expect(await getManagedDataset(postgres.db, projectId, created.id)).toMatchObject({
      name,
      draft: { version: "v2" },
      latestPublished: { version: "v1" },
    });
    await postgres.db.delete(managedDataset).where(eq(managedDataset.id, created.id));
  });

  it("inserts, materializes, queries, and deletes telemetry", async () => {
    await insertSpans(clickhouse, spans());
    await materializeTrace(clickhouse, projectId, traceId);

    const page = await listTraces(clickhouse, projectId, {
      statuses: ["ok"],
      models: ["gpt-test"],
      page: 1,
      pageSize: 10,
      sort: "startedAt",
      order: "desc",
    });
    expect(page).toMatchObject({ total: 1, pageCount: 1 });
    expect(page.items[0]).toMatchObject({
      traceId,
      spanCount: 2,
      generationCount: 1,
      model: "gpt-test",
      totalTokens: 15,
    });
    expect(await getTrace(clickhouse, projectId, traceId)).toMatchObject({
      summary: { traceId },
      spans: [{ spanId: rootSpanId }, { spanId: generationSpanId }],
    });
    const metrics = await queryMetrics(
      clickhouse,
      projectId,
      "24h",
      new Date(now.getTime() + 2_000),
    );
    expect(metrics.current).toMatchObject({ traces: 1, spans: 2, generations: 1 });

    await reconcileProjectRetention(clickhouse, projectId, 7);
  });

  it("round-trips evaluation runs, results, and dataset details", async () => {
    await insertEvaluationRuns(clickhouse, [evaluationRun()]);
    await insertEvaluations(clickhouse, [evaluationResult()]);

    const runs = await listEvaluationRuns(clickhouse, projectId, { page: 1, pageSize: 10 });
    expect(runs.items[0]).toMatchObject({ id: "run-1", results: 1, actualPassed: 1 });
    expect(await getEvaluationRunDetail(clickhouse, projectId, "run-1")).toMatchObject({
      run: { id: "run-1" },
      metrics: [{ metricName: "quality", passed: 1 }],
      cases: [{ caseId: "case-1", outcome: "pass" }],
    });
    expect(
      await getEvaluationDatasetDetail(clickhouse, projectId, "support-cases", "v1"),
    ).toMatchObject({
      name: "support-cases",
      selectedVersion: { version: "v1", status: "complete" },
      cases: [{ caseId: "case-1", conflict: false }],
    });
  });
});

function integrationConfig() {
  const required = ["POSTGRES_URL", "CLICKHOUSE_URL", "REDIS_URL"] as const;
  for (const key of required) {
    if (process.env[key] === undefined) throw new Error(`${key} is required for integration tests`);
  }
  return {
    NODE_ENV: "test" as const,
    PUBLIC_APP_URL: "http://localhost:3000",
    API_PORT: 3001,
    WEB_ORIGIN: "http://localhost:3000",
    POSTGRES_URL: process.env.POSTGRES_URL as string,
    CLICKHOUSE_URL: process.env.CLICKHOUSE_URL as string,
    CLICKHOUSE_DATABASE: "lens",
    CLICKHOUSE_USERNAME: "lens",
    CLICKHOUSE_PASSWORD: "lens",
    REDIS_URL: process.env.REDIS_URL as string,
    BETTER_AUTH_SECRET: "integration-test-secret-at-least-32-characters",
    INGESTION_KEY_PEPPER: "integration-test-pepper",
    SMTP_HOST: "localhost",
    SMTP_PORT: 1025,
    SMTP_FROM: "Lens <lens@localhost>",
    SMTP_SECURE: false,
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    OTLP_MAX_BODY_BYTES: 10 * 1024 * 1024,
    OTLP_RATE_LIMIT_PER_MINUTE: 600,
    LOG_LEVEL: "error" as const,
  };
}

function spans(): NormalizedSpan[] {
  const common = {
    projectId,
    traceId,
    traceState: "",
    kind: 1,
    status: "ok" as const,
    statusMessage: "",
    serviceName: "integration-service",
    scopeName: "integration",
    scopeVersion: "1.0.0",
    resourceAttributes: {},
    spanAttributes: {},
    events: [],
    links: [],
    userId: "customer-1",
    sessionId: "session-1",
    tags: ["integration"],
    version: "v1",
    environment: "test",
    release: "release-1",
    serviceVersion: "1.0.0",
    cachedInputTokens: 0,
    inputCost: null,
    outputCost: null,
    totalCost: null,
    input: null,
    output: null,
    expiresAt: "2026-09-07T00:00:00.000Z",
    ingestedAt: now.toISOString(),
    ingestVersion: "1786060800000000000",
  };
  return [
    {
      ...common,
      spanId: rootSpanId,
      parentSpanId: null,
      name: "support-agent",
      observationKind: "agent",
      startTimeUnixNano: "1786060800000000000",
      endTimeUnixNano: "1786060801000000000",
      durationNano: "1000000000",
      traceName: "Support request",
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    {
      ...common,
      spanId: generationSpanId,
      parentSpanId: rootSpanId,
      name: "generation",
      observationKind: "generation",
      startTimeUnixNano: "1786060800100000000",
      endTimeUnixNano: "1786060800600000000",
      durationNano: "500000000",
      traceName: null,
      model: "gpt-test",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  ];
}

function evaluationRun(): EvaluationRun {
  return {
    projectId,
    id: "run-1",
    status: "completed",
    suiteName: "support",
    startedAt: now.toISOString(),
    completedAt: new Date(now.getTime() + 1_000).toISOString(),
    durationMs: 1_000,
    caseCount: 1,
    metricNames: ["quality"],
    passed: 1,
    failed: 0,
    invalid: 0,
    serviceName: "integration-service",
    environment: "test",
    release: "release-1",
    datasetName: "support-cases",
    datasetVersion: "v1",
    metadata: {},
    expiresAt: "2026-09-07T00:00:00.000Z",
    ingestedAt: now.toISOString(),
    ingestVersion: "1786060800000000001",
    stateVersion: 2,
  };
}

function evaluationResult(): EvaluationResult {
  return {
    projectId,
    id: "result-1",
    runId: "run-1",
    timestamp: now.toISOString(),
    traceId,
    observationId: generationSpanId,
    responseId: null,
    suiteName: "support",
    caseId: "case-1",
    metricName: "quality",
    outcome: "pass",
    dataType: "BOOLEAN",
    numericValue: 1,
    categoricalValue: null,
    explanation: "correct",
    payload: { input: "question", expected: "answer", output: "answer" },
    payloadStatus: "captured",
    configId: null,
    serviceName: "integration-service",
    environment: "test",
    release: "release-1",
    metadata: {},
    expiresAt: "2026-09-07T00:00:00.000Z",
    ingestedAt: now.toISOString(),
    ingestVersion: "1786060800000000002",
  };
}
