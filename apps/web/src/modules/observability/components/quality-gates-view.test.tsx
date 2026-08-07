// @vitest-environment happy-dom

import type { QualityGate } from "@lens/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QualityGatesState } from "../hooks/use-evaluation-workspace";
import { QualityGatesView } from "./quality-gates-view";

afterEach(cleanup);

describe("QualityGatesView", () => {
  it("keeps rule controls stable and displays pass rates as percentages", () => {
    const update = vi.fn();
    render(<QualityGatesView state={qualityGatesState({ update })} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const metric = screen.getByLabelText("Metric") as HTMLInputElement;
    const target = screen.getByLabelText("Target (%)") as HTMLInputElement;
    expect(target.value).toBe("90");

    metric.focus();
    fireEvent.change(metric, { target: { value: "helpfulness" } });
    expect(screen.getByLabelText("Metric")).toBe(metric);
    expect(document.activeElement).toBe(metric);

    fireEvent.change(target, { target: { value: "95" } });
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.submit(document.querySelector("#quality-gate-form") as HTMLFormElement);

    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: "gate-1",
      input: {
        rules: [{ metricName: "helpfulness", value: 0.95 }],
      },
    });
  });

  it("requires confirmation before deleting a gate", () => {
    const remove = vi.fn();
    render(<QualityGatesView state={qualityGatesState({ remove })} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Production release" }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete gate" }));
    expect(remove).toHaveBeenCalledWith("gate-1", expect.any(Object));
  });
});

function qualityGatesState(options: {
  update?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}) {
  return {
    project: { role: "owner" },
    gates: { data: { items: [gate] }, error: null, isLoading: false },
    createGate: { isPending: false, mutate: vi.fn() },
    updateGate: { isPending: false, mutate: options.update ?? vi.fn() },
    deleteGate: { isPending: false, mutate: options.remove ?? vi.fn() },
  } as unknown as QualityGatesState;
}

const gate: QualityGate = {
  id: "gate-1",
  projectId: "project-1",
  name: "Production release",
  suiteName: "support-agent",
  environment: "production",
  minimumCaseCount: 25,
  rules: [
    {
      type: "evaluation_threshold",
      metricName: "correctness",
      measure: "pass_rate",
      operator: "gte",
      value: 0.9,
    },
  ],
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
};
