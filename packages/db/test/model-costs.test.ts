import type { ClickHouseClient } from "@clickhouse/client";
import type { NormalizedSpan } from "@lens/contracts";
import { describe, expect, it, vi } from "vitest";
import { applyModelPrices, recalculateModelCosts } from "../src/model-costs.js";

const span: NormalizedSpan = {
  projectId: "11111111-1111-4111-8111-111111111111",
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
  parentSpanId: null,
  traceState: "",
  name: "model.turn",
  kind: 1,
  observationKind: "generation",
  status: "ok",
  statusMessage: "",
  startTimeUnixNano: "1",
  endTimeUnixNano: "2",
  durationNano: "1",
  serviceName: "agent",
  scopeName: "test",
  scopeVersion: "1",
  resourceAttributes: {},
  spanAttributes: {},
  events: [],
  links: [],
  traceName: null,
  userId: null,
  sessionId: null,
  tags: [],
  version: null,
  environment: "default",
  release: null,
  serviceVersion: null,
  model: "gpt-priced",
  inputTokens: 1_000_000,
  cachedInputTokens: 250_000,
  outputTokens: 500_000,
  totalTokens: 1_500_000,
  inputCost: 99,
  outputCost: 99,
  totalCost: 198,
  input: null,
  output: null,
  expiresAt: null,
  ingestedAt: "2026-08-06T00:00:00.000Z",
  ingestVersion: "1",
};

describe("model costs", () => {
  it("overrides reported costs and discounts cached input", () => {
    const [priced] = applyModelPrices(
      [span],
      [
        {
          model: "gpt-priced",
          inputPricePerMillion: 4,
          cachedInputPricePerMillion: 1,
          outputPricePerMillion: 10,
        },
      ],
    );
    expect(priced).toMatchObject({ inputCost: 3.25, outputCost: 5, totalCost: 8.25 });
  });

  it("falls back to the input rate for cached tokens and preserves unknown models", () => {
    const prices = [
      {
        model: "gpt-priced",
        inputPricePerMillion: 4,
        cachedInputPricePerMillion: null,
        outputPricePerMillion: 10,
      },
    ];
    expect(applyModelPrices([span], prices)[0]?.inputCost).toBe(4);
    expect(applyModelPrices([{ ...span, model: "unknown" }], prices)[0]?.totalCost).toBe(198);
  });

  it("updates matching spans and rematerializes affected trace costs in bulk", async () => {
    const query = vi.fn(async () => ({ json: async () => [{ spans: "12", traces: "4" }] }));
    const command = vi.fn(
      async (_options: { query: string; query_params?: Record<string, unknown> }) => ({}),
    );
    const client = { query, command } as unknown as ClickHouseClient;
    const result = await recalculateModelCosts(client, {
      projectIds: [span.projectId],
      prices: [
        {
          model: "gpt-priced",
          inputPricePerMillion: 4,
          cachedInputPricePerMillion: null,
          outputPricePerMillion: 10,
        },
      ],
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });

    expect(result).toEqual({ affectedSpans: 12, affectedTraces: 4 });
    expect(command).toHaveBeenCalledTimes(2);
    expect(command.mock.calls[0]?.[0].query).toContain("ALTER TABLE spans UPDATE");
    expect(command.mock.calls[0]?.[0].query).toContain("start_time < {to:DateTime64(3)}");
    expect(command.mock.calls[0]?.[0].query_params).toMatchObject({
      cachedInputPrices: [4],
      outputPrices: [10],
      from: "2026-08-01 00:00:00.000",
      to: "2026-08-02 00:00:00.000",
    });
    expect(command.mock.calls[1]?.[0].query).toContain("INSERT INTO trace_summaries");
  });
});
