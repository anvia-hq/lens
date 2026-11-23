// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBoolean, isStringArray, useStoredState } from "./use-stored-state";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("useStoredState", () => {
  it("starts from the default, then persists updates across remounts", () => {
    const first = renderHook(() => useStoredState("panel", false, isBoolean));
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    first.unmount();

    const second = renderHook(() => useStoredState("panel", false, isBoolean));
    expect(second.result.current[0]).toBe(true);
  });

  it("reads the stored value on the very first render", () => {
    window.localStorage.setItem("lens:ui:sections", JSON.stringify(["model"]));
    const seen: string[][] = [];
    renderHook(() => {
      const [value] = useStoredState("sections", ["status"], isStringArray);
      seen.push(value);
    });
    expect(seen[0]).toEqual(["model"]);
  });

  it("falls back when the stored value is corrupt or the wrong shape", () => {
    window.localStorage.setItem("lens:ui:panel", "{nope");
    expect(renderHook(() => useStoredState("panel", false, isBoolean)).result.current[0]).toBe(
      false,
    );
    window.localStorage.setItem("lens:ui:sections", JSON.stringify([1, 2]));
    expect(
      renderHook(() => useStoredState("sections", ["status"], isStringArray)).result.current[0],
    ).toEqual(["status"]);
  });
});
