ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS source LowCardinality(String) DEFAULT 'telemetry' AFTER metadata;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS reviewer_id Nullable(String) AFTER source;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS reviewer_name Nullable(String) AFTER reviewer_id;
