ALTER TABLE evaluation_runs
ADD COLUMN IF NOT EXISTS prompt_name Nullable(String) AFTER dataset_version;

ALTER TABLE evaluation_runs
ADD COLUMN IF NOT EXISTS prompt_version Nullable(String) AFTER prompt_name;
