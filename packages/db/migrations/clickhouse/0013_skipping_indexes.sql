ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_start_time start_time TYPE minmax GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_ingested_at ingested_at TYPE minmax GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 4;

ALTER TABLE trace_summaries ADD INDEX IF NOT EXISTS idx_trace_summaries_started_at started_at TYPE minmax GRANULARITY 4;
ALTER TABLE trace_summaries ADD INDEX IF NOT EXISTS idx_trace_summaries_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE trace_summaries ADD INDEX IF NOT EXISTS idx_trace_summaries_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 4;

ALTER TABLE evaluation_results ADD INDEX IF NOT EXISTS idx_evaluation_results_timestamp timestamp TYPE minmax GRANULARITY 4;
ALTER TABLE evaluation_results ADD INDEX IF NOT EXISTS idx_evaluation_results_run_id run_id TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE evaluation_results ADD INDEX IF NOT EXISTS idx_evaluation_results_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4;

ALTER TABLE evaluation_runs ADD INDEX IF NOT EXISTS idx_evaluation_runs_started_at started_at TYPE minmax GRANULARITY 4;
