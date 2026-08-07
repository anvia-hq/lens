import type { ClickHouseClient } from "@clickhouse/client";
import type {
  EvaluationDatasetCase,
  EvaluationDatasetDetail,
  EvaluationDatasetSummary,
  EvaluationDatasetVersionSummary,
  EvaluationPayload,
  EvaluationResult,
  EvaluationRunSummary,
  Page,
} from "@lens/contracts";
import { listEvaluationRunsForDataset, listRunResults } from "./evaluation-run-store.js";

type DatasetRow = {
  name: string;
  version_count: number | string;
  run_count: number | string;
  latest_version: string | null;
  latest_run_at: string;
};

type VersionRow = {
  version: string | null;
  run_count: number | string;
  case_count: number | string;
  first_seen_at: string;
  last_seen_at: string;
};

export async function listEvaluationDatasets(
  client: ClickHouseClient,
  projectId: string,
  options: { search?: string; page?: number; pageSize?: number } = {},
): Promise<Page<EvaluationDatasetSummary>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 25) ? (options.pageSize ?? 25) : 25;
  const offset = (page - 1) * pageSize;
  const searchFilter =
    options.search === undefined
      ? ""
      : "AND positionCaseInsensitive(dataset_name, {search:String}) > 0";
  const params = { projectId, ...(options.search === undefined ? {} : { search: options.search }) };
  const [rowsResult, countResult] = await Promise.all([
    client.query({
      query: `SELECT dataset_name AS name,
                     uniqExact(ifNull(dataset_version, '')) AS version_count,
                     count() AS run_count,
                     argMax(dataset_version, tuple(started_at, id)) AS latest_version,
                     max(started_at) AS latest_run_at
              FROM evaluation_runs FINAL
              WHERE project_id = {projectId:UUID}
                AND dataset_name IS NOT NULL AND dataset_name != '' ${searchFilter}
              GROUP BY dataset_name
              ORDER BY latest_run_at DESC, name ASC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT uniqExact(dataset_name) AS total
              FROM evaluation_runs FINAL
              WHERE project_id = {projectId:UUID}
                AND dataset_name IS NOT NULL AND dataset_name != '' ${searchFilter}`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await rowsResult.json<DatasetRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map((row) => ({
      name: row.name,
      versionCount: numeric(row.version_count),
      runCount: numeric(row.run_count),
      latestVersion: row.latest_version,
      latestRunAt: isoTime(row.latest_run_at),
    })),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function getEvaluationDatasetDetail(
  client: ClickHouseClient,
  projectId: string,
  datasetName: string,
  requestedVersion?: string | null,
): Promise<EvaluationDatasetDetail | undefined> {
  const versionResult = await client.query({
    query: `SELECT dataset_version AS version,
                   count() AS run_count,
                   max(case_count) AS case_count,
                   min(started_at) AS first_seen_at,
                   max(started_at) AS last_seen_at
            FROM evaluation_runs FINAL
            WHERE project_id = {projectId:UUID} AND dataset_name = {datasetName:String}
            GROUP BY dataset_version
            ORDER BY last_seen_at DESC, version ASC`,
    query_params: { projectId, datasetName },
    format: "JSONEachRow",
  });
  const rows = await versionResult.json<VersionRow>();
  if (rows.length === 0) return undefined;

  const analyses = await Promise.all(
    rows.map(async (row) => {
      const runs = await listEvaluationRunsForDataset(client, projectId, datasetName, row.version);
      const results = await Promise.all(
        runs.map(async (run) => ({
          run,
          results: await listRunResults(client, projectId, run.id),
        })),
      );
      return analyzeVersion(row, runs, results);
    }),
  );
  const selected =
    requestedVersion === undefined
      ? analyses[0]
      : analyses.find((item) => item.summary.version === requestedVersion);
  if (selected === undefined) return undefined;
  return {
    name: datasetName,
    selectedVersion: selected.summary,
    versions: analyses.map((item) => item.summary),
    cases: selected.cases,
    runs: selected.runs,
  };
}

function analyzeVersion(
  row: VersionRow,
  runs: EvaluationRunSummary[],
  entries: Array<{ run: EvaluationRunSummary; results: EvaluationResult[] }>,
): {
  summary: EvaluationDatasetVersionSummary;
  cases: EvaluationDatasetCase[];
  runs: EvaluationRunSummary[];
} {
  const snapshots = entries.map(({ run, results }) => ({ run, cases: caseSnapshot(results) }));
  const complete = snapshots
    .filter(
      (snapshot) =>
        snapshot.run.status === "completed" &&
        snapshot.cases.size === snapshot.run.caseCount &&
        Array.from(snapshot.cases.values()).every((item) => item.payload !== null),
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.run.startedAt) - Date.parse(right.run.startedAt) ||
        left.run.id.localeCompare(right.run.id),
    );
  const canonical = complete[0];
  const canonicalHash = canonical === undefined ? null : snapshotHash(canonical.cases);
  const conflicting =
    canonicalHash !== null &&
    complete.some((snapshot) => snapshotHash(snapshot.cases) !== canonicalHash);
  const fallback = canonical ?? snapshots[0];
  const cases = Array.from(fallback?.cases.values() ?? [])
    .map((item) => ({
      caseId: item.caseId,
      payload: item.payload,
      payloadStatus: item.payloadStatus,
      conflict:
        canonical !== undefined &&
        complete.some(
          (snapshot) =>
            caseDefinition(snapshot.cases.get(item.caseId)?.payload) !==
            caseDefinition(item.payload),
        ),
    }))
    .toSorted((left, right) => left.caseId.localeCompare(right.caseId));
  return {
    summary: {
      version: row.version,
      status: conflicting ? "conflict" : canonical === undefined ? "incomplete" : "complete",
      caseCount: canonical?.cases.size ?? numeric(row.case_count),
      runCount: numeric(row.run_count),
      firstSeenAt: isoTime(row.first_seen_at),
      lastSeenAt: isoTime(row.last_seen_at),
      canonicalRunId: canonical?.run.id ?? null,
    },
    cases,
    runs,
  };
}

function caseSnapshot(results: EvaluationResult[]) {
  const cases = new Map<
    string,
    {
      caseId: string;
      payload: EvaluationPayload | null;
      payloadStatus: EvaluationResult["payloadStatus"];
    }
  >();
  for (const result of results) {
    if (result.caseId === null || cases.has(result.caseId)) continue;
    cases.set(result.caseId, {
      caseId: result.caseId,
      payload: result.payload,
      payloadStatus: result.payloadStatus,
    });
  }
  return cases;
}

function snapshotHash(cases: ReturnType<typeof caseSnapshot>): string {
  return stableJson(
    Array.from(cases.entries())
      .map(([caseId, value]) => [caseId, caseDefinitionValue(value.payload)])
      .toSorted(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

function caseDefinition(payload: EvaluationPayload | null | undefined): string {
  return stableJson(caseDefinitionValue(payload));
}

function caseDefinitionValue(payload: EvaluationPayload | null | undefined) {
  if (payload === null || payload === undefined) return null;
  return {
    input: payload.input,
    ...(payload.expected === undefined ? {} : { expected: payload.expected }),
    ...(payload.context === undefined ? {} : { context: payload.context }),
    ...(payload.retrievalContext === undefined
      ? {}
      : { retrievalContext: payload.retrievalContext }),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function numeric(value: number | string | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function isoTime(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
