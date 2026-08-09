import { describe, expect, it } from "vitest";
import { incidentPromotionItems } from "./alert-incident-view";

describe("incident dataset promotion", () => {
  it("never treats the observed failed output as expected output", () => {
    const [item] = incidentPromotionItems(
      [
        {
          traceId: "trace-1",
          id: "trace-1",
          input: '{"question":"Help"}',
          expected: "",
          observed: '{"answer":"wrong"}',
        },
      ],
      { id: "incident-1", kind: "trace_error_rate", ruleName: "Production errors" },
    );

    expect(item).toEqual({
      id: "trace-1",
      input: { question: "Help" },
      metadata: {
        sourceIncidentId: "incident-1",
        sourceTraceId: "trace-1",
        alertKind: "trace_error_rate",
        alertRuleName: "Production errors",
      },
    });
  });
});
