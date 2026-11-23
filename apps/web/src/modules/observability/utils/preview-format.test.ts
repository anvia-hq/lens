import { describe, expect, it } from "vitest";
import { extractStructuredPreviewFields, formatStepOneLine } from "./preview-format";

describe("preview-format", () => {
  it("cleans up truncated reasoning and tool-call JSON previews", () => {
    expect(formatStepOneLine('[{"type":"reasoning","text":"","id":"rs_06df2b197da6e...')).toBe(
      "Reasoning",
    );
    expect(
      formatStepOneLine(
        '{"type":"tool-call","toolCallId":"fc_1","toolName":"tavily_search","input":{"query":"Iran US war IHSG',
      ),
    ).toBe('tavily_search("Iran US war IHSG")');
  });

  it("extracts structured key-value fields from complete and truncated JSON objects", () => {
    expect(
      extractStructuredPreviewFields(
        '{"consensus":"strong_agree","trigger":"NONE","headline":"Prolonged conflict pressures IHSG","rationale":"All six speakers agree',
        3,
      ),
    ).toEqual([
      { key: "consensus", value: "strong_agree" },
      { key: "trigger", value: "NONE" },
      { key: "headline", value: "Prolonged conflict pressures IHSG" },
    ]);

    expect(extractStructuredPreviewFields("Plain markdown text")).toBeNull();
  });
});
