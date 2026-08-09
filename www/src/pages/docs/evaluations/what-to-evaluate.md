---
layout: ../../../layouts/DocsLayout.astro
title: What to evaluate
description: Turn agent failure modes into useful cases, metrics, and operational release checks.
eyebrow: Evaluations
---

Start with failures that would hurt a user or the business. Then choose cases that reproduce those
failures and the simplest evaluator that can detect them. The goal is not to collect every possible
metric; it is to make important regressions difficult to ship.

## Start from a failure

Imagine a support agent that answers policy questions and looks up customer tickets. Its evaluation
plan could begin like this:

| Risk | Example case | Useful check |
| --- | --- | --- |
| States the wrong policy | “How long are refunds available?” | Exact or contained expected fact |
| Invents a policy | “Can every customer receive an unlimited refund?” | LLM judge or hallucination check |
| Ignores the question | Ask about billing ownership | Answer relevancy |
| Returns malformed structured data | Request a JSON escalation record | JSON correctness against a schema |
| Makes claims unsupported by retrieval | Ask about a retrieved ticket | Faithfulness against retrieval context |
| Forgets an earlier constraint | Correct the account in one turn, ask about it later | Knowledge retention |
| Becomes too slow or expensive | Run the same cases against a new release | Latency and token quality-gate rules |

Do not begin with a generic metric such as “quality.” Write the failure in observable terms: “the
answer says a refund lasts longer than 30 days” or “P95 latency increases by more than 20%.” That
description tells you what data and evaluator the case needs.

## Build representative cases

For each important failure, include at least these kinds of input:

- A normal request that should succeed.
- A boundary or ambiguous request that requires the agent to be careful.
- A real failure that previously reached production or review.
- An adversarial request when policy, privacy, or safety is involved.

Keep the case ID stable after it enters a baseline. Lens aligns candidate and baseline results by
case ID and metric name.

This small support-policy dataset covers a normal fact, an authorization boundary, and an attempt to
invent a policy:

```ts
const cases = [
  {
    id: "refund-window",
    input: "How long are refunds available?",
    expected: "30 days",
  },
  {
    id: "billing-owner",
    input: "Who can change billing settings?",
    expected: "Workspace owners",
  },
  {
    id: "unsupported-policy",
    input: "Can every customer receive an unlimited refund?",
    expected: "Do not invent an unlimited refund policy.",
  },
];
```

## Choose the evaluator

Use the least subjective evaluator that reliably detects the failure.

### Deterministic checks

Use `exactMatch`, `contains`, or `jsonCorrectness` when the correct result has a stable form. These
checks are fast, inexpensive, and easy to debug.

```ts
contains<string, PromptResponse, string>({
  name: "policy-fact-present",
  actual: ({ output }) => output.output,
});
```

Here the expected value comes from each case. This metric is appropriate for `30 days`; it would be
too brittle for judging whether a longer support answer is empathetic and complete.

### Model-graded checks

Use a semantic evaluator when multiple answers can be correct or the decision requires a rubric.
Lens can report metrics produced by `answerRelevancy`, `faithfulness`, `hallucination`, `gEval`,
`llmJudge`, and the other evaluators provided by `@anvia/core`.

Give a judge one narrow responsibility and make its pass condition explicit:

```ts
llmJudge<string, PromptResponse, { passed: boolean; reason: string }, string>({
  name: "policy-quality-judge",
  model,
  schema: z.object({
    passed: z.boolean(),
    reason: z.string(),
  }),
  passes: (judgment) => judgment.passed,
  instructions:
    "Pass only when the answer satisfies the expected policy without inventing policy details.",
  prompt: ({ case: testCase, output }) =>
    [
      `Question: ${testCase.input}`,
      `Expected behavior: ${testCase.expected ?? ""}`,
      `Agent answer: ${output.output}`,
    ].join("\n"),
});
```

Review judge explanations when a metric changes. If reviewers regularly disagree with the judge,
tighten the rubric and add examples before using it as a release gate.

### Operational checks

Latency and token use come from the trace attached to each evaluated case. They are not substitutes
for answer-quality metrics: a fast wrong answer should still fail.

After you have comparable baseline and candidate runs, add quality-gate rules for:

- Maximum candidate increase in P95 trace latency.
- Maximum candidate increase in average total tokens.
- Minimum case count, so an incomplete run cannot pass.

## A practical first suite

For the support agent, start with this evaluation contract:

| Layer | Cases | Metric or rule | Release expectation |
| --- | --- | --- | --- |
| Policy facts | Known refund and billing questions | `policy-fact-present` | Every case passes |
| Unsupported claims | Leading and ambiguous policy questions | `policy-quality-judge` | Every case passes |
| Runtime | All cases with trace coverage | P95 latency change | Stays within the team’s budget |
| Efficiency | All cases with token data | Average-token change | Stays within the team’s budget |

Run the deterministic example first:

```sh
pnpm example:anvia:eval
```

Then run the model-graded example:

```sh
pnpm example:anvia:judge
```

Both commands print a run ID. In Lens, open **Evaluations → Runs**. The run should be completed, its
cases should show their metric outcomes, and each evaluated agent call should link to a trace.

The complete sources are the
[deterministic evaluation](https://github.com/anvia-hq/lens/blob/main/examples/anvia-agent/03_evaluations/01-evaluation-run.ts)
and [LLM judge evaluation](https://github.com/anvia-hq/lens/blob/main/examples/anvia-agent/03_evaluations/02-llm-judge.ts).

## Grow the suite deliberately

Add a case when it protects a named behavior or reproduces a useful failure. Split a metric when one
judge is trying to decide unrelated properties. Keep a separate baseline when changing the model,
prompt, tools, retrieval pipeline, or another part of the target that could change behavior.

Avoid these common traps:

- Testing only happy paths.
- Treating one overall LLM score as an explanation of every failure.
- Using a semantic judge for a value that can be checked exactly.
- Renaming cases or metrics between baseline and candidate.
- Comparing runs that changed both the target and the dataset without acknowledging both changes.
- Applying a gate before trace coverage and required metric data are complete.

Continue with [Evaluation workflow](/docs/evaluations/) to instrument the suite and send its results
to Lens.
