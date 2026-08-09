---
layout: ../../../layouts/DocsLayout.astro
title: Troubleshooting
description: Diagnose startup, authentication, ingestion, cost, evaluation, dataset, and email issues.
eyebrow: Operations
---

Start with service health and logs before changing configuration:

```sh
docker compose ps
docker compose logs --tail=200 migrate api worker web
```

## The stack does not become healthy

Check PostgreSQL, ClickHouse, and Redis health first. The migration service cannot finish until both
databases are available, the API waits for migrations and Redis, and web waits for the API.

Common causes include missing required environment variables, reused or mismatched passwords,
unwritable volumes, insufficient memory, and a failed migration. Fix the earliest unhealthy
dependency rather than restarting downstream services repeatedly.

## Sign-in or invitation fails

Confirm `PUBLIC_APP_URL` and `WEB_ORIGIN` match the browser-facing origin exactly. The first account
can be created only before bootstrap completes.

For an invitation, verify that the complete link was copied, its status is pending, and it has not
expired. Owners and admins can cancel the old invitation and create another.

## Telemetry is not appearing

1. Confirm the application uses the browser-facing Lens base URL.
2. Confirm public and secret keys came from the same active project key.
3. Check API logs for authorization, rate-limit, or body-size rejection.
4. Keep exporter batches below `OTLP_MAX_BODY_BYTES` and request volume below the configured limit.
5. Flush or shut down telemetry before a short-lived process exits.
6. In Traces, clear filters, use the 24-hour range, and refresh.

For Langfuse instrumentation, keep `LANGFUSE_MEDIA_UPLOAD_ENABLED=false` and use the supported v5
OpenTelemetry integration.

## Traces appear without payloads

Safe capture or application redaction may intentionally omit input and output. Evaluation payloads
can also be unavailable, expired, incomplete, or conflicting. Enable full capture only when the data
is approved for export; do not weaken privacy controls only to populate the UI.

## Cost is zero or incorrect

Check that generation spans contain a normalized model name and token counts. In **Cost Settings**,
configure an exact model match with input and output rates. Run a historical recalculation for the
affected date range after changing prices.

Reported costs remain in use when no configured model price matches. Removing a configured price
does not rewrite historical cost automatically.

## An evaluation run remains running

The reporter must receive and export the suite's terminal lifecycle event. Check the evaluation
process for an early exit, ensure the reporter is passed to `runEvalSuite`, and flush tracing before
the process terminates.

A completed suite can still contain failed metric results. Run status and result outcome are
different signals.

## Runs cannot be compared

Both runs must be completed and have the same suite name and environment. Ensure those strings are
stable in instrumentation. Release and dataset version may differ.

If a case appears new or removed unexpectedly, check whether its case ID or metric name changed
between runs.

## An observed dataset cannot be imported

Only complete, conflict-free observed versions can become managed datasets. Every case needs a
captured payload. Inspect the observed version for missing payloads or conflicting values, correct
instrumentation, and produce a new run.

## A managed version cannot be published

Only drafts are editable and a draft must contain at least one case. Published versions are
immutable. Create another draft for subsequent changes.

## Email is not sent

Email delivery requires `SMTP_HOST`, port, sender, and any required credentials. Review API logs for
connection or authentication errors. Invitations do not send mail; copy their generated links from
the Members page.
