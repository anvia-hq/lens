import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Agent, type AgentResponse } from "@anvia/core/agent";
import { type CompletionModel, Usage } from "@anvia/core/completion";
import { agentEvalTarget, contains, runEvalSuite } from "@anvia/core/evals";
import { LensClient } from "@anvia/lens";

// Only synthetic data and loopback HTTP are used. This exercises the installed SDKs,
// including their real OTLP exporters, without a provider, credentials, or Lens server.
test(
  "exports Agent traces and correlated evaluation lifecycle/results",
  { timeout: 15_000 },
  async (context) => {
    const requests: Array<{ path: string; body: OtlpBody }> = [];
    const collector = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        path: request.url ?? "",
        body: JSON.parse(Buffer.concat(chunks).toString()),
      });
      response.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
    await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
    context.after(
      () =>
        new Promise<void>((resolve, reject) =>
          collector.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = collector.address();
    assert.ok(address && typeof address !== "string");
    const tracing = new LensClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      publicKey: "synthetic-public",
      secretKey: "synthetic-secret",
      timeoutMs: 2_000,
      serviceName: "offline-sdk-regression",
    });
    let calls = 0;
    const model: CompletionModel = {
      provider: "offline",
      modelId: "synthetic-policy",
      capabilities: {
        streaming: false,
        tools: false,
        toolChoice: false,
        imageInput: false,
        documentInput: false,
        outputSchema: false,
        reasoning: false,
      },
      async completion() {
        calls += 1;
        return {
          choice: [{ type: "text", text: "Refunds are available for 30 days." }],
          usage: Usage.empty(),
          finishReason: "stop",
          rawResponse: {},
        };
      },
    };
    try {
      const agent = new Agent({
        id: "offline-support",
        model,
        observability: {
          observers: { lens: tracing.observer({ captureMode: "full" }) },
          primaryTrace: "lens",
        },
      });
      const suite = await runEvalSuite({
        name: "offline-sdk-regression",
        run: { datasetName: "synthetic-policies", datasetVersion: "v1" },
        cases: [
          { id: "passes", input: "What is the refund window?", expected: "30 days" },
          { id: "fails", input: "What is the refund window?", expected: "14 days" },
        ],
        target: agentEvalTarget<string>({ agent, request: ({ input }) => ({ prompt: input }) }),
        metrics: [
          contains<string, AgentResponse, string>({ actual: ({ output }) => output.output }),
        ],
        reporters: [tracing.evalReporter({ onMissingTrace: "throw", includeMetadata: true })],
        reporterErrorPolicy: "throw",
      });
      await tracing.flush();
      assert.equal(calls, 2);
      assert.deepEqual(suite.cases, { total: 2, passed: 1, failed: 1, invalid: 0 });
      assert.deepEqual(suite.reporterErrors, []);
      const spans = requests
        .filter(({ path }) => path === "/api/public/otel/v1/traces")
        .flatMap(({ body }) => body.resourceSpans ?? [])
        .flatMap(({ scopeSpans }) => scopeSpans.flatMap(({ spans }) => spans));
      const logs = requests
        .filter(({ path }) => path === "/api/public/otel/v1/logs")
        .flatMap(({ body }) => body.resourceLogs ?? [])
        .flatMap(({ scopeLogs }) => scopeLogs.flatMap(({ logRecords }) => logRecords));
      assert.ok(spans.length >= 4, "both Agent runs and their generations must be exported");
      for (const result of suite.results) {
        const traceId = result.output?.trace?.traceId;
        assert.ok(traceId, "Agent response must include the primary Lens trace");
        assert.ok(spans.some((span) => span.traceId === traceId));
        assert.ok(logs.some((log) => attribute(log, "anvia.eval.target.trace_id") === traceId));
      }
      const runLogs = logs.filter((log) => attribute(log, "anvia.eval.run.id") === suite.run.id);
      assert.ok(runLogs.some((log) => attribute(log, "anvia.eval.run.status") === "running"));
      assert.ok(runLogs.some((log) => attribute(log, "anvia.eval.run.status") === "completed"));
      assert.ok(runLogs.some((log) => attribute(log, "anvia.eval.outcome") === "pass"));
      assert.ok(runLogs.some((log) => attribute(log, "anvia.eval.outcome") === "fail"));
    } finally {
      await tracing.close();
    }
  },
);

type LogRecord = { attributes: Array<{ key: string; value: { stringValue?: string } }> };
type OtlpBody = {
  resourceSpans?: Array<{ scopeSpans: Array<{ spans: Array<{ traceId: string }> }> }>;
  resourceLogs?: Array<{ scopeLogs: Array<{ logRecords: LogRecord[] }> }>;
};
function attribute(record: LogRecord, key: string): string | undefined {
  return record.attributes.find((entry) => entry.key === key)?.value.stringValue;
}
