// @vitest-environment happy-dom

import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it } from "vitest";
import {
  pickSavedFilters,
  readSavedFilters,
  restoreSavedFilters,
  writeSavedFilters,
} from "./saved-filters";

const beforeLoad = restoreSavedFilters("traces", "/$projectId/traces");
const params = { projectId: "p1" };

describe("saved filters", () => {
  beforeEach(() => window.localStorage.clear());

  it("drops pagination, drill-down ids and undefined values", () => {
    expect(
      pickSavedFilters({ range: "7d", page: 3, traceId: "t", search: undefined, models: ["a"] }),
    ).toEqual({ range: "7d", models: ["a"] });
  });

  it("keeps filters separate per project and page", () => {
    writeSavedFilters("p1", "traces", { range: "7d" });
    expect(readSavedFilters("p1", "traces")).toEqual({ range: "7d" });
    expect(readSavedFilters("p2", "traces")).toBeUndefined();
    expect(readSavedFilters("p1", "runs")).toBeUndefined();
  });

  it("ignores corrupt storage", () => {
    window.localStorage.setItem("lens:filters:v1:p1:traces", "{nope");
    expect(readSavedFilters("p1", "traces")).toBeUndefined();
  });

  it("redirects a bare visit to the saved filters", () => {
    writeSavedFilters("p1", "traces", { range: "30d", models: ["gpt-4.1"] });
    let thrown: unknown;
    try {
      beforeLoad({ params, search: { range: "24h" }, location: { searchStr: "" }, cause: "enter" });
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { search: unknown } }).options.search).toEqual({
      range: "30d",
      models: ["gpt-4.1"],
    });
  });

  it("respects an explicit search and saves it", () => {
    writeSavedFilters("p1", "traces", { range: "30d" });
    beforeLoad({
      params,
      search: { range: "7d", page: 2 },
      location: { searchStr: "?range=7d&page=2" },
      cause: "enter",
    });
    expect(readSavedFilters("p1", "traces")).toEqual({ range: "7d" });
  });

  it("saves in-page changes, including a cleared bare search", () => {
    writeSavedFilters("p1", "traces", { range: "30d" });
    beforeLoad({ params, search: { range: "24h" }, location: { searchStr: "" }, cause: "stay" });
    expect(readSavedFilters("p1", "traces")).toEqual({ range: "24h" });
  });

  it("never reads or writes on preload", () => {
    writeSavedFilters("p1", "traces", { range: "30d" });
    beforeLoad({
      params,
      search: { range: "7d" },
      location: { searchStr: "?x" },
      cause: "preload",
    });
    beforeLoad({ params, search: { range: "7d" }, location: { searchStr: "" }, cause: "preload" });
    expect(readSavedFilters("p1", "traces")).toEqual({ range: "30d" });
  });
});
