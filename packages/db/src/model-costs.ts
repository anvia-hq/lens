import type { ClickHouseClient } from "@clickhouse/client";
import type { LlmModelPriceSnapshot, NormalizedSpan } from "@lens/contracts";

export function applyModelPrices(
  spans: NormalizedSpan[],
  prices: LlmModelPriceSnapshot[],
): NormalizedSpan[] {
  const byModel = new Map(prices.map((price) => [price.model, price]));
  return spans.map((span) => {
    if (
      span.model === null ||
      (span.observationKind !== "generation" && span.observationKind !== "embedding")
    ) {
      return span;
    }
    const price = byModel.get(span.model);
    if (price === undefined) return span;
    const cachedInputTokens = Math.min(span.inputTokens, span.cachedInputTokens ?? 0);
    const uncachedInputTokens = span.inputTokens - cachedInputTokens;
    const inputCost =
      (uncachedInputTokens * price.inputPricePerMillion +
        cachedInputTokens * (price.cachedInputPricePerMillion ?? price.inputPricePerMillion)) /
      1_000_000;
    const outputCost = (span.outputTokens * price.outputPricePerMillion) / 1_000_000;
    return {
      ...span,
      cachedInputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  });
}

export async function listObservedModels(
  client: ClickHouseClient,
  projectIds: string[],
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const result = await client.query({
    query: `SELECT assumeNotNull(model) AS model
            FROM spans FINAL
            WHERE project_id IN {projectIds:Array(UUID)}
              AND observation_kind IN ('generation', 'embedding')
              AND model IS NOT NULL AND model != ''
            GROUP BY model ORDER BY model ASC`,
    query_params: { projectIds },
    format: "JSONEachRow",
  });
  return (await result.json<{ model: string }>()).map((row) => row.model);
}

export async function recalculateModelCosts(
  client: ClickHouseClient,
  input: {
    projectIds: string[];
    prices: LlmModelPriceSnapshot[];
    from: string | null;
    to: string | null;
  },
): Promise<{ affectedSpans: number; affectedTraces: number }> {
  if (input.projectIds.length === 0 || input.prices.length === 0) {
    return { affectedSpans: 0, affectedTraces: 0 };
  }

  const models = input.prices.map((price) => price.model);
  const inputPrices = input.prices.map((price) => price.inputPricePerMillion);
  const cachedInputPrices = input.prices.map(
    (price) => price.cachedInputPricePerMillion ?? price.inputPricePerMillion,
  );
  const outputPrices = input.prices.map((price) => price.outputPricePerMillion);
  const { filter, params } = costFilter(input.projectIds, models, input.from, input.to);
  const countsResult = await client.query({
    query: `SELECT count() AS spans, uniqExact(tuple(project_id, trace_id)) AS traces
            FROM spans FINAL WHERE ${filter}`,
    query_params: params,
    format: "JSONEachRow",
  });
  const [counts] = await countsResult.json<{ spans: number | string; traces: number | string }>();
  const affectedSpans = Number(counts?.spans ?? 0);
  const affectedTraces = Number(counts?.traces ?? 0);
  if (affectedSpans === 0) return { affectedSpans, affectedTraces };

  const priceParams = { ...params, inputPrices, cachedInputPrices, outputPrices };
  const modelIndex = "indexOf({models:Array(String)}, assumeNotNull(model))";
  const uncachedTokens = "input_tokens - least(input_tokens, cached_input_tokens)";
  const cachedTokens = "least(input_tokens, cached_input_tokens)";
  const inputExpression = `((${uncachedTokens}) * arrayElement({inputPrices:Array(Float64)}, ${modelIndex}) + (${cachedTokens}) * arrayElement({cachedInputPrices:Array(Float64)}, ${modelIndex})) / 1000000`;
  const outputExpression = `output_tokens * arrayElement({outputPrices:Array(Float64)}, ${modelIndex}) / 1000000`;

  await client.command({
    query: `ALTER TABLE spans UPDATE
              input_cost = ${inputExpression},
              output_cost = ${outputExpression},
              total_cost = ${inputExpression} + ${outputExpression}
            WHERE ${filter} SETTINGS mutations_sync = 2`,
    query_params: priceParams,
  });

  await client.command({
    query: `INSERT INTO trace_summaries
            (
              project_id, trace_id, name, service_name, status, started_at, ended_at, duration_ms,
              span_count, generation_count, tool_count, error_count, user_id, session_id, tags, model,
              environment, release, version, service_version,
              input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost,
              last_seen_at, expires_at, summary_version
            )
            SELECT
              summary.project_id, summary.trace_id, summary.name, summary.service_name,
              summary.status, summary.started_at, summary.ended_at, summary.duration_ms,
              summary.span_count, summary.generation_count, summary.tool_count, summary.error_count, summary.user_id,
              summary.session_id, summary.tags, summary.model, summary.environment, summary.release,
              summary.version, summary.service_version, summary.input_tokens, summary.output_tokens,
              summary.total_tokens, costs.input_cost, costs.output_cost, costs.total_cost,
              summary.last_seen_at, summary.expires_at,
              toUInt64(toUnixTimestamp64Nano(now64(9)))
            FROM trace_summaries AS summary FINAL
            INNER JOIN
            (
              SELECT
                spans.project_id AS project_id,
                spans.trace_id AS trace_id,
                if(
                  countIf(spans.observation_kind IN ('generation', 'embedding') AND spans.input_cost IS NOT NULL) = 0,
                  null,
                  sumIf(ifNull(spans.input_cost, 0), spans.observation_kind IN ('generation', 'embedding'))
                ) AS input_cost,
                if(
                  countIf(spans.observation_kind IN ('generation', 'embedding') AND spans.output_cost IS NOT NULL) = 0,
                  null,
                  sumIf(ifNull(spans.output_cost, 0), spans.observation_kind IN ('generation', 'embedding'))
                ) AS output_cost,
                if(
                  countIf(spans.observation_kind IN ('generation', 'embedding') AND spans.total_cost IS NOT NULL) = 0,
                  null,
                  sumIf(ifNull(spans.total_cost, 0), spans.observation_kind IN ('generation', 'embedding'))
                ) AS total_cost
              FROM spans AS spans FINAL
              INNER JOIN
              (
                SELECT DISTINCT project_id, trace_id FROM spans FINAL WHERE ${filter}
              ) AS affected USING (project_id, trace_id)
              GROUP BY spans.project_id, spans.trace_id
            ) AS costs USING (project_id, trace_id)`,
    query_params: params,
  });

  return { affectedSpans, affectedTraces };
}

function costFilter(
  projectIds: string[],
  models: string[],
  from: string | null,
  to: string | null,
): { filter: string; params: Record<string, string | string[]> } {
  const filters = [
    "project_id IN {projectIds:Array(UUID)}",
    "observation_kind IN ('generation', 'embedding')",
    "model IN {models:Array(String)}",
  ];
  const params: Record<string, string | string[]> = { projectIds, models };
  if (from !== null) {
    filters.push("start_time >= {from:DateTime64(3)}");
    params.from = clickHouseDateTime(from);
  }
  if (to !== null) {
    filters.push("start_time < {to:DateTime64(3)}");
    params.to = clickHouseDateTime(to);
  }
  return { filter: filters.join(" AND "), params };
}

function clickHouseDateTime(value: string): string {
  return value.replace("T", " ").replace("Z", "");
}
