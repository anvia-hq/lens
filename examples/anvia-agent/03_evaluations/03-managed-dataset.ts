import { AgentBuilder } from "@anvia/core/agent";
import { agentEvalTarget, contains, runEvalSuite } from "@anvia/core/evals";
import type { PromptResponse } from "@anvia/core/request";
import { createLensDatasetClient, createLensEvalReporter, lens } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

const model = createLiveModel();
const tracing = lens.create({ captureMode: "full" });
const datasetClient = createLensDatasetClient(tracing);
const reporter = createLensEvalReporter<string, PromptResponse, string>(tracing, {
  includeMetadata: true,
  onMissingTrace: "throw",
});
const agent = new AgentBuilder("managed-dataset-agent", model)
  .name("Managed Dataset Agent")
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

const datasetName = process.env.ANVIA_LENS_DATASET_NAME?.trim() || "support-policy-cases";
const requestedVersion = process.env.ANVIA_LENS_DATASET_VERSION?.trim() || undefined;

try {
  const dataset = await datasetClient.getDataset<string, string>(
    datasetName,
    requestedVersion === undefined ? {} : { version: requestedVersion },
  );
  const suite = await runEvalSuite({
    name: "managed-support-policy-regression",
    run: {
      datasetName: dataset.name,
      datasetVersion: dataset.version,
      metadata: { example: "managed-dataset", source: "lens" },
    },
    cases: dataset.items,
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

  console.log(`dataset: ${dataset.name}@${dataset.version}`);
  console.table(
    suite.results.map((result) => ({
      case: result.case.id,
      outcome: result.metrics[0]?.outcome.outcome,
      output: result.output?.output,
    })),
  );
  console.log("run:", suite.run.id);
} finally {
  await tracing.shutdown();
}
