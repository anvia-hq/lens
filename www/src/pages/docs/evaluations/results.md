---
layout: ../../../layouts/DocsLayout.astro
title: Evaluation results
description: Search individual metric outcomes across suites, cases, runs, and releases.
eyebrow: Evaluations
---

Results is the cross-run explorer for individual evaluation metrics. Use it when the question starts
with a metric, outcome, or case rather than one suite execution.

## Example: find every policy failure

After running `pnpm example:anvia:eval` more than once, open **Evaluations → Results**. Filter metric
to `policy-fact-present` and outcome to **Fail**. Search for `refund-window` to narrow the result to
that case across releases and runs.

Open a result and compare its expected fact with the actual output and evaluator explanation. Use
the run link for suite context or the trace link to inspect the model and tool activity that produced
the answer.

**Expected result:** the table shows individual failed metric results rather than one row per run;
clearing the case search reveals every failure for the selected metric and time range.

## Filter results

Search and filter across the selected time range by:

- Suite and case.
- Metric and outcome.
- Source: telemetry or human review.
- Environment, service, and release.
- Run, trace, observation, and result identifiers where supported.

Sort supported headings and change the row count with the pagination controls. The Suite and Case
columns remain separate so each dimension can be scanned independently.

## Read an outcome

- **Pass** and **Fail** are usable evaluator decisions.
- **Invalid** means the supplied result did not satisfy the expected evaluation shape.
- **Unknown** means no pass/fail decision could be derived.
- **Insufficient data** is used where a decision requires data that was not available.

Numeric and categorical values are displayed alongside the outcome where the evaluator supplied
them.

## Open the result inspector

Select a result to open its inspector. The overview reports suite, case, metric, data type,
timestamp, environment, service, and release. Additional sections include:

- Result source and reviewer when it came from a human trace review.

- Evaluator explanation.
- Full Result ID and related Run, Trace, Observation, Response, and Config IDs.
- Input, expected, output, context, and retrieval context payloads.
- Arbitrary result metadata.
- Ingestion time, schema version, expiry, and payload status.

Run and trace identifiers link to their detail views when available. Results intentionally use an
inspector instead of a separate result route, keeping cross-run exploration in the table context.

## Understand payload status

Payload status explains why detail may be missing or partial. Capture can be disabled, unavailable,
redacted, conflicting, or expired independently of the result outcome. Do not treat a missing
payload as an evaluation failure by itself.
