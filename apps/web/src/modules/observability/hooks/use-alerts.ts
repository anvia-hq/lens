import type {
  AlertChannel,
  AlertChannelInput,
  AlertIncident,
  AlertIncidentDetail,
  AlertRule,
  AlertRuleInput,
  Page,
  QualityGate,
} from "@lens/contracts";
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
  const refreshChannels = () => {
    void queryClient.invalidateQueries({ queryKey: ["alert-channels", project.id] });
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
  const channels = useQuery({
    queryKey: ["alert-channels", project.id],
    queryFn: () => api<{ items: AlertChannel[] }>(`/api/v1/projects/${project.id}/alert-channels`),
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
  const createChannel = useMutation({
    mutationFn: (input: AlertChannelInput) =>
      api<AlertChannel>(`/api/v1/projects/${project.id}/alert-channels`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      refreshChannels();
      notify("Alert channel created");
    },
  });
  const updateChannel = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AlertChannelInput }) =>
      api<AlertChannel>(`/api/v1/projects/${project.id}/alert-channels/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      refreshChannels();
      notify("Alert channel updated");
    },
  });
  const deleteChannel = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/projects/${project.id}/alert-channels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshChannels();
      notify("Alert channel deleted");
    },
  });
  const testChannel = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/api/v1/projects/${project.id}/alert-channels/${id}/test`, {
        method: "POST",
      }),
    onSuccess: () => notify("Test alert delivered"),
    onError: (error: unknown) =>
      notify(error instanceof Error ? error.message : "Test delivery failed"),
  });

  return {
    acknowledge,
    channels,
    createChannel,
    createRule,
    deleteChannel,
    deleteRule,
    filters,
    gates,
    incidents,
    project,
    resolve,
    rules,
    setFilters,
    testChannel,
    updateChannel,
    updateRule,
  };
}

export function useAlertIncident(incidentId: string) {
  const { project } = useObservabilityProject();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["alert-incident", project.id, incidentId],
    queryFn: () => api<AlertIncidentDetail>(`/api/v1/projects/${project.id}/alerts/${incidentId}`),
    refetchInterval: 30_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["alert-incident", project.id, incidentId] });
    void queryClient.invalidateQueries({ queryKey: ["alerts", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["alert-active-count", project.id] });
  };
  const acknowledge = useMutation({
    mutationFn: () =>
      api<AlertIncident>(`/api/v1/projects/${project.id}/alerts/${incidentId}/acknowledge`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: () =>
      api<AlertIncident>(`/api/v1/projects/${project.id}/alerts/${incidentId}/resolve`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  return { acknowledge, detail, project, resolve };
}

export type AlertsState = ReturnType<typeof useAlerts>;
export type AlertIncidentState = ReturnType<typeof useAlertIncident>;
