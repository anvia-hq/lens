import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouseDateTimeParam, ensureIso } from "./values.js";

export type IngestionThroughput = {
  lastEventAt: string | null;
  spansLastHour: number;
  spansLast24h: number;
  activeProjects24h: number;
};

type IngestionThroughputRow = {
  spans_last_hour: number | string;
  spans_last_24h: number | string;
  active_projects_24h: number | string;
  last_event_at: string | null;
};

export async function queryIngestionThroughput(
  client: ClickHouseClient,
  now = new Date(),
): Promise<IngestionThroughput> {
  const from24h = new Date(now.getTime() - 24 * 3_600_000);
  const from1h = new Date(now.getTime() - 3_600_000);
  const result = await client.query({
    query: `
      SELECT
        countIf(ingested_at >= {from1h:DateTime64(3)}) AS spans_last_hour,
        count() AS spans_last_24h,
        uniqExact(project_id) AS active_projects_24h,
        max(ingested_at) AS last_event_at
      FROM spans
      WHERE ingested_at >= {from24h:DateTime64(3)}
    `,
    query_params: {
      from1h: clickHouseDateTimeParam(from1h.toISOString()),
      from24h: clickHouseDateTimeParam(from24h.toISOString()),
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<IngestionThroughputRow>();
  const row = rows[0];
  const lastEventAt = row?.last_event_at ?? null;
  return {
    lastEventAt: lastEventAt === null ? null : ensureIso(lastEventAt),
    spansLastHour: Number(row?.spans_last_hour ?? 0),
    spansLast24h: Number(row?.spans_last_24h ?? 0),
    activeProjects24h: Number(row?.active_projects_24h ?? 0),
  };
}

export async function queryProjectLastEventAt(
  client: ClickHouseClient,
  projectId: string,
  now = new Date(),
): Promise<string | null> {
  const from30d = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const result = await client.query({
    query: `
      SELECT max(ingested_at) AS last_event_at
      FROM spans
      WHERE project_id = {projectId:UUID} AND ingested_at >= {from:DateTime64(3)}
    `,
    query_params: {
      projectId,
      from: clickHouseDateTimeParam(from30d.toISOString()),
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ last_event_at: string | null }>();
  const lastEventAt = rows[0]?.last_event_at ?? null;
  return lastEventAt === null ? null : ensureIso(lastEventAt);
}
