ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS payload Nullable(String) AFTER explanation;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS payload_status LowCardinality(String) DEFAULT 'not_requested' AFTER payload;
