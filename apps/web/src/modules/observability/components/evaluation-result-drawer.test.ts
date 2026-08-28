import type { EvaluationResult } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { formatEvaluationResultValue } from "./evaluation-result-drawer";
import { formatEvaluationSource } from "./evaluation-source";

describe("evaluation result presentation", () => {
  it("formats numeric, categorical, and boolean values for the table and drawer", () => {
    expect(formatEvaluationResultValue(result({ numericValue: 0.81234 }))).toBe("0.812");
    expect(formatEvaluationResultValue(result({ categoricalValue: "relevant" }))).toBe("relevant");
    expect(formatEvaluationResultValue(result({ dataType: "BOOLEAN", outcome: "pass" }))).toBe(
      "pass",
    );
    expect(formatEvaluationResultValue(result({}))).toBe("—");
  });

  it("distinguishes automated, internal, and end-user evaluation sources", () => {
    expect(formatEvaluationSource("telemetry", true)).toBe("Telemetry");
    expect(formatEvaluationSource("human", true)).toBe("Human review");
    expect(formatEvaluationSource("end_user", true)).toBe("End-user feedback");
  });
});

function result(overrides: Partial<EvaluationResult>): EvaluationResult {
  return {
    numericValue: null,
    categoricalValue: null,
    dataType: null,
    outcome: "unknown",
    ...overrides,
  } as EvaluationResult;
}
