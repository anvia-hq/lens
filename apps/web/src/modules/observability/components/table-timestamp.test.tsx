// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatTableTimestamp, TableTimestamp } from "./table-timestamp";

afterEach(cleanup);

describe("TableTimestamp", () => {
  it("uses the compact, non-wrapping observability table treatment", () => {
    const value = "2026-08-07T10:24:00.000Z";
    render(<TableTimestamp value={value} />);

    const timestamp = screen.getByTitle(value);
    expect(timestamp.classList.contains("whitespace-nowrap")).toBe(true);
    expect(timestamp.classList.contains("text-xs")).toBe(true);
    expect(timestamp.textContent).toBe(formatTableTimestamp(value));
  });

  it("keeps an invalid timestamp visible", () => {
    expect(formatTableTimestamp("unknown")).toBe("unknown");
  });
});
