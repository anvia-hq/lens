import type { AlertIncident, AlertRule, AlertRuleInput, Page, QualityGate } from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { api, queryString } from "../../../lib/api";
import { notify } from "../../projects/utils";
import type { AlertsSearch } from "../types";
import { useObservabilityProject } from "./use-observability-project";

export function useActiveAlertCount(projectId: string) {
  return useQuery({
    queryKey: ["alert-active-count", projectId],
    queryFn: () => api<{ count: number }>(`/api/v1/projects/${projectId}/alerts/active-count`),
    refetchInterval: 30_000,
  });
}

export function useAlerts() {
  const { project } = useObservabilityProject();
  const filters = useSearch({ strict: false }) as AlertsSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setFilters = useCallback(
    (changes: Partial<AlertsSearch>) => {
      void navigate({
        to: "/$projectId/alerts",
        params: { projectId: project.id },
        search: { ...filters, ...changes },
        replace: true,
      });
    },
    [filters, navigate, project.id],
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["alert-rules", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["alerts", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["alert-active-count", project.id] });
  };
  const rules = useQuery({
    queryKey: ["alert-rules", project.id],
    queryFn: () => api<{ items: AlertRule[] }>(`/api/v1/projects/${project.id}/alert-rules`),
  });
  const incidents = useQuery({
    queryKey: ["alerts", project.id, filters.status, filters.kind, filters.page],
    queryFn: () =>
      api<Page<AlertIncident>>(
        `/api/v1/projects/${project.id}/alerts?${queryString({
          status: filters.status,
          kind: filters.kind,
          page: filters.page,
          pageSize: 50,
        })}`,
      ),
  });
  const gates = useQuery({
    queryKey: ["quality-gates", project.id],
    queryFn: () => api<{ items: QualityGate[] }>(`/api/v1/projects/${project.id}/quality-gates`),
  });
  const createRule = useMutation({
    mutationFn: (input: AlertRuleInput) =>
      api<AlertRule>(`/api/v1/projects/${project.id}/alert-rules`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      refresh();
      notify("Alert rule created");
    },
  });
  const updateRule = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AlertRuleInput }) =>
      api<AlertRule>(`/api/v1/projects/${project.id}/alert-rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      refresh();
      notify("Alert rule updated");
    },
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/projects/${project.id}/alert-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      notify("Alert rule deleted");
    },
  });
  const acknowledge = useMutation({
    mutationFn: (id: string) =>
      api<AlertIncident>(`/api/v1/projects/${project.id}/alerts/${id}/acknowledge`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<AlertIncident>(`/api/v1/projects/${project.id}/alerts/${id}/resolve`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });

  return {
    acknowledge,
    createRule,
    deleteRule,
    filters,
    gates,
    incidents,
    project,
    resolve,
    rules,
    setFilters,
    updateRule,
  };
}

export type AlertsState = ReturnType<typeof useAlerts>;
