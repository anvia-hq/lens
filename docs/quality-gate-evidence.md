# Quality gate evidence policies

A high pass rate alone does not establish that an evaluation run contains enough usable evidence.
For example, one pass and 99 invalid judgments has a 100% pass rate: invalid and unknown outcomes
are excluded from its denominator. The run-wide `minimumCaseCount` counts distinct evaluated cases
across all metrics and outcomes. It cannot establish coverage for a particular metric.

## Require usable evidence per metric

Evaluation threshold and regression rules accept an optional `evidence` object:

```json
{
  "type": "evaluation_threshold",
  "metricName": "correctness",
  "measure": "pass_rate",
  "operator": "gte",
  "value": 0.95,
  "evidence": {
    "minimumValidCases": 100,
    "maxInvalidRate": 0.01,
    "maxUnknownRate": 0
  }
}
```

- `minimumValidCases` is an integer from 1 to 1,000,000. Only distinct nonempty case IDs with a
  usable judgment for this metric count. Repeated judgments for one case and cases from other
  metrics cannot fill the requirement.
- For `pass_rate`, both pass and fail judgments are usable. A fail is valid evidence even when
  testing an expected negative control with an `lte` rule. Pass rate remains pass / (pass + fail).
- For `average_score`, usable judgments must also have finite numeric scores. With evidence enabled,
  the average includes only those usable scores, excluding invalid and unknown judgments. Missing
  numeric scores cannot fill the score-case minimum. Without evidence enabled, the historical
  average across all numeric scores is preserved.
- `maxInvalidRate` and `maxUnknownRate` are separate fractions from 0 to 1. Each divides the count
  of that outcome by all judgments for this metric. Equality with the budget is allowed. Budgets
  and quality values are judgment-weighted; the evidence minimum alone is distinct-case-based.
  Unnamed judgments affect these rates and averages but never fill the case minimum.
- Threshold rules check candidate evidence. Regression rules require evidence on both candidate and
  baseline. Operational rules continue to require complete trace coverage.

All three evidence settings must be provided together. Missing evidence, a missed minimum, or an
exceeded budget returns `insufficient_data` for that rule. A quality threshold or regression miss
returns `fail`. The overall verdict is `fail` if any rule fails, otherwise `insufficient_data` if
any rule lacks evidence, otherwise `pass`. A CI release must accept only `pass`.

## Existing gates and UI defaults

Existing persisted rules and API-created rules without `evidence` retain their previous behavior.
No data migration is needed; settings are stored in the existing rules JSON. To upgrade a rule,
edit the gate and choose **Require valid evidence**, then set the sample size and budgets for the
suite. Simply editing its name or quality target does not upgrade a legacy rule.

New UI metric rules start with one valid case and zero invalid/unknown tolerance. Increase the
minimum to the sample size required for release approval; one case is an editing default, not a
recommended production sample size. Limits are displayed as percentages in the UI and fractions
in the API. The UI validates with the same contract as the API.

## Public CI endpoint

`POST /api/public/quality-gates/:gateId/evaluate` uses the saved gate policy and the same evaluator as
interactive comparisons. Authenticate with Basic authentication using the project public key as
the username and secret key as the password. Send:

```json
{ "candidateRunId": "candidate", "baselineRunId": "baseline" }
```

A successful check request returns HTTP 200 and a JSON `verdict` of `pass`, `fail`, or
`insufficient_data`, plus per-rule verdicts and explanatory messages. HTTP success does not mean
the gate passed. The response includes the saved evidence limits in `gate.rules` and `rules[].rule`.
Gate checks use database aggregates without loading case payloads; adding evidence limits does not
add per-case queries. Runs must be completed and match the gate's suite and environment.

External documentation impact: mirror this policy in the Lens evaluations/results and quality-gate
pages in the documentation repository when publishing the v1.0 docs.
