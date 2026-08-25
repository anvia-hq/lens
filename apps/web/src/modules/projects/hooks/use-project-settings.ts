import type {
  CreatedProjectApiKey,
  CreatedProjectMcpToken,
  Project,
  ProjectApiKey,
  ProjectMcpToken,
} from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../lib/api";
import { notify } from "../utils";
import { useProject } from "./use-project";

export function useProjectSettings() {
  const { project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey: ["keys", project.id],
    queryFn: () => api<{ items: ProjectApiKey[] }>(`/api/v1/projects/${project.id}/keys`),
  });
  const [newKey, setNewKey] = useState<CreatedProjectApiKey | null>(null);
  const [keyName, setKeyName] = useState("Development");
  const [newMcpToken, setNewMcpToken] = useState<CreatedProjectMcpToken | null>(null);
  const [mcpTokenName, setMcpTokenName] = useState("AI assistant");
  const [mcpExpiryDays, setMcpExpiryDays] = useState("never");
  const [allowRawPayloads, setAllowRawPayloads] = useState(false);
  const canManage = project.role === "owner" || project.role === "admin";
  const mcpTokens = useQuery({
    queryKey: ["mcp-tokens", project.id],
    queryFn: () => api<{ items: ProjectMcpToken[] }>(`/api/v1/projects/${project.id}/mcp-tokens`),
    enabled: canManage,
  });
  const [retention, setRetention] = useState(
    project.settings.retentionDays === null ? "unlimited" : String(project.settings.retentionDays),
  );
  const createKey = useMutation({
    mutationFn: () =>
      api<CreatedProjectApiKey>(`/api/v1/projects/${project.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ name: keyName }),
      }),
    onSuccess: (result) => {
      setNewKey(result);
      queryClient.invalidateQueries({ queryKey: ["keys", project.id] });
      notify("Ingestion key created");
    },
  });
  const revokeKey = useMutation({
    mutationFn: (keyId: string) =>
      api<void>(`/api/v1/projects/${project.id}/keys/${keyId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys", project.id] });
      notify("Ingestion key revoked");
    },
  });
  const createMcpToken = useMutation({
    mutationFn: () => {
      const expiresAt =
        mcpExpiryDays === "never"
          ? null
          : new Date(Date.now() + Number(mcpExpiryDays) * 86_400_000).toISOString();
      return api<CreatedProjectMcpToken>(`/api/v1/projects/${project.id}/mcp-tokens`, {
        method: "POST",
        body: JSON.stringify({ name: mcpTokenName, expiresAt, allowRawPayloads }),
      });
    },
    onSuccess: (result) => {
      setNewMcpToken(result);
      setAllowRawPayloads(false);
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens", project.id] });
      notify("MCP token created");
    },
  });
  const revokeMcpToken = useMutation({
    mutationFn: (tokenId: string) =>
      api<void>(`/api/v1/projects/${project.id}/mcp-tokens/${tokenId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens", project.id] });
      notify("MCP token revoked");
    },
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      api<Project>(`/api/v1/projects/${project.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: retention === "unlimited" ? null : Number(retention),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Data settings saved");
    },
  });
  const deleteProject = useMutation({
    mutationFn: () => api<void>(`/api/v1/projects/${project.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Project deletion queued");
      await navigate({ to: "/" });
    },
  });

  return {
    allowRawPayloads,
    createMcpToken,
    createKey,
    deleteProject,
    keyName,
    keys,
    mcpExpiryDays,
    mcpTokenName,
    mcpTokens,
    newKey,
    newMcpToken,
    project,
    retention,
    revokeKey,
    revokeMcpToken,
    saveSettings,
    setKeyName,
    setAllowRawPayloads,
    setMcpExpiryDays,
    setMcpTokenName,
    setNewKey,
    setNewMcpToken,
    setRetention,
  };
}

export type ProjectSettingsState = ReturnType<typeof useProjectSettings>;
