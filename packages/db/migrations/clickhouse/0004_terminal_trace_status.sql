ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS error_count UInt32 DEFAULT 0 AFTER tool_count;

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
  aggregate.error_count,
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
      countIf(parent_span_id = '') > 0,
      argMinIf(status, tuple(start_time, span_id), parent_span_id = ''),
      argMin(status, tuple(start_time, span_id))
    ) AS root_status,
    countIf(status = 'error') AS error_count
  FROM spans FINAL
  GROUP BY project_id, trace_id
) AS aggregate USING (project_id, trace_id);
