---
layout: ../../layouts/DocsLayout.astro
title: Overview dashboard
description: Read the project health, usage, duration, and cost signals for a selected time window.
eyebrow: Observability
---

The project overview is the fastest way to establish whether activity, errors, duration, tokens, or
cost changed before opening individual traces.

<figure>
  <img src="/images/docs/overview.png" alt="Dark Anvia Lens overview showing token, cost, trace, error, duration, and session metrics above activity charts" loading="lazy" decoding="async" />
  <figcaption>The 24-hour project overview with synthetic production telemetry.</figcaption>
</figure>

## Example: find where a slowdown started

Suppose support-agent duration increased after a release. Select **24h** and compare P95 generation
duration with the previous 24 hours. Find the point where the duration chart rises, then check the
service and model breakdowns for the same window. Open a slow trace from the ranking to continue at
request level.

For a populated local workspace, load the development seed data from a source checkout:

```sh
docker compose -f docker-compose.dev.yml run --rm seed
```

**Expected result:** the overview shows non-empty trace, token, error, duration, session, service, and
model summaries. Moving to **Traces** keeps the investigation focused on the selected project; use
the same time range when narrowing the slowdown.

## Select a time range

Choose **24h**, **7d**, or **30d** in the page header. Every summary, chart, model breakdown, service
breakdown, and trace ranking uses the selected window. Comparison text uses the immediately
preceding window of the same length when enough prior data exists.

Use the refresh control to fetch immediately or select an automatic refresh interval while
monitoring live traffic.

## Read the summary

The top metrics report:

- Total tokens and total calculated cost.
- Average tokens per generation and number of active models.
- Trace count and trace error rate.
- P95 generation duration and active session count.

“No prior baseline” means Lens has current data but cannot calculate a meaningful comparison for
the preceding period.

## Follow changes over time

The charts separate input and output tokens, trace and generation throughput, failed traces, and
P50/P95 generation duration. Use them to identify when a change started before filtering the trace
explorer to the same time period.

## Find expensive or unreliable activity

Model efficiency groups usage, duration, and reliability by generation model. Service cards compare
token load and trace health across instrumented services. **Tool health** ranks tool spans by call
count and reports P95 call duration and error rate. The trace rankings highlight token-heavy traces and
recent failures that are good starting points for an investigation.

## Choose the next view

Open [Traces](/docs/observability/traces/) for request-level filtering, or use
[Sessions](/docs/observability/sessions/) and [Users](/docs/observability/users/) when the problem
spans multiple requests. If cost is missing or incorrect, review
[Cost settings](/docs/observability/costs/). To turn recurring runtime or quality problems into an
in-app incident workflow, configure [Alerts](/docs/observability/alerts/).
