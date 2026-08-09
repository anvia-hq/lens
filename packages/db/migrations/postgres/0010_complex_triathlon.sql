ALTER TABLE "alert_incidents" ADD COLUMN "rule_snapshot" jsonb;--> statement-breakpoint
UPDATE "alert_incidents" AS incident
SET "rule_snapshot" = jsonb_strip_nulls(jsonb_build_object(
	'name', rule."name",
	'enabled', rule."enabled",
	'kind', rule."kind",
	'threshold', rule."threshold",
	'windowMinutes', rule."window_minutes",
	'minimumSamples', rule."minimum_samples",
	'environment', rule."environment",
	'serviceName', rule."service_name",
	'toolName', rule."tool_name",
	'qualityGateId', rule."quality_gate_id"
))
FROM "alert_rules" AS rule
WHERE incident."rule_id" = rule."id" AND incident."rule_snapshot" IS NULL;
