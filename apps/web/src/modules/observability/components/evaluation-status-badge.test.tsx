// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EvaluationRunStatusBadge } from "./evaluation-run-status-badge";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { StatusBadge } from "./status-badge";

afterEach(cleanup);

describe("EvaluationStatusBadge", () => {
  it("matches the filled trace success treatment for passing results", () => {
    render(
      <>
        <StatusBadge status="ok" />
        <EvaluationStatusBadge status="pass" />
      </>,
    );

    const success = screen.getByText("Success");
    const pass = screen.getByText("Pass");
    expect(pass.className).toBe(success.className);
    expect(pass.className).toContain("border-0");
    expect(pass.className).toContain("bg-emerald-200");
  });

  it("matches the filled trace success treatment for completed runs", () => {
    render(
      <>
        <StatusBadge status="ok" />
        <EvaluationRunStatusBadge status="completed" />
      </>,
    );

    expect(screen.getByText("Completed").className).toBe(screen.getByText("Success").className);
  });

  it("uses the same semantic family for fail and incomplete outcomes", () => {
    const { rerender } = render(<EvaluationStatusBadge status="fail" />);
    expect(screen.getByText("Fail").className).toContain("bg-rose-200");

    rerender(<EvaluationStatusBadge status="invalid" />);
    expect(screen.getByText("Invalid").className).toContain("bg-amber-200");

    rerender(<EvaluationStatusBadge status="insufficient_data" />);
    expect(screen.getByText("Insufficient data").className).toContain("bg-slate-200");

    rerender(<EvaluationStatusBadge status="unknown" />);
    expect(screen.getByText("Unknown").className).toContain("bg-slate-200");
  });
});
