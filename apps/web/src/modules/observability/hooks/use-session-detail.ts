import type { SessionDetail } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import { useObservabilityProject } from "./use-observability-project";

export function useSessionDetail() {
  const { project } = useObservabilityProject();
  const { sessionId } = useParams({ from: "/$projectId/sessions/$sessionId" });
  const session = useQuery({
    queryKey: ["session", project.id, sessionId],
    queryFn: () => api<SessionDetail>(`/api/v1/projects/${project.id}/sessions/${sessionId}`),
    refetchInterval: 30_000,
  });
  return { detail: session.data, project, session };
}
