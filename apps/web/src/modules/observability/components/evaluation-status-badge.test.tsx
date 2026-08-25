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
    expect(pass.className).toContain("bg-status-success-fill-foreground");
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
    expect(screen.getByText("Fail").className).toContain("bg-status-error-fill-foreground");

    rerender(<EvaluationStatusBadge status="invalid" />);
    expect(screen.getByText("Invalid").className).toContain("bg-status-warning-fill");

    rerender(<EvaluationStatusBadge status="insufficient_data" />);
    expect(screen.getByText("Insufficient data").className).toContain("bg-status-neutral-fill");

    rerender(<EvaluationStatusBadge status="unknown" />);
    expect(screen.getByText("Unknown").className).toContain("bg-status-neutral-fill");
  });
});
