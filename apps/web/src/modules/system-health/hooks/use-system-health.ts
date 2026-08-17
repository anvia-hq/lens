import type { SystemHealth } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useProject } from "../../projects/hooks/use-project";

export function useSystemHealth() {
  const { project } = useProject();
  const canManage = project.role === "owner" || project.role === "admin";
  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: () => api<SystemHealth>("/api/v1/system/health"),
    enabled: canManage,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  return { canManage, health, value: health.data };
}

export type SystemHealthState = ReturnType<typeof useSystemHealth>;
