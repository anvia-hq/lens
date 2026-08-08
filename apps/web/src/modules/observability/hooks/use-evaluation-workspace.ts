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
import { useCallback } from "react";
import { api, queryString } from "../../../lib/api";
import { notify } from "../../projects/utils";
import type { EvaluationCompareSearch } from "../types";
import { useObservabilityProject } from "./use-observability-project";

function useQualityGateQuery(projectId: string) {
  return useQuery({
    queryKey: ["quality-gates", projectId],
    queryFn: () => api<{ items: QualityGate[] }>(`/api/v1/projects/${projectId}/quality-gates`),
  });
}

export function useEvaluationCompare() {
  const { project } = useObservabilityProject();
  const filters = useSearch({ strict: false }) as EvaluationCompareSearch;
  const navigate = useNavigate();
  const setFilters = useCallback(
    (changes: Partial<EvaluationCompareSearch>) => {
      void navigate({
        to: "/$projectId/evaluations/compare",
        params: { projectId: project.id },
        search: { ...filters, ...changes },
        replace: true,
      });
    },
    [filters, navigate, project.id],
  );
  const runs = useQuery({
    queryKey: ["evaluation-run-selector", project.id],
    queryFn: () =>
      api<Page<EvaluationRunSummary>>(
        `/api/v1/projects/${project.id}/evaluation-runs?${queryString({
          status: "completed",
          pageSize: 100,
        })}`,
      ),
  });
  const candidateInSelector = runs.data?.items.some((run) => run.id === filters.candidateRunId);
  const candidateDetail = useQuery({
    queryKey: ["evaluation-run", project.id, filters.candidateRunId],
    queryFn: () =>
      api<EvaluationRunDetail>(
        `/api/v1/projects/${project.id}/evaluation-runs/${encodeURIComponent(filters.candidateRunId ?? "")}`,
      ),
    enabled: Boolean(filters.candidateRunId && runs.isSuccess && !candidateInSelector),
  });
  const gates = useQualityGateQuery(project.id);
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
        `/api/v1/projects/${project.id}/evaluation-runs/compare?${queryString(filters)}`,
      ),
    enabled: Boolean(filters.candidateRunId && filters.baselineRunId),
  });
  return { candidateDetail, comparison, filters, gates, project, runs, setFilters };
}

export function useQualityGates() {
  const { project } = useObservabilityProject();
  const queryClient = useQueryClient();
  const gates = useQualityGateQuery(project.id);
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
  return { createGate, deleteGate, gates, project, updateGate };
}

export type EvaluationCompareState = ReturnType<typeof useEvaluationCompare>;
export type QualityGatesState = ReturnType<typeof useQualityGates>;
