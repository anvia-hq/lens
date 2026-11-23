ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_observation_kind observation_kind TYPE set(20) GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_status status TYPE set(10) GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_model model TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_name name TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4;

ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS input_preview Nullable(String) AFTER model;
ALTER TABLE trace_summaries ADD COLUMN IF NOT EXISTS output_preview Nullable(String) AFTER input_preview;

INSERT INTO trace_summaries
(
  project_id, trace_id, name, service_name, status, started_at, ended_at, duration_ms,
  span_count, generation_count, tool_count, error_count, user_id, session_id, tags, model,
  input_preview, output_preview,
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
  summary.error_count,
  summary.user_id,
  summary.session_id,
  summary.tags,
  summary.model,
  aggregate.input_preview,
  aggregate.output_preview,
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
  summary.summary_version
FROM trace_summaries AS summary FINAL
LEFT JOIN
(
  SELECT
    project_id,
    trace_id,
    nullIf(
      substringUTF8(
        multiIf(
          countIf(parent_span_id = '' AND input IS NOT NULL) > 0,
            argMinIf(ifNull(input, ''), tuple(start_time, span_id), parent_span_id = '' AND input IS NOT NULL),
          countIf(input IS NOT NULL) > 0,
            argMinIf(ifNull(input, ''), tuple(start_time, span_id), input IS NOT NULL),
          ''
        ),
        1,
        2048
      ),
      ''
    ) AS input_preview,
    nullIf(
      substringUTF8(
        multiIf(
          countIf(parent_span_id = '' AND output IS NOT NULL) > 0,
            argMaxIf(ifNull(output, ''), tuple(start_time, span_id), parent_span_id = '' AND output IS NOT NULL),
          countIf(output IS NOT NULL AND observation_kind NOT IN ('tool', 'event')) > 0,
            argMaxIf(ifNull(output, ''), tuple(start_time, span_id), output IS NOT NULL AND observation_kind NOT IN ('tool', 'event')),
          countIf(output IS NOT NULL) > 0,
            argMaxIf(ifNull(output, ''), tuple(start_time, span_id), output IS NOT NULL),
          ''
        ),
        1,
        2048
      ),
      ''
    ) AS output_preview
  FROM spans FINAL
  GROUP BY project_id, trace_id
) AS aggregate USING (project_id, trace_id);
