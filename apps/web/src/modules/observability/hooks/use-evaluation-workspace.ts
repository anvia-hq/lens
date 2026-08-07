import type {
  EvaluationRunComparison,
  EvaluationRunDetail,
  EvaluationRunSummary,
  Page,
  QualityGate,
  QualityGateInput,
} from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { api, queryString } from "../../../lib/api";
import { notify } from "../../projects/utils";
import type { EvaluationsSearch, ResolvedEvaluationsSearch } from "../types";
import { timeRangeForPreset } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useEvaluationWorkspace() {
  const { project } = useObservabilityProject();
  const filters = useSearch({ strict: false }) as ResolvedEvaluationsSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<EvaluationsSearch>) => {
      void navigate({
        to: "/$projectId/evaluations",
        params: { projectId: project.id },
        search: { ...filters, ...changes },
        replace: true,
      });
    },
    [filters, navigate, project.id],
  );
  const runs = useQuery({
    queryKey: ["evaluation-runs", project.id, filters],
    queryFn: () =>
      api<Page<EvaluationRunSummary>>(
        `/api/v1/projects/${project.id}/evaluation-runs?${queryString({
          ...range,
          suite: filters.suite,
          status: filters.status,
          environment: filters.environment,
          release: filters.release,
          search: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
        })}`,
      ),
  });
  const selectorRuns = useQuery({
    queryKey: ["evaluation-run-selector", project.id],
    queryFn: () =>
      api<Page<EvaluationRunSummary>>(
        `/api/v1/projects/${project.id}/evaluation-runs?${queryString({ status: "completed", pageSize: 100 })}`,
      ),
    enabled: filters.view === "compare",
  });
  const runDetail = useQuery({
    queryKey: ["evaluation-run", project.id, filters.runId],
    queryFn: () =>
      api<EvaluationRunDetail>(
        `/api/v1/projects/${project.id}/evaluation-runs/${encodeURIComponent(filters.runId ?? "")}`,
      ),
    enabled: Boolean(filters.runId),
  });
  const gates = useQuery({
    queryKey: ["quality-gates", project.id],
    queryFn: () => api<{ items: QualityGate[] }>(`/api/v1/projects/${project.id}/quality-gates`),
  });
  const comparison = useQuery({
    queryKey: [
      "evaluation-run-comparison",
      project.id,
      filters.candidateRunId,
      filters.baselineRunId,
      filters.gateId,
    ],
    queryFn: () =>
      api<EvaluationRunComparison>(
        `/api/v1/projects/${project.id}/evaluation-runs/compare?${queryString({
          candidateRunId: filters.candidateRunId,
          baselineRunId: filters.baselineRunId,
          gateId: filters.gateId,
        })}`,
      ),
    enabled: Boolean(filters.candidateRunId && filters.baselineRunId),
  });
  const createGate = useMutation({
    mutationFn: (input: QualityGateInput) =>
      api<QualityGate>(`/api/v1/projects/${project.id}/quality-gates`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality-gates", project.id] });
      notify("Quality gate created");
    },
  });
  const updateGate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: QualityGateInput }) =>
      api<QualityGate>(`/api/v1/projects/${project.id}/quality-gates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality-gates", project.id] });
      queryClient.invalidateQueries({ queryKey: ["evaluation-run-comparison", project.id] });
      notify("Quality gate updated");
    },
  });
  const deleteGate = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/projects/${project.id}/quality-gates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality-gates", project.id] });
      notify("Quality gate deleted");
    },
  });
  return {
    comparison,
    createGate,
    deleteGate,
    filters,
    gates,
    project,
    runDetail,
    runs,
    selectorRuns,
    setFilters,
    updateGate,
  };
}

export type EvaluationWorkspaceState = ReturnType<typeof useEvaluationWorkspace>;
