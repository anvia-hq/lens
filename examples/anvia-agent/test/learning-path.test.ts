import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Run the actual seven entrypoints through the real OpenAI adapter. The local fixture
// replaces only external HTTP services; Agent, tools, judges, and exporters are real.
test(
  "all seven learning-path entrypoints run against synthetic local services",
  { timeout: 120_000 },
  async (context) => {
    const paths: string[] = [];
    let toolRequests = 0;
    let judgeRequests = 0;
    const outcomes: string[] = [];
    let capturedResults = 0;
    const server = createServer(async (request, response) => {
      const path = request.url ?? "";
      paths.push(path);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      let body: unknown = {};
      if (path === "/v1/chat/completions") {
        const input = JSON.parse(Buffer.concat(chunks).toString()) as {
          messages: Array<{ role: string; content: unknown }>;
          tools?: Array<{ function: { name: string } }>;
          response_format?: unknown;
        };
        const needsTool =
          input.tools?.some(({ function: tool }) => tool.name === "get_ticket") &&
          !input.messages.some(({ role }) => role === "tool");
        const isJudge = input.tools?.some(({ function: tool }) => tool.name === "submit");
        const isBaseline = input.messages.some(
          ({ content }) => typeof content === "string" && content.includes("legacy policy"),
        );
        if (needsTool) toolRequests += 1;
        if (isJudge) judgeRequests += 1;
        body = {
          id: "synthetic-completion",
          object: "chat.completion",
          created: 0,
          model: "synthetic-model",
          choices: [
            {
              index: 0,
              finish_reason: needsTool || isJudge ? "tool_calls" : "stop",
              message:
                needsTool || isJudge
                  ? {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "synthetic-tool-call",
                          type: "function",
                          function: {
                            name: isJudge ? "submit" : "get_ticket",
                            arguments: JSON.stringify(
                              isJudge
                                ? { passed: true, reason: "Synthetic policy match" }
                                : { id: "TICKET-1001" },
                            ),
                          },
                        },
                      ],
                    }
                  : {
                      role: "assistant",
                      content: isBaseline
                        ? "Refunds last 14 days. Billing administrators manage billing."
                        : "Refunds last 30 days. Workspace owners manage billing. Exports last 7 days.",
                    },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        };
      } else if (path.startsWith("/api/public/datasets/")) {
        body = {
          name: "support-policy-cases",
          version: "v1",
          items: [
            { id: "refund-window", input: "How long are refunds available?", expected: "30 days" },
          ],
          meta: { totalPages: 1 },
        };
      } else if (path === "/api/public/otel/v1/logs") {
        const logs = JSON.parse(Buffer.concat(chunks).toString()) as {
          resourceLogs: Array<{
            scopeLogs: Array<{
              logRecords: Array<{
                attributes: Array<{ key: string; value: { stringValue?: string } }>;
              }>;
            }>;
          }>;
        };
        for (const resource of logs.resourceLogs) {
          for (const scope of resource.scopeLogs) {
            for (const record of scope.logRecords) {
              const outcome = record.attributes.find(({ key }) => key === "anvia.eval.outcome")
                ?.value.stringValue;
              if (outcome) {
                outcomes.push(outcome);
                if (
                  record.attributes.some(
                    ({ key, value }) =>
                      key === "anvia.eval.payload.status" && value.stringValue === "captured",
                  )
                )
                  capturedResults += 1;
              }
            }
          }
        }
      } else if (!path.startsWith("/api/public/otel/v1/")) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    context.after(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    for (const script of [
      "01_basics/01-basic-tracing.ts",
      "01_basics/02-trace-context.ts",
      "02_tools/01-tool-tracing.ts",
      "03_evaluations/01-evaluation-run.ts",
      "03_evaluations/02-llm-judge.ts",
      "03_evaluations/03-managed-dataset.ts",
      "04_release/01-compare-and-gate.ts",
    ]) {
      const before = paths.length;
      const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", script], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        timeout: 15_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "synthetic-provider-key",
          OPENAI_MODEL: "synthetic-model",
          OPENAI_BASEURL: `${baseUrl}/v1`,
          OPENAI_COMPLETION_API: "chat",
          ANVIA_LENS_BASE_URL: baseUrl,
          ANVIA_LENS_PUBLIC_KEY: "synthetic-public",
          ANVIA_LENS_SECRET_KEY: "synthetic-secret",
          ANVIA_LENS_SERVICE_NAME: "offline-learning-path",
          ANVIA_LENS_ENVIRONMENT: "test",
          ANVIA_LENS_RELEASE: "synthetic",
          ANVIA_LENS_DATASET_NAME: "support-policy-cases",
          ANVIA_LENS_DATASET_VERSION: "v1",
        },
      });
      assert.ok(stdout.length > 0, `${script} must print its result`);
      assert.ok(
        paths.slice(before).includes("/api/public/otel/v1/traces"),
        `${script} must export traces`,
      );
      if (script.startsWith("03_") || script.startsWith("04_")) {
        assert.ok(
          paths.slice(before).includes("/api/public/otel/v1/logs"),
          `${script} must export evaluations`,
        );
      }
    }
    assert.equal(
      capturedResults,
      outcomes.length,
      "synthetic evaluation inputs/outputs must be available for observed datasets",
    );
    assert.ok(outcomes.includes("pass"));
    assert.ok(outcomes.includes("fail"), "legacy baseline must fail current policy checks");
    assert.ok(
      !outcomes.includes("invalid"),
      "all deterministic and judge metrics must execute successfully",
    );
    assert.equal(toolRequests, 1, "the tool entrypoint must execute a tool round trip");
    assert.equal(judgeRequests, 2, "the judge entrypoint must evaluate both cases");
    assert.ok(paths.some((path) => path.startsWith("/api/public/datasets/support-policy-cases?")));
  },
);
