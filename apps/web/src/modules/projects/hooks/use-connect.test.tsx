// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConnect } from "./use-connect";

vi.mock("../utils", () => ({ notify: vi.fn() }));
vi.mock("./use-project", () => ({
  useProject: () => ({ project: { id: "project-alpha", name: "Alpha" } }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useConnect", () => {
  it("provides the current Lens client and Agent instrumentation APIs", () => {
    const { result } = renderHook(() => useConnect());
    const snippet = result.current.snippets.anvia;

    expect(snippet).toContain('import { Agent } from "@anvia/core/agent";');
    expect(snippet).toContain('import { LensClient } from "@anvia/lens";');
    expect(snippet).toContain('import { OpenAIClient } from "@anvia/openai";');
    expect(snippet).toContain("new LensClient()");
    expect(snippet).toContain("new Agent({");
    expect(snippet).toContain("model: openai.completionModel(");
    expect(snippet).toMatch(
      /observability:\s*\{\s*observers: \{ lens: tracing\.observer\(\) \},\s*primaryTrace: "lens"/,
    );
    expect(snippet).toContain("tracing.evalReporter()");
    expect(snippet).not.toMatch(/lens\.create|createLensEvalReporter|\.observe\(/);
  });

  it("generates a trace and closes telemetry even when generation fails", () => {
    const { result } = renderHook(() => useConnect());
    const snippet = result.current.snippets.anvia;

    expect(snippet).toMatch(/try \{\s*const result = await agent\.generate\(/);
    expect(snippet).toContain('if (result.type !== "response")');
    expect(snippet).toMatch(/finally \{\s*await tracing\.close\(\);\s*\}/);
  });

  it("copies the Anvia snippet and resets the copied state", async () => {
    vi.useFakeTimers();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { result } = renderHook(() => useConnect());
    const snippet = result.current.snippets.anvia;

    await act(() => result.current.copy("anvia", snippet));

    expect(writeText).toHaveBeenCalledWith(snippet);
    expect(result.current.copied).toBe("anvia");
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copied).toBeNull();
  });
});
