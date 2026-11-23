// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FacetFilterPanel, type FacetSection } from "./facet-filter-panel";

afterEach(cleanup);

function panel(section: Partial<FacetSection>, resetKey = "30d") {
  return (
    <FacetFilterPanel
      storageKey="test"
      resetKey={resetKey}
      defaultOpen={["tags"]}
      loading={false}
      error={null}
      activeCount={0}
      onClear={() => {}}
      onCollapse={() => {}}
      sections={[
        {
          id: "tags",
          label: "Tags",
          selected: [],
          options: [],
          onToggle: () => {},
          ...section,
        },
      ]}
    />
  );
}

const rows = () =>
  Array.from(document.querySelectorAll("label span[title]")).map((node) =>
    node.getAttribute("title"),
  );

describe("FacetFilterPanel row order", () => {
  it("keeps every row in place when the server re-sorts and narrows after a tick", () => {
    const initial = [
      { value: "production", count: 51 },
      { value: "standard", count: 51 },
      { value: "dashboard", count: 16 },
    ];
    const { rerender } = render(panel({ options: initial }));
    expect(rows()).toEqual(["production", "standard", "dashboard"]);

    // After ticking "standard" the server sorts it first and drops "dashboard"; no row may move or vanish.
    rerender(
      panel({
        selected: ["standard"],
        options: [
          { value: "standard", count: 51 },
          { value: "production", count: 51 },
        ],
      }),
    );
    expect(rows()).toEqual(["production", "standard", "dashboard"]);
  });

  it("keeps a selected value listed even when the server omits it", () => {
    const { rerender } = render(panel({ options: [{ value: "a", count: 3 }] }));
    rerender(panel({ selected: ["a"], options: [] }));
    expect(rows()).toEqual(["a"]);
  });

  it("forgets the order when the reset key changes", () => {
    const { rerender } = render(
      panel({
        options: [
          { value: "a", count: 3 },
          { value: "b", count: 2 },
        ],
      }),
    );
    rerender(
      panel(
        {
          options: [
            { value: "b", count: 9 },
            { value: "a", count: 1 },
          ],
        },
        "7d",
      ),
    );
    expect(rows()).toEqual(["b", "a"]);
  });
});
