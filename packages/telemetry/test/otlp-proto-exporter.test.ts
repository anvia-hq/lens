import { createServer } from "node:http";
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { describe, expect, it } from "vitest";
import { decodeOtlpRequest } from "../src/index";

describe("OTLP protobuf exporter compatibility", () => {
  it("decodes spans encoded by the official OTLP proto HTTP exporter", async () => {
    const requests: Array<{ contentType: string | undefined; bytes: Uint8Array }> = [];
    const server = createServer((request, response) => {
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({
          contentType:
            typeof request.headers["content-type"] === "string"
              ? request.headers["content-type"]
              : undefined,
          bytes: Buffer.concat(chunks),
        });
        response.writeHead(200, { "Content-Type": "application/x-protobuf" });
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test server did not bind");
    }

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: `http://127.0.0.1:${address.port}/v1/traces`,
      }),
    });

    try {
      sdk.start();
      const tracer = trace.getTracer("langchain-langfuse-test");
      const parent = tracer.startSpan("langchain.chain", { kind: SpanKind.INTERNAL });
      const child = tracer.startSpan(
        "ChatOpenAI",
        { kind: SpanKind.CLIENT },
        trace.setSpan(context.active(), parent),
      );
      child.setAttribute("langfuse.observation.type", "generation");
      child.setStatus({ code: SpanStatusCode.OK });
      child.end();
      parent.end();
      await sdk.shutdown();

      expect(requests.length).toBeGreaterThan(0);
      expect(requests[0]?.contentType).toMatch(/application\/x-protobuf/);

      const spans = requests.flatMap((request) =>
        decodeOtlpRequest(request.bytes, "application/x-protobuf").resourceSpans.flatMap(
          (resourceSpans) => resourceSpans.scopeSpans.flatMap((scopeSpans) => scopeSpans.spans),
        ),
      );
      expect(spans.map((span) => span.name).toSorted()).toEqual(["ChatOpenAI", "langchain.chain"]);
      expect(spans.find((span) => span.name === "ChatOpenAI")).toMatchObject({
        kind: 3,
        status: { code: 1 },
        attributes: [{ key: "langfuse.observation.type", value: "generation" }],
      });
      expect(spans.every((span) => span.startTimeUnixNano !== "0")).toBe(true);
      expect(spans.every((span) => span.endTimeUnixNano !== "0")).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});
