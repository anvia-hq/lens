// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LARGE_PAYLOAD_PREVIEW_CHARACTERS } from "./large-payload-block";
import { PayloadSection } from "./payload-section";

afterEach(cleanup);

describe("large payload rendering", () => {
  it("uses a bounded plain-text preview instead of syntax token nodes", () => {
    render(
      <PayloadSection
        title="Input"
        value={{ text: "x".repeat(LARGE_PAYLOAD_PREVIEW_CHARACTERS + 1) }}
      />,
    );
    expect(screen.getByText(/Large payload/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy full Input JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download full Input JSON" })).toBeTruthy();
    expect(screen.getByText(/display truncated/).textContent?.length).toBeLessThanOrEqual(
      LARGE_PAYLOAD_PREVIEW_CHARACTERS + 30,
    );
  });
});

describe("evaluation payload rendering", () => {
  it("separates reasoning from answer text and offers structured and raw views", () => {
    render(
      <PayloadSection
        title="Output"
        value={{
          output: [
            {
              role: "assistant",
              content: [
                { type: "reasoning", text: "Check the evidence first." },
                { type: "output_text", text: "The answer is 42." },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Reasoning")).toBeTruthy();
    expect(screen.getByText("Check the evidence first.")).toBeTruthy();
    expect(screen.getByText("The answer is 42.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    expect(screen.getByRole("button", { name: "Structure" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByText(/"output_text"/)).toBeTruthy();
  });

  it("keeps top-level reasoning separate from text", () => {
    render(
      <PayloadSection
        title="Output"
        value={{ reasoning: "Compare the options.", text: "Choose option B." }}
      />,
    );

    expect(screen.getByText("Compare the options.")).toBeTruthy();
    expect(screen.getByText("Choose option B.")).toBeTruthy();
    expect(screen.getByText("Reasoning")).toBeTruthy();
  });
});
