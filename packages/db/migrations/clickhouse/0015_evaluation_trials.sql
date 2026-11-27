ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS trial Nullable(UInt32) AFTER case_id;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS trial_count Nullable(UInt32) AFTER trial;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS cached Nullable(Bool) AFTER trial_count;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS metric_provider Nullable(String) AFTER metric_name;

ALTER TABLE evaluation_results
ADD COLUMN IF NOT EXISTS metric_model Nullable(String) AFTER metric_provider;
