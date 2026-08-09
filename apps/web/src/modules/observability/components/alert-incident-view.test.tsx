// @vitest-environment happy-dom

import type { AlertIncidentDetail } from "@lens/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContributorAnalysis } from "./alert-incident-view";

afterEach(cleanup);

describe("incident contributor analysis", () => {
  it("renders a conservative contributor and its baseline comparison", () => {
    render(
      <ContributorAnalysis
        projectId="project-1"
        detail={
          {
            contributorAnalysis: {
              baselineFrom: "2026-08-09T09:30:00.000Z",
              baselineTo: "2026-08-09T09:45:00.000Z",
              breachFrom: "2026-08-09T09:45:00.000Z",
              breachTo: "2026-08-09T10:00:00.000Z",
              unavailableReason: null,
              hints: [
                {
                  dimension: "release",
                  value: "v2",
                  metric: "errorRate",
                  baseline: { sampleCount: 100, value: 0.05 },
                  breach: { sampleCount: 100, value: 0.2 },
                  delta: 0.15,
                  percentChange: null,
                  isNew: true,
                  baselineTraceId: null,
                  breachTraceId: null,
                },
              ],
            },
          } as AlertIncidentDetail
        }
      />,
    );

    expect(screen.getByText("Likely contributors")).toBeTruthy();
    expect(screen.getByText("Release")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.getByText("New in breach")).toBeTruthy();
    expect(screen.getByText("+15.0 pp")).toBeTruthy();
  });

  it("explains when no candidate passes the evidence thresholds", () => {
    render(
      <ContributorAnalysis
        projectId="project-1"
        detail={
          {
            contributorAnalysis: {
              baselineFrom: "2026-08-09T09:30:00.000Z",
              baselineTo: "2026-08-09T09:45:00.000Z",
              breachFrom: "2026-08-09T09:45:00.000Z",
              breachTo: "2026-08-09T10:00:00.000Z",
              unavailableReason: "insufficient_data",
              hints: [],
            },
          } as AlertIncidentDetail
        }
      />,
    );

    expect(screen.getByText("No strong contributor found")).toBeTruthy();
  });
});
