// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
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
        view="json"
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
