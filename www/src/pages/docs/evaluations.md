---
layout: ../../layouts/DocsLayout.astro
title: Evaluation workflow
description: Connect test cases to production traces, datasets, comparisons, and release gates.
eyebrow: Evaluations
---

An evaluation run answers a repeatable question about an agent release. In this guide, a support
agent must state the correct policy facts without making the candidate slower or more expensive.

If you have not chosen the failures and metrics yet, start with
[What to evaluate](/docs/evaluations/what-to-evaluate/).

## Example: run a support-policy suite

From a Lens source checkout, configure `examples/anvia-agent/.env` as described in the
[example README](https://github.com/anvia-hq/lens/blob/main/examples/anvia-agent/README.md), then run:

```sh
pnpm example:anvia:eval
```

The example sends three policy questions to a live agent and checks that each response contains the
expected fact. It uses one tracing instance for both the agent and evaluation reporter:

```ts
const tracing = lens.create({ captureMode: "full" });
const reporter = createLensEvalReporter<string, PromptResponse, string>(tracing, {
  includeMetadata: true,
  onMissingTrace: "throw",
});

const suite = await runEvalSuite({
  name: "support-policy-regression",
  run: {
    datasetName: "support-policy-cases",
    datasetVersion: "v1",
  },
  cases,
  target: agentEvalTarget<string>(agent),
  metrics: [
    contains<string, PromptResponse, string>({
      name: "policy-fact-present",
      actual: ({ output }) => output.output,
    }),
  ],
  reporters: [reporter],
  failOnReporterError: true,
});

await tracing.flush();
console.log("Lens run ID:", suite.run.id);
```

The [complete evaluation source](https://github.com/anvia-hq/lens/blob/main/examples/anvia-agent/03_evaluations/01-evaluation-run.ts)
includes the agent, cases, imports, shutdown handling, and console output.

## Expected result

The command prints one row per case and a run ID. Open **Evaluations → Runs** and search for
`support-policy-regression`. You should see:

- A completed run with three cases and the `policy-fact-present` metric.
- Pass or fail outcomes for each expected policy fact.
- Trace coverage for the evaluated agent calls.
- Dataset context `support-policy-cases@v1`.

A completed run can contain failed results. **Completed** means the suite finished; the individual
metric outcomes determine whether its behavior was acceptable.

## How the pieces relate

| Object | Support example | What it answers |
| --- | --- | --- |
| Suite | `support-policy-regression` | Which capability is being tested? |
| Run | The printed run ID | What happened in this execution? |
| Case | `refund-window` | Which input and expected behavior were tested? |
| Metric result | `policy-fact-present` | Did the response include the required fact? |
| Trace | The agent call linked from the case | How did the model and tools produce the response? |

Keep suite, case, and metric names stable. Lens uses them to align results when releases are
compared.

## Turn observed cases into a dataset

The first run creates an observed `support-policy-cases@v1` dataset from reported telemetry. In
**Evaluations → Datasets**, import the complete observed version as managed and publish its draft.
Then run the same suite from the published data:

```sh
pnpm example:anvia:dataset
```

The command should print the resolved dataset name and version before its results. See
[Datasets](/docs/evaluations/datasets/) for the exact UI steps.

## Compare a release and apply a gate

Run the release example:

```sh
pnpm example:anvia:release
```

It creates compatible baseline and candidate runs for `support-release-readiness` and prints both
run IDs. Open **Evaluations → Compare**, assign the older run as baseline, and assign the newer run
as candidate. The case table should show the candidate improving the policy checks.

Create a gate scoped to that suite and environment, require the expected metric to pass, and apply
it to the comparison. Lens returns the verdict; deployment automation decides whether that verdict
blocks a release.

## Workflow reference

1. Choose a failure and evaluator.
2. Run stable cases against the current target.
3. Curate useful cases into a published dataset.
4. Run a candidate with the same suite name and environment.
5. Compare the completed runs and inspect changed cases.
6. Apply a quality gate to the release decision.

If two runs cannot be compared, confirm that both completed and report the same suite name and
environment. See [Runs cannot be compared](/docs/operations/troubleshooting/#runs-cannot-be-compared)
for the full checklist.

Continue with [Runs](/docs/evaluations/runs/) to inspect the first example run.
