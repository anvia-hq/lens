UPDATE "alert_incidents"
SET "summary" = regexp_replace(
  "summary",
  '^Trace P95 latency is ',
  'P95 trace duration is '
)
WHERE "kind" = 'trace_p95_latency_ms'
  AND "summary" LIKE 'Trace P95 latency is %';
