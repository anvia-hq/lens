// @vitest-environment happy-dom

import type {
  EvaluationResult,
  EvaluationRunCaseDetail,
  EvaluationRunDetail,
} from "@lens/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvaluationRunDetailState } from "../hooks/use-evaluation-runs";
import { EvaluationRunDetailView, formatMetricExplanation } from "./evaluation-run-detail-view";

vi.mock("@lens/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

afterEach(cleanup);

const projectId = "11111111-1111-4111-8111-111111111111";
const trace1 = "11111111111111111111111111111111";
const trace2 = "22222222222222222222222222222222";
const trace3 = "33333333333333333333333333333333";

function resultFixture(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    projectId,
    id: "result-1",
    runId: "run-1",
    timestamp: "2026-08-07T00:00:00.000Z",
    traceId: trace1,
    observationId: "1234567890abcdef",
    responseId: null,
    suiteName: "support-suite",
    caseId: "refund-case",
    trial: null,
    trialCount: null,
    cached: null,
    metricName: "contains",
    metricProvider: null,
    metricModel: null,
    outcome: "pass",
    dataType: "BOOLEAN",
    numericValue: 1,
    categoricalValue: null,
    explanation: null,
    payload: { input: "Refund window?", expected: "30 days", output: "30 days" },
    payloadStatus: "captured",
    configId: null,
    serviceName: "support",
    environment: "staging",
    release: "1.0.0",
    metadata: {},
    source: "telemetry",
    reviewer: null,
    expiresAt: null,
    ingestedAt: "2026-08-07T00:00:00.000Z",
    ingestVersion: "1",
    ...overrides,
  };
}

function makeDetail(cases: EvaluationRunCaseDetail[]): EvaluationRunDetail {
  const results = cases.flatMap((item) => item.results);
  return {
    run: {
      projectId,
      id: "run-1",
      status: "completed",
      suiteName: "support-suite",
      startedAt: "2026-08-07T00:00:00.000Z",
      completedAt: "2026-08-07T00:01:00.000Z",
      durationMs: 60_000,
      caseCount: cases.length,
      metricNames: ["contains", "faithfulness"],
      passed: results.filter((item) => item.outcome === "pass").length,
      failed: results.filter((item) => item.outcome === "fail").length,
      invalid: 0,
      serviceName: "support",
      environment: "staging",
      release: "1.0.0",
      datasetName: null,
      datasetVersion: null,
      promptName: null,
      promptVersion: null,
      metadata: {},
      expiresAt: null,
      ingestedAt: "2026-08-07T00:01:00.000Z",
      ingestVersion: "1",
      stateVersion: "2",
      results: results.length,
      actualPassed: results.filter((item) => item.outcome === "pass").length,
      actualFailed: results.filter((item) => item.outcome === "fail").length,
      actualInvalid: 0,
      actualUnknown: 0,
      passRate: 0.75,
      evaluatedCases: cases.length,
      evaluatedTraces: 3,
      p95LatencyMs: 120,
      averageTotalTokens: 320,
      traceCoverage: 1,
    },
    metrics: [],
    results,
    cases,
  };
}

function renderRunDetail(detail: EvaluationRunDetail) {
  const state: EvaluationRunDetailState = {
    resultPage: 1,
    setResultPage: vi.fn(),
    deleteRun: vi.fn(),
    deletionPending: false,
    detail: {
      isLoading: false,
      error: null,
      data: detail,
    } as unknown as EvaluationRunDetailState["detail"],
    project: {
      id: projectId,
      role: "owner",
    } as unknown as EvaluationRunDetailState["project"],
    search: { page: 1, case: undefined },
    selectCase: vi.fn(),
  };

  const root = createRootRoute({ component: Outlet });
  const runRoute = createRoute({
    getParentRoute: () => root,
    path: "/$projectId/evaluations/runs/$runId",
    component: () => <EvaluationRunDetailView state={state} />,
  });
  const runsRoute = createRoute({
    getParentRoute: () => root,
    path: "/$projectId/evaluations/runs",
    component: () => null,
  });
  const compareRoute = createRoute({
    getParentRoute: () => root,
    path: "/$projectId/evaluations/compare",
    component: () => null,
  });
  const traceRoute = createRoute({
    getParentRoute: () => root,
    path: "/$projectId/traces/$traceId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([runRoute, runsRoute, compareRoute, traceRoute]),
    history: createMemoryHistory({
      initialEntries: [`/${projectId}/evaluations/runs/run-1`],
    }),
  });

  return render(<RouterProvider router={router} />);
}

describe("EvaluationRunDetailView multi-trial rendering", () => {
  it("groups metrics by trial, switches per-trial trace/payload, and fixes deterministic explanation copy", async () => {
    const trial1Deterministic = resultFixture({
      id: "t1-contains",
      trial: 1,
      trialCount: 3,
      cached: true,
      traceId: trace1,
      metricName: "contains",
      metricProvider: null,
      metricModel: null,
      outcome: "pass",
      explanation: null,
      payload: { input: "Refund window?", expected: "30 days", output: "Trial one response" },
    });
    const trial1Judge = resultFixture({
      id: "t1-judge",
      trial: 1,
      trialCount: 3,
      cached: true,
      traceId: trace1,
      metricName: "faithfulness",
      metricProvider: "openai",
      metricModel: "gpt-4.1",
      outcome: "pass",
      explanation: null,
      payload: { input: "Refund window?", expected: "30 days", output: "Trial one response" },
    });
    const trial2Deterministic = resultFixture({
      id: "t2-contains",
      trial: 2,
      trialCount: 3,
      cached: false,
      traceId: trace2,
      metricName: "contains",
      outcome: "fail",
      explanation: null,
      payload: { input: "Refund window?", expected: "30 days", output: "Trial two response" },
    });
    const trial3Deterministic = resultFixture({
      id: "t3-contains",
      trial: 3,
      trialCount: 3,
      cached: false,
      traceId: trace3,
      metricName: "contains",
      outcome: "pass",
      explanation: null,
      payload: { input: "Refund window?", expected: "30 days", output: "Trial three response" },
    });

    const multiTrialCase: EvaluationRunCaseDetail = {
      caseId: "refund-case",
      outcome: "fail",
      traceId: trace1,
      traceIds: [trace1, trace2, trace3],
      payload: trial1Deterministic.payload,
      payloadStatus: "captured",
      payloadConsistent: true,
      trialCount: 3,
      passedTrials: 2,
      cached: true,
      trials: [
        {
          trial: 1,
          outcome: "pass",
          traceId: trace1,
          cached: true,
          payload: trial1Deterministic.payload,
          payloadStatus: "captured",
          payloadConsistent: true,
          results: [trial1Deterministic, trial1Judge],
        },
        {
          trial: 2,
          outcome: "fail",
          traceId: trace2,
          cached: false,
          payload: trial2Deterministic.payload,
          payloadStatus: "captured",
          payloadConsistent: true,
          results: [trial2Deterministic],
        },
        {
          trial: 3,
          outcome: "pass",
          traceId: trace3,
          cached: false,
          payload: trial3Deterministic.payload,
          payloadStatus: "captured",
          payloadConsistent: true,
          results: [trial3Deterministic],
        },
      ],
      results: [trial1Deterministic, trial1Judge, trial2Deterministic, trial3Deterministic],
    };

    renderRunDetail(makeDetail([multiTrialCase]));

    await waitFor(() => expect(screen.getByText("2/3 trials passed")).toBeTruthy());
    expect(screen.getByText("pass@3")).toBeTruthy();
    expect(screen.getByText("1/3 cached")).toBeTruthy();
    expect(screen.getByText("Cached")).toBeTruthy();
    expect(screen.getByText("3 traces")).toBeTruthy();

    // No false inconsistent payload warning across trials.
    expect(screen.queryByText("Metrics in this case reported inconsistent payloads.")).toBeNull();

    // Trial 1 renders its own trace, payload, and explanation copy.
    const trial1TraceLink = screen.getByRole("link", { name: "Open trace 111111…1111" });
    expect(trial1TraceLink.getAttribute("href")).toContain(trace1);
    expect(screen.getByText("Trial one response")).toBeTruthy();
    expect(screen.getByText("No explanation provided.")).toBeTruthy();
    expect(screen.getByText("No judge explanation was provided.")).toBeTruthy();
    expect(screen.getByText("openai/gpt-4.1")).toBeTruthy();

    // Switch to Trial 2 and verify its distinct trace and payload are shown.
    fireEvent.click(screen.getByRole("tab", { name: /Trial 2 \/ 3/ }));
    await waitFor(() => expect(screen.getByText("Trial two response")).toBeTruthy());
    const trial2TraceLink = screen.getByRole("link", { name: "Open trace 222222…2222" });
    expect(trial2TraceLink.getAttribute("href")).toContain(trace2);
    expect(screen.queryByText("Trial one response")).toBeNull();
  });

  it("shows inconsistent payload warning only on the trial whose metrics disagree", async () => {
    const t1 = resultFixture({
      id: "t1-m1",
      trial: 1,
      trialCount: 2,
      traceId: trace1,
      payload: { input: "q", output: "consistent-1" },
    });
    const t2a = resultFixture({
      id: "t2-m1",
      trial: 2,
      trialCount: 2,
      traceId: trace2,
      metricName: "contains",
      payload: { input: "q", output: "output-a" },
    });
    const t2b = resultFixture({
      id: "t2-m2",
      trial: 2,
      trialCount: 2,
      traceId: trace2,
      metricName: "faithfulness",
      metricModel: "gpt-4.1",
      payload: { input: "q", output: "output-b" },
    });

    const multiTrialCase: EvaluationRunCaseDetail = {
      caseId: "inconsistent-case",
      outcome: "pass",
      traceId: trace1,
      traceIds: [trace1, trace2],
      payload: t1.payload,
      payloadStatus: "captured",
      payloadConsistent: false,
      trialCount: 2,
      passedTrials: 2,
      cached: false,
      trials: [
        {
          trial: 1,
          outcome: "pass",
          traceId: trace1,
          cached: false,
          payload: t1.payload,
          payloadStatus: "captured",
          payloadConsistent: true,
          results: [t1],
        },
        {
          trial: 2,
          outcome: "pass",
          traceId: trace2,
          cached: false,
          payload: t2a.payload,
          payloadStatus: "captured",
          payloadConsistent: false,
          results: [t2a, t2b],
        },
      ],
      results: [t1, t2a, t2b],
    };

    renderRunDetail(makeDetail([multiTrialCase]));

    await waitFor(() => expect(screen.getByText("consistent-1")).toBeTruthy());
    expect(screen.queryByText("Metrics in this case reported inconsistent payloads.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Trial 2 \/ 2/ }));
    await waitFor(() =>
      expect(screen.getByText("Metrics in this case reported inconsistent payloads.")).toBeTruthy(),
    );
  });

  it("formats missing explanations differently for deterministic vs LLM-judge metrics", () => {
    expect(formatMetricExplanation({ explanation: null, metricModel: null })).toBe(
      "No explanation provided.",
    );
    expect(formatMetricExplanation({ explanation: "", metricModel: null })).toBe(
      "No explanation provided.",
    );
    expect(formatMetricExplanation({ explanation: null, metricModel: "gpt-4.1" })).toBe(
      "No judge explanation was provided.",
    );
    expect(formatMetricExplanation({ explanation: "Exact match", metricModel: null })).toBe(
      "Exact match",
    );
  });

  it("renders case-level untrialed results, partial trial pages without trialCount, and omits pass@N when 0 trials pass", async () => {
    const trial3 = resultFixture({
      id: "t3-only",
      trial: 3,
      trialCount: null,
      traceId: trace3,
      metricName: "contains",
      outcome: "fail",
      payload: { input: "q", output: "trial-3-failed" },
    });
    const caseLevel = resultFixture({
      id: "case-level-review",
      trial: null,
      trialCount: null,
      traceId: null,
      metricName: "human-review",
      outcome: "fail",
      explanation: "Needs clearer wording",
      payload: { input: "q", output: "case-level-output" },
    });

    const partialMixedCase: EvaluationRunCaseDetail = {
      caseId: "partial-mixed",
      outcome: "fail",
      traceId: trace3,
      traceIds: [trace3],
      payload: trial3.payload,
      payloadStatus: "captured",
      payloadConsistent: true,
      trialCount: null,
      passedTrials: 0,
      cached: false,
      trials: [
        {
          trial: 3,
          outcome: "fail",
          traceId: trace3,
          cached: false,
          payload: trial3.payload,
          payloadStatus: "captured",
          payloadConsistent: true,
          results: [trial3],
        },
      ],
      results: [trial3, caseLevel],
    };

    renderRunDetail(makeDetail([partialMixedCase]));

    await waitFor(() => expect(screen.getByText("0/3 trials passed")).toBeTruthy());
    expect(screen.queryByText("pass@3")).toBeNull();
    expect(screen.getByRole("tab", { name: /Trial 3 \/ 3/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Case-level/ }));
    await waitFor(() => expect(screen.getByText("Needs clearer wording")).toBeTruthy());
    expect(screen.getByText("case-level-output")).toBeTruthy();
  });
});
