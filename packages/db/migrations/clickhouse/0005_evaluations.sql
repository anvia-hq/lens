CREATE TABLE IF NOT EXISTS evaluation_results
(
  project_id UUID,
  id String,
  timestamp DateTime64(3, 'UTC'),
  trace_id Nullable(FixedString(32)),
  observation_id Nullable(FixedString(16)),
  response_id Nullable(String),
  suite_name LowCardinality(String),
  case_id Nullable(String),
  metric_name LowCardinality(String),
  outcome LowCardinality(String),
  data_type Nullable(String),
  numeric_value Nullable(Float64),
  categorical_value Nullable(String),
  explanation Nullable(String),
  config_id Nullable(String),
  service_name LowCardinality(String),
  environment LowCardinality(String),
  release Nullable(String),
  metadata String CODEC(ZSTD(3)),
  expires_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC'),
  ingest_version UInt64
)
ENGINE = ReplacingMergeTree(ingest_version)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, id)
TTL expires_at DELETE;
