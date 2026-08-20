import type { ClickHouseClient } from "@clickhouse/client";
import type { DataDeletionEntityType, DataDeletionRequest } from "@lens/contracts";
import type { dataDeletionRequest } from "./schema.js";

export async function deleteTelemetryEntities(
  client: ClickHouseClient,
  projectId: string,
  entityType: DataDeletionEntityType,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  if (entityType === "trace") {
    await deleteTraces(client, projectId, ids);
    return;
  }
  if (entityType === "session") {
    await deleteSessions(client, projectId, ids);
    return;
  }
  await deleteEvaluationRuns(client, projectId, ids);
}

export function dataDeletionRequestFromRow(
  row: typeof dataDeletionRequest.$inferSelect,
): DataDeletionRequest {
  return {
    id: row.id,
    projectId: row.projectId,
    entityType: row.entityType,
    ids: row.entityIds,
    status: row.status,
    requestedBy: row.requestedBy,
    error: row.status === "failed" ? "Deletion failed after multiple attempts" : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function deleteTraces(client: ClickHouseClient, projectId: string, traceIds: string[]) {
  const params = { projectId, traceIds };
  await deleteTraceEvaluations(client, projectId, traceIds);
  await mutation(
    client,
    "spans",
    "project_id = {projectId:UUID} AND trace_id IN {traceIds:Array(String)}",
    params,
  );
  await mutation(
    client,
    "trace_summaries",
    "project_id = {projectId:UUID} AND trace_id IN {traceIds:Array(String)}",
    params,
  );
}

async function deleteTraceEvaluations(
  client: ClickHouseClient,
  projectId: string,
  traceIds: string[],
) {
  return deleteEvaluations(client, projectId, "toString(trace_id) IN {traceIds:Array(String)}", {
    traceIds,
  });
}

async function deleteEvaluations(
  client: ClickHouseClient,
  projectId: string,
  filter: string,
  filterParams: Record<string, string | string[]>,
) {
  let cursor = "";
  while (true) {
    const result = await client.query({
      query: `SELECT id FROM evaluation_results FINAL
              WHERE project_id = {projectId:UUID}
                AND ${filter}
                AND id > {cursor:String}
              ORDER BY id ASC LIMIT 10000`,
      query_params: { projectId, ...filterParams, cursor },
      format: "JSONEachRow",
    });
    const rows = await result.json<{ id: string }>();
    if (rows.length === 0) return;
    await mutation(
      client,
      "evaluation_results",
      "project_id = {projectId:UUID} AND id IN {evaluationIds:Array(String)}",
      { projectId, evaluationIds: rows.map((row) => row.id) },
    );
    if (rows.length < 10_000) return;
    cursor = rows.at(-1)?.id ?? cursor;
  }
}

async function deleteSessions(client: ClickHouseClient, projectId: string, sessionIds: string[]) {
  let cursor = "";
  while (true) {
    const result = await client.query({
      query: `SELECT toString(trace_id) AS trace_id FROM trace_summaries FINAL
              WHERE project_id = {projectId:UUID}
                AND session_id IN {sessionIds:Array(String)}
                AND toString(trace_id) > {cursor:String}
              ORDER BY trace_id ASC LIMIT 10000`,
      query_params: { projectId, sessionIds, cursor },
      format: "JSONEachRow",
    });
    const rows = await result.json<{ trace_id: string }>();
    if (rows.length === 0) return;
    await deleteTraces(
      client,
      projectId,
      rows.map((row) => row.trace_id),
    );
    if (rows.length < 10_000) return;
    cursor = rows.at(-1)?.trace_id ?? cursor;
  }
}

async function deleteEvaluationRuns(client: ClickHouseClient, projectId: string, runIds: string[]) {
  const params = { projectId, runIds };
  await deleteEvaluations(client, projectId, "toString(run_id) IN {runIds:Array(String)}", {
    runIds,
  });
  await mutation(
    client,
    "evaluation_runs",
    "project_id = {projectId:UUID} AND id IN {runIds:Array(String)}",
    params,
  );
}

async function mutation(
  client: ClickHouseClient,
  table: "evaluation_results" | "evaluation_runs" | "spans" | "trace_summaries",
  where: string,
  queryParams: Record<string, string | string[]>,
) {
  await client.command({
    query: `ALTER TABLE ${table} DELETE WHERE ${where} SETTINGS mutations_sync = 2`,
    query_params: queryParams,
  });
}
