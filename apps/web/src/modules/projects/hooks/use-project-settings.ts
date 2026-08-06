import type { CreatedProjectApiKey, Project, ProjectApiKey } from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../lib/api";
import { notify } from "../utils";
import { useProject } from "./use-project";

export function useProjectSettings() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey: ["keys", project.id],
    queryFn: () => api<{ items: ProjectApiKey[] }>(`/api/v1/projects/${project.id}/keys`),
  });
  const [newKey, setNewKey] = useState<CreatedProjectApiKey | null>(null);
  const [keyName, setKeyName] = useState("Development");
  const [retention, setRetention] = useState(
    project.settings.retentionDays === null ? "unlimited" : String(project.settings.retentionDays),
  );
  const [patterns, setPatterns] = useState(project.settings.redactionPatterns.join("\n"));
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
  const saveSettings = useMutation({
    mutationFn: () =>
      api<Project>(`/api/v1/projects/${project.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: retention === "unlimited" ? null : Number(retention),
          redactionPatterns: patterns
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Data settings saved");
    },
  });

  return {
    createKey,
    keyName,
    keys,
    newKey,
    patterns,
    retention,
    saveSettings,
    setKeyName,
    setNewKey,
    setPatterns,
    setRetention,
  };
}

export type ProjectSettingsState = ReturnType<typeof useProjectSettings>;
