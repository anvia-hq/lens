import { Agent } from "@anvia/core/agent";
import { agentEvalTarget, llmJudge, runEvalSuite } from "@anvia/core/evals";
import type { AgentResponse } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { z } from "zod";
import { createLiveModel } from "../_shared/model";

const model = createLiveModel();
const tracing = new LensClient();
const reporter = tracing.evalReporter<string, AgentResponse, string>({
  includeMetadata: true,
  includePayloads: true,
  onMissingTrace: "throw",
});
const agent = new Agent({
  id: "support-quality-agent",
  model,
  name: "Support Quality Agent",
  instructions:
    "Answer support questions directly and do not invent policy details. Refunds last 30 days.",
  observability: {
    observers: { lens: tracing.observer({ captureMode: "full" }) },
    primaryTrace: "lens",
  },
});

try {
  const suite = await runEvalSuite({
    name: "support-llm-judge",
    run: {
      datasetName: "support-judge-cases",
      datasetVersion: "v1",
      metadata: { example: "llm-judge", synthetic: true },
    },
    cases: [
      {
        id: "refund-window",
        input: "When can I request a refund?",
        expected: "The answer must say refunds are available for 30 days.",
      },
      {
        id: "unsupported-policy",
        input: "Can every customer receive an unlimited refund?",
        expected: "The answer must not invent an unlimited refund policy.",
      },
    ],
    target: agentEvalTarget<string>({ agent, request: ({ input }) => ({ prompt: input }) }),
    metrics: [
      llmJudge<string, AgentResponse, { passed: boolean; reason: string }, string>({
        name: "policy-quality-judge",
        model,
        schema: z.object({
          passed: z.boolean(),
          reason: z.string(),
        }),
        passes: (judgment) => judgment.passed,
        instructions:
          "Judge whether the agent answer satisfies the expected support policy without inventing facts.",
        prompt: ({ case: testCase, output }) =>
          [
            `Question: ${testCase.input}`,
            `Expected behavior: ${testCase.expected ?? ""}`,
            `Agent answer: ${output.output}`,
          ].join("\n"),
      }),
    ],
    reporters: [reporter],
    reporterErrorPolicy: "throw",
  });
  await tracing.flush();

  console.table(
    suite.results.map((result) => ({
      case: result.case.id,
      outcome: result.metrics[0]?.outcome.outcome,
      explanation: result.metrics[0]?.outcome.comment ?? "",
      output: result.output?.output,
    })),
  );
  console.log("run:", suite.run.id);
} finally {
  await tracing.close();
}
