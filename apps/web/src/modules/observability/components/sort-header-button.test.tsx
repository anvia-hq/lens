// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SortHeaderButton } from "./sort-header-button";

describe("SortHeaderButton", () => {
  afterEach(cleanup);

  it("announces the active direction and sorts on click", () => {
    const onClick = vi.fn();
    render(<SortHeaderButton label="Started" active order="asc" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Started, currently asc" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("omits the direction for an inactive column", () => {
    render(<SortHeaderButton label="Cost" active={false} order="desc" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Sort by Cost" })).toBeTruthy();
  });
});
