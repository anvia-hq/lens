---
layout: ../../../layouts/DocsLayout.astro
title: Quality gates
description: Define reusable release checks for evaluation and operational regressions.
eyebrow: Evaluations
---

A quality gate is a project-scoped policy for one evaluation suite and environment. Apply it while
comparing a candidate with a baseline to obtain a release verdict.

<figure>
  <img src="/images/docs/quality-gate.png" alt="Anvia Lens quality gate editor with suite and environment scope, minimum case count, and a metric target approval rule" loading="lazy" decoding="async" />
  <figcaption>Each gate combines scope, minimum data, and one or more approval rules.</figcaption>
</figure>

Owners and admins can create, edit, and delete gates. Members can view gates and their comparison
verdicts.

## Example: require correct policy answers

After running `pnpm example:anvia:release`, create a gate with these values:

| Field | Value |
| --- | --- |
| Name | `Support policy release` |
| Suite | `support-release-readiness` |
| Environment | The environment configured by the example |
| Minimum evaluated cases | `2` |
| Rule | `policy-fact-present` pass rate is at least `100%` |

Open **Compare**, select the example’s candidate and baseline, then apply the gate.

**Expected result:** Lens shows **Pass** only when both candidate cases have usable passing results.
A missing metric, incomplete case count, or unavailable comparison value produces **Insufficient
data**, not approval.

## Define gate scope

Give the gate a unique, recognizable name, then enter the exact suite name and environment emitted
by evaluation instrumentation. A gate appears in Compare only when its scope matches the selected
candidate.

Set **Minimum evaluated cases** to prevent a small or incomplete run from being approved. The
allowed range is 1 to 1,000,000 cases.

## Add approval rules

Every gate requires at least one rule, and every rule must pass for the final verdict to pass. A gate
supports up to 25 rules.

### Metric meets a target

Require a named metric's pass rate or average score to be at least or at most a fixed value. Pass
rate is entered as a percentage in the UI.

### Metric change stays within a limit

Limit how far a named metric's pass rate or average score may decrease or increase relative to the
baseline. Pass-rate change is expressed in percentage points.

### Operational metric stays within a limit

Limit the candidate's percentage increase in P95 trace latency or average total tokens.

## Interpret verdicts

- **Pass** means minimum case count and every rule passed.
- **Fail** means at least one check exceeded its allowed value.
- **Insufficient data** means Lens could not calculate one or more required checks.

The verdict panel explains every rule and displays candidate and baseline values. Investigate
insufficient data rather than treating it as approval.

## Use a gate in releases

Select the gate on [Compare](/docs/evaluations/compare/). Lens evaluates the policy for the chosen
runs.

To enforce the same gate in CI, call the public check endpoint with the project's public and secret
keys using HTTP Basic authentication:

```sh
curl -fsS \
  -u "$LENS_PUBLIC_KEY:$LENS_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"candidateRunId\":\"$CANDIDATE_RUN_ID\",\"baselineRunId\":\"$BASELINE_RUN_ID\"}" \
  "$LENS_BASE_URL/api/public/quality-gates/$GATE_ID/evaluate" \
  | tee quality-gate.json \
  | jq -e '.verdict == "pass"'
```

The response includes the gate, candidate and baseline run IDs, final verdict, and every rule
result. Invalid credentials return `401`; missing runs or gates return `404`; incomplete or
incompatible runs return `400`. A valid check can return `pass`, `fail`, or `insufficient_data`, so
CI should approve only `pass`.
