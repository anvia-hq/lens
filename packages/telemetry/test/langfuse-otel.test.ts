import { createServer } from "node:http";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { type LangfuseObservationType, startObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { describe, expect, it } from "vitest";
import { decodeOtlpRequest, normalizeOtlpRequest } from "../src/index";

const publicKey = "pk-lens-contract-test";
const secretKey = "sk-lens-contract-test";
const startTypedObservation = startObservation as unknown as (
  name: string,
  attributes: Record<string, unknown>,
  options: { asType: LangfuseObservationType },
) => { end?: () => void };
const observationTypes: LangfuseObservationType[] = [
  "span",
  "generation",
  "event",
  "embedding",
  "agent",
  "tool",
  "chain",
  "retriever",
  "evaluator",
  "guardrail",
];

describe("@langfuse/otel compatibility", () => {
  it("uses the Langfuse OTLP path, Basic auth, JSON transport, and observation attributes", async () => {
    const requests: Array<{
      url: string;
      authorization: string | undefined;
      contentType: string | undefined;
      bytes: Uint8Array;
    }> = [];
    const server = createServer((request, response) => {
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({
          url: request.url ?? "",
          authorization:
            typeof request.headers.authorization === "string"
              ? request.headers.authorization
              : undefined,
          contentType:
            typeof request.headers["content-type"] === "string"
              ? request.headers["content-type"]
              : undefined,
          bytes: Buffer.concat(chunks),
        });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Test server did not bind");

    const processor = new LangfuseSpanProcessor({
      baseUrl: `http://127.0.0.1:${address.port}`,
      publicKey,
      secretKey,
      mediaUploadEnabled: false,
    });
    const sdk = new NodeSDK({ spanProcessors: [processor] });

    try {
      sdk.start();
      for (const type of observationTypes) {
        const observation = startTypedObservation(
          `contract.${type}`,
          type === "generation"
            ? {
                input: [{ role: "user", content: "hello" }],
                output: { text: "hello back" },
                model: "gpt-contract",
                usageDetails: { input: 3, output: 2, total: 5 },
              }
            : { input: { type } },
          { asType: type },
        );
        if (type !== "event") observation.end?.();
      }
      await processor.forceFlush();

      expect(requests.length).toBeGreaterThan(0);
      const expectedAuthorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
      expect(requests.every((request) => request.url === "/api/public/otel/v1/traces")).toBe(true);
      expect(requests.every((request) => request.authorization === expectedAuthorization)).toBe(
        true,
      );
      expect(requests.map((request) => request.contentType)).toEqual(["application/json"]);

      const normalized = requests.flatMap((request) => {
        const decoded = decodeOtlpRequest(request.bytes, "application/json");
        return normalizeOtlpRequest(decoded, {
          projectId: "00000000-0000-0000-0000-000000000001",
          retentionDays: 30,
          now: new Date("2026-08-05T00:00:00.000Z"),
        }).spans;
      });
      expect(normalized.map((span) => span.observationKind).toSorted()).toEqual(
        observationTypes.toSorted(),
      );
      expect(normalized.find((span) => span.observationKind === "generation")).toMatchObject({
        model: "gpt-contract",
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
        input: [{ role: "user", content: "hello" }],
        output: { text: "hello back" },
      });
    } finally {
      await sdk.shutdown();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});
