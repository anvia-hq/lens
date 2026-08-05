CREATE TABLE IF NOT EXISTS spans
(
  project_id UUID,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_span_id String,
  trace_state String,
  name String,
  kind UInt8,
  observation_kind LowCardinality(String),
  status LowCardinality(String),
  status_message String,
  start_time DateTime64(9, 'UTC'),
  end_time DateTime64(9, 'UTC'),
  duration_nano UInt64,
  service_name LowCardinality(String),
  scope_name LowCardinality(String),
  scope_version String,
  resource_attributes String CODEC(ZSTD(3)),
  span_attributes String CODEC(ZSTD(3)),
  events String CODEC(ZSTD(3)),
  links String CODEC(ZSTD(3)),
  trace_name Nullable(String),
  user_id Nullable(String),
  session_id Nullable(String),
  tags Array(String),
  version Nullable(String),
  model Nullable(String),
  input_tokens UInt64,
  output_tokens UInt64,
  total_tokens UInt64,
  input Nullable(String) CODEC(ZSTD(3)),
  output Nullable(String) CODEC(ZSTD(3)),
  expires_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC'),
  ingest_version UInt64
)
ENGINE = ReplacingMergeTree(ingest_version)
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, trace_id, span_id)
TTL expires_at DELETE;

CREATE TABLE IF NOT EXISTS trace_summaries
(
  project_id UUID,
  trace_id FixedString(32),
  name String,
  service_name LowCardinality(String),
  status LowCardinality(String),
  started_at DateTime64(9, 'UTC'),
  ended_at DateTime64(9, 'UTC'),
  duration_ms Float64,
  span_count UInt32,
  generation_count UInt32,
  tool_count UInt32,
  user_id Nullable(String),
  session_id Nullable(String),
  tags Array(String),
  model Nullable(String),
  input_tokens UInt64,
  output_tokens UInt64,
  total_tokens UInt64,
  last_seen_at DateTime64(3, 'UTC'),
  expires_at DateTime64(3, 'UTC'),
  summary_version UInt64
)
ENGINE = ReplacingMergeTree(summary_version)
PARTITION BY toYYYYMM(started_at)
ORDER BY (project_id, trace_id)
TTL expires_at DELETE;
