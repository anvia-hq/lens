import { AgentBuilder } from "@anvia/core/agent";
import { agentEvalTarget, contains, runEvalSuite } from "@anvia/core/evals";
import type { PromptResponse } from "@anvia/core/request";
import { createLensEvalReporter, lens } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

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
    id: "export-retention",
    input: "How long are exported reports retained?",
    expected: "7 days",
  },
];

const model = createLiveModel();
const tracing = lens.create({ captureMode: "full" });
const reporter = createLensEvalReporter<string, PromptResponse, string>(tracing, {
  includeMetadata: true,
  onMissingTrace: "throw",
});
const agent = new AgentBuilder("support-policy-agent", model)
  .name("Support Policy Agent")
  .instructions(
    [
      "Answer with only the relevant policy fact.",
      "Refunds are available for 30 days.",
      "Workspace owners can change billing settings.",
      "Exported reports are retained for 7 days.",
    ].join("\n"),
  )
  .observe(tracing)
  .build();

try {
  const suite = await runEvalSuite({
    name: "support-policy-regression",
    run: {
      datasetName: "support-policy-cases",
      datasetVersion: "v1",
      metadata: { example: "evaluation-run", synthetic: true },
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

  console.table(
    suite.results.map((result) => ({
      case: result.case.id,
      outcome: result.metrics[0]?.outcome.outcome,
      output: result.output?.output,
    })),
  );
  console.log("run:", suite.run.id);
  console.log({ passed: suite.passed, failed: suite.failed, invalid: suite.invalid });
} finally {
  await tracing.shutdown();
}
