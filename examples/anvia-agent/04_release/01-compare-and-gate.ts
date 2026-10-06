import { Agent } from "@anvia/core/agent";
import type { CompletionModel } from "@anvia/core/completion";
import { agentEvalTarget, contains, runEvalSuite } from "@anvia/core/evals";
import type { AgentResponse } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
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
];

const model = createLiveModel();
const releasePrefix = process.env.ANVIA_LENS_RELEASE?.trim() || "example";

const baseline = await runVariant({
  variant: "baseline",
  release: `${releasePrefix}-baseline`,
  instructions:
    "Use this legacy policy: refunds last 14 days and billing administrators change billing settings.",
  model,
});
const candidate = await runVariant({
  variant: "candidate",
  release: `${releasePrefix}-candidate`,
  instructions:
    "Use this current policy: refunds last 30 days and Workspace owners change billing settings.",
  model,
});

console.table([baseline, candidate]);
console.log("Open Lens > Evaluations > Compare and select these two run IDs.");
console.log("Then create a Gate requiring policy-fact-present to pass for every case.");

async function runVariant(options: {
  variant: "baseline" | "candidate";
  release: string;
  instructions: string;
  model: CompletionModel;
}): Promise<{ variant: string; release: string; runId: string; passed: number; failed: number }> {
  const tracing = new LensClient({ release: options.release });
  const reporter = tracing.evalReporter<string, AgentResponse, string>({
    includeMetadata: true,
    includePayloads: true,
    onMissingTrace: "throw",
  });
  const agent = new Agent({
    id: `support-${options.variant}`,
    model: options.model,
    name: `Support ${capitalize(options.variant)}`,
    instructions: `Answer with only the relevant policy fact. ${options.instructions}`,
    observability: {
      observers: { lens: tracing.observer({ captureMode: "full" }) },
      primaryTrace: "lens",
    },
  });

  try {
    const suite = await runEvalSuite({
      name: "support-release-readiness",
      run: {
        datasetName: "support-release-cases",
        datasetVersion: "v1",
        metadata: {
          variant: options.variant,
          promptVersion: options.release,
          synthetic: true,
        },
      },
      cases,
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

    return {
      variant: options.variant,
      release: options.release,
      runId: suite.run.id,
      passed: suite.cases.passed,
      failed: suite.cases.failed,
    };
  } finally {
    await tracing.close();
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
