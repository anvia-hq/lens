import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type {
  PromptDetail,
  PromptInput,
  PromptLabelEvent,
  PromptSummary,
  PromptVersionCommit,
} from "@lens/contracts";
import type { ProjectWithRole } from "../../projects/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import type { PromptsSearch } from "../types";
import { useObservabilityProject } from "./use-observability-project";

export function usePrompts() {
  const { project } = useObservabilityProject();
  const search = useSearch({ from: "/$projectId/prompts" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/api/v1/projects/${project.id}/prompts`;
  const setSearch = (changes: Partial<PromptsSearch>) => {
    void navigate({
      to: "/$projectId/prompts",
      params: { projectId: project.id },
      search: { ...search, ...changes },
    });
  };
  const refreshPrompts = () =>
    queryClient.invalidateQueries({ queryKey: ["prompts", project.id] });
  const prompts = useQuery({
    queryKey: ["prompts", project.id, search.archived],
    queryFn: () =>
      api<{ items: PromptSummary[] }>(`${base}${search.archived ? "?archived=true" : ""}`),
  });
  const createPrompt = useMutation({
    mutationFn: (input: PromptInput) =>
      api<PromptDetail>(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (prompt) => {
      await refreshPrompts();
      void navigate({
        to: "/$projectId/prompts",
        params: { projectId: project.id },
        search: { prompt: prompt.id, archived: false },
      });
    },
  });

  return {
    createPrompt,
    prompts,
    project,
    search,
    setSearch,
    openPrompt(promptId?: string) {
      void navigate({
        to: "/$projectId/prompts",
        params: { projectId: project.id },
        search: { prompt: promptId, archived: false },
      });
    },
  };
}

export function usePromptDetail(promptId: string) {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/api/v1/projects/${project.id}/prompts`;
  const refreshPrompts = () =>
    queryClient.invalidateQueries({ queryKey: ["prompts", project.id] });
  const detail = useQuery({
    queryKey: ["prompt", project.id, promptId],
    queryFn: () => api<PromptDetail>(`${base}/${promptId}`),
  });
  const history = useQuery({
    queryKey: ["prompt-history", project.id, promptId],
    queryFn: () => api<{ items: PromptLabelEvent[] }>(`${base}/${promptId}/history`),
  });
  const refreshPromptQueries = async () => {
    await Promise.all([
      refreshPrompts(),
      queryClient.invalidateQueries({ queryKey: ["prompt", project.id, promptId] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-history", project.id, promptId] }),
    ]);
  };
  const commitVersion = useMutation({
    mutationFn: (input: PromptVersionCommit) =>
      api<PromptDetail>(`${base}/${promptId}/versions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: refreshPromptQueries,
  });
  const setLabel = useMutation({
    mutationFn: (input: { label: string; version: number }) =>
      api<PromptDetail>(`${base}/${promptId}/labels`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: refreshPromptQueries,
  });
  const updateDescription = useMutation({
    mutationFn: (description: string) =>
      api<PromptDetail>(`${base}/${promptId}`, {
        method: "PATCH",
        body: JSON.stringify({ description }),
      }),
    onSuccess: refreshPromptQueries,
  });
  const archivePrompt = useMutation({
    mutationFn: () => api<void>(`${base}/${promptId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshPrompts();
      void navigate({
        to: "/$projectId/prompts",
        params: { projectId: project.id },
        search: { archived: false },
      });
    },
  });

  return {
    archivePrompt,
    commitVersion,
    detail,
    history,
    project,
    setLabel,
    updateDescription,
  };
}

export type PromptsState = {
  createPrompt: UseMutationResult<PromptDetail, Error, PromptInput>;
  prompts: UseQueryResult<{ items: PromptSummary[] }, Error>;
  project: ProjectWithRole;
  search: PromptsSearch;
  setSearch: (changes: Partial<PromptsSearch>) => void;
  openPrompt: (promptId?: string) => void;
};

export type PromptDetailState = {
  archivePrompt: UseMutationResult<void, Error, void>;
  commitVersion: UseMutationResult<PromptDetail, Error, PromptVersionCommit>;
  detail: UseQueryResult<PromptDetail, Error>;
  history: UseQueryResult<{ items: PromptLabelEvent[] }, Error>;
  project: ProjectWithRole;
  setLabel: UseMutationResult<PromptDetail, Error, { label: string; version: number }>;
  updateDescription: UseMutationResult<PromptDetail, Error, string>;
};
