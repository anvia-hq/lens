ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS run_id Nullable(String) AFTER id;

CREATE TABLE IF NOT EXISTS evaluation_runs
(
  project_id UUID,
  id String,
  status LowCardinality(String),
  suite_name LowCardinality(String),
  started_at DateTime64(3, 'UTC'),
  completed_at Nullable(DateTime64(3, 'UTC')),
  duration_ms Nullable(UInt64),
  case_count UInt32,
  metric_names Array(String),
  passed Nullable(UInt32),
  failed Nullable(UInt32),
  invalid Nullable(UInt32),
  service_name LowCardinality(String),
  environment LowCardinality(String),
  release Nullable(String),
  dataset_name Nullable(String),
  dataset_version Nullable(String),
  metadata String CODEC(ZSTD(3)),
  expires_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC'),
  ingest_version UInt64,
  state_version UInt8
)
ENGINE = ReplacingMergeTree(state_version)
PARTITION BY toYYYYMM(started_at)
ORDER BY (project_id, id)
TTL expires_at DELETE;
