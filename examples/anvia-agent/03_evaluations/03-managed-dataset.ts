import { Agent } from "@anvia/core/agent";
import { agentEvalTarget, contains, runEvalSuite } from "@anvia/core/evals";
import type { AgentResponse } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

const model = createLiveModel();
const tracing = new LensClient();
const datasetClient = tracing.datasetClient();
const reporter = tracing.evalReporter<string, AgentResponse, string>({
  includeMetadata: true,
  includePayloads: true,
  onMissingTrace: "throw",
});
const agent = new Agent({
  id: "managed-dataset-agent",
  model,
  name: "Managed Dataset Agent",
  instructions: [
    "Answer with only the relevant policy fact.",
    "Refunds are available for 30 days.",
    "Workspace owners can change billing settings.",
    "Exported reports are retained for 7 days.",
  ].join("\n"),
  observability: {
    observers: { lens: tracing.observer({ captureMode: "full" }) },
    primaryTrace: "lens",
  },
});

const datasetName = process.env.ANVIA_LENS_DATASET_NAME?.trim() || "support-policy-cases";
const requestedVersion = process.env.ANVIA_LENS_DATASET_VERSION?.trim() || undefined;

try {
  const dataset = await datasetClient.getDataset<string, string>({
    name: datasetName,
    ...(requestedVersion === undefined ? {} : { version: requestedVersion }),
  });
  const suite = await runEvalSuite({
    name: "managed-support-policy-regression",
    run: {
      datasetName: dataset.name,
      datasetVersion: dataset.version,
      metadata: { example: "managed-dataset", source: "lens" },
    },
    cases: dataset.items.map(({ id, input, expected }) => {
      if (typeof input !== "string" || typeof expected !== "string") {
        throw new Error(`Dataset case ${id} requires string input and expected output`);
      }
      return { id, input, expected };
    }),
    target: agentEvalTarget<string>({ agent, request: ({ input }) => ({ prompt: input }) }),
    metrics: [
      contains<string, AgentResponse, string>({
        name: "policy-fact-present",
        actual: ({ output }) => output.output,
      }),
    ],
    reporters: [reporter],
    reporterErrorPolicy: "throw",
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
  await tracing.close();
}
