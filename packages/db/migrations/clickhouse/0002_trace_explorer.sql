ALTER TABLE spans ADD COLUMN IF NOT EXISTS environment LowCardinality(String) DEFAULT 'default' AFTER version;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS release Nullable(String) AFTER environment;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS service_version Nullable(String) AFTER release;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS input_cost Nullable(Float64) AFTER total_tokens;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS output_cost Nullable(Float64) AFTER input_cost;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS total_cost Nullable(Float64) AFTER output_cost;

ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS environment LowCardinality(String) DEFAULT 'default' AFTER model;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS release Nullable(String) AFTER environment;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS version Nullable(String) AFTER release;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS service_version Nullable(String) AFTER version;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS input_cost Nullable(Float64) AFTER total_tokens;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS output_cost Nullable(Float64) AFTER input_cost;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS total_cost Nullable(Float64) AFTER output_cost;

ALTER TABLE spans UPDATE
  environment = coalesce(
    nullIf(JSONExtractString(span_attributes, 'langfuse.environment'), ''),
    nullIf(JSONExtractString(resource_attributes, 'langfuse.environment'), ''),
    nullIf(JSONExtractString(span_attributes, 'deployment.environment.name'), ''),
    nullIf(JSONExtractString(resource_attributes, 'deployment.environment.name'), ''),
    nullIf(JSONExtractString(span_attributes, 'deployment.environment'), ''),
    nullIf(JSONExtractString(resource_attributes, 'deployment.environment'), ''),
    'default'
  ),
  release = coalesce(
    nullIf(JSONExtractString(span_attributes, 'langfuse.release'), ''),
    nullIf(JSONExtractString(resource_attributes, 'langfuse.release'), '')
  ),
  service_version = coalesce(
    nullIf(JSONExtractString(resource_attributes, 'service.version'), ''),
    nullIf(JSONExtractString(span_attributes, 'service.version'), '')
  ),
  input_cost = if(
    JSONExtractString(span_attributes, 'langfuse.observation.cost_details') = '',
    coalesce(
      toFloat64OrNull(JSONExtractRaw(span_attributes, 'anvia.usage.input_cost')),
      toFloat64OrNull(JSONExtractString(span_attributes, 'anvia.usage.input_cost'))
    ),
    if(
      arrayExists(
        item -> positionCaseInsensitive(item.1, 'input') > 0,
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      ),
      arraySum(arrayMap(
        item -> if(positionCaseInsensitive(item.1, 'input') > 0, item.2, 0),
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      )),
      null
    )
  ),
  output_cost = if(
    JSONExtractString(span_attributes, 'langfuse.observation.cost_details') = '',
    coalesce(
      toFloat64OrNull(JSONExtractRaw(span_attributes, 'anvia.usage.output_cost')),
      toFloat64OrNull(JSONExtractString(span_attributes, 'anvia.usage.output_cost'))
    ),
    if(
      arrayExists(
        item -> positionCaseInsensitive(item.1, 'output') > 0,
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      ),
      arraySum(arrayMap(
        item -> if(positionCaseInsensitive(item.1, 'output') > 0, item.2, 0),
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      )),
      null
    )
  ),
  total_cost = if(
    JSONExtractString(span_attributes, 'langfuse.observation.cost_details') = '',
    coalesce(
      toFloat64OrNull(JSONExtractRaw(span_attributes, 'anvia.usage.total_cost')),
      toFloat64OrNull(JSONExtractString(span_attributes, 'anvia.usage.total_cost')),
      toFloat64OrNull(JSONExtractRaw(span_attributes, 'gen_ai.usage.cost')),
      toFloat64OrNull(JSONExtractString(span_attributes, 'gen_ai.usage.cost'))
    ),
    if(
      arrayExists(
        item -> lower(item.1) IN ('total', 'totalcost', 'total_cost'),
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      ),
      arrayFirst(
        item -> lower(item.1) IN ('total', 'totalcost', 'total_cost'),
        JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
      ).2,
      if(
        empty(JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')),
        null,
        arraySum(arrayMap(
          item -> if(lower(item.1) IN ('total', 'totalcost', 'total_cost'), 0, item.2),
          JSONExtractKeysAndValues(JSONExtractString(span_attributes, 'langfuse.observation.cost_details'), 'Float64')
        ))
      )
    )
  )
WHERE true SETTINGS mutations_sync = 2;

INSERT INTO trace_summaries
(
  project_id, trace_id, name, service_name, status, started_at, ended_at, duration_ms,
  span_count, generation_count, tool_count, user_id, session_id, tags, model,
  environment, release, version, service_version,
  input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost,
  last_seen_at, expires_at, summary_version
)
SELECT
  summary.project_id,
  summary.trace_id,
  summary.name,
  summary.service_name,
  summary.status,
  summary.started_at,
  summary.ended_at,
  summary.duration_ms,
  summary.span_count,
  summary.generation_count,
  summary.tool_count,
  summary.user_id,
  summary.session_id,
  summary.tags,
  summary.model,
  aggregate.environment,
  aggregate.release,
  aggregate.version,
  aggregate.service_version,
  summary.input_tokens,
  summary.output_tokens,
  summary.total_tokens,
  aggregate.input_cost,
  aggregate.output_cost,
  aggregate.total_cost,
  summary.last_seen_at,
  summary.expires_at,
  toUInt64(toUnixTimestamp64Nano(now64(9)))
FROM trace_summaries AS summary FINAL
LEFT JOIN
(
  SELECT
    project_id,
    trace_id,
    argMin(environment, start_time) AS environment,
    nullIf(argMinIf(ifNull(release, ''), start_time, release IS NOT NULL), '') AS release,
    nullIf(argMinIf(ifNull(version, ''), start_time, version IS NOT NULL), '') AS version,
    nullIf(argMinIf(ifNull(service_version, ''), start_time, service_version IS NOT NULL), '') AS service_version,
    if(
      countIf(observation_kind IN ('generation', 'embedding') AND input_cost IS NOT NULL) = 0,
      null,
      sumIf(ifNull(input_cost, 0), observation_kind IN ('generation', 'embedding'))
    ) AS input_cost,
    if(
      countIf(observation_kind IN ('generation', 'embedding') AND output_cost IS NOT NULL) = 0,
      null,
      sumIf(ifNull(output_cost, 0), observation_kind IN ('generation', 'embedding'))
    ) AS output_cost,
    if(
      countIf(observation_kind IN ('generation', 'embedding') AND total_cost IS NOT NULL) = 0,
      null,
      sumIf(ifNull(total_cost, 0), observation_kind IN ('generation', 'embedding'))
    ) AS total_cost
  FROM spans FINAL
  GROUP BY project_id, trace_id
) AS aggregate USING (project_id, trace_id);
