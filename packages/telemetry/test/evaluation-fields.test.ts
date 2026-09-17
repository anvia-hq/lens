import { describe, expect, it } from "vitest";
import { evaluationSource } from "../src/evaluation-fields.js";

describe("evaluation fields", () => {
  it("reserves human provenance for authenticated reviews", () => {
    expect(evaluationSource(null)).toBe("telemetry");
    expect(evaluationSource("external")).toBe("telemetry");
    expect(evaluationSource("human")).toBe("telemetry");
    expect(evaluationSource("end_user")).toBe("end_user");
  });
});
