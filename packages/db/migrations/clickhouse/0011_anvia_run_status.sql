ALTER TABLE spans ADD COLUMN IF NOT EXISTS run_status LowCardinality(String) DEFAULT JSONExtractString(span_attributes, 'anvia.run.status') AFTER status_message;

ALTER TABLE spans UPDATE parent_span_id = ''
WHERE parent_span_id = '0000000000000001'
  AND (
    JSONHas(span_attributes, 'anvia.run.id')
    OR JSONHas(span_attributes, 'anvia.run.max_turns')
    OR JSONHas(span_attributes, 'anvia.pipeline.id')
  )
SETTINGS mutations_sync = 2;

INSERT INTO trace_summaries
(
  project_id, trace_id, name, service_name, status, started_at, ended_at, duration_ms,
  span_count, generation_count, tool_count, error_count, user_id, session_id, tags, model,
  environment, release, version, service_version,
  input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost,
  last_seen_at, expires_at, summary_version
)
SELECT
  summary.project_id,
  summary.trace_id,
  summary.name,
  summary.service_name,
  aggregate.root_status,
  summary.started_at,
  summary.ended_at,
  summary.duration_ms,
  summary.span_count,
  summary.generation_count,
  summary.tool_count,
  summary.error_count,
  summary.user_id,
  summary.session_id,
  summary.tags,
  summary.model,
  summary.environment,
  summary.release,
  summary.version,
  summary.service_version,
  summary.input_tokens,
  summary.output_tokens,
  summary.total_tokens,
  summary.input_cost,
  summary.output_cost,
  summary.total_cost,
  summary.last_seen_at,
  summary.expires_at,
  toUInt64(toUnixTimestamp64Nano(now64(9)))
FROM trace_summaries AS summary FINAL
INNER JOIN
(
  SELECT
    project_id,
    trace_id,
    if(
      argMaxIf(run_status, tuple(start_time, span_id), parent_span_id = '' AND run_status != '') = 'suspended',
      'running',
      argMaxIf(status, tuple(start_time, span_id), parent_span_id = '' AND run_status != '')
    ) AS root_status
  FROM spans FINAL
  GROUP BY project_id, trace_id
  HAVING countIf(parent_span_id = '' AND run_status != '') > 0
) AS aggregate USING (project_id, trace_id);
