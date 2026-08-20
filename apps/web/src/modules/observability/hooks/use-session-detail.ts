import type { SessionDetail } from "@lens/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import { useDataDeletions } from "./use-data-deletions";
import { useObservabilityProject } from "./use-observability-project";

export function useSessionDetail() {
  const { project } = useObservabilityProject();
  const { sessionId } = useParams({ from: "/$projectId/sessions/$sessionId" });
  const navigate = useNavigate();
  const deletions = useDataDeletions(project.id, "session");
  const session = useInfiniteQuery({
    queryKey: ["session", project.id, sessionId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<SessionDetail>(
        `/api/v1/projects/${project.id}/sessions/${sessionId}?pageSize=100${
          pageParam === null ? "" : `&cursor=${encodeURIComponent(pageParam)}`
        }`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const pages = session.data?.pages;
  const firstPage = pages?.[0];
  const traces = pages?.flatMap((page) => page.traces) ?? [];
  const uniqueTraceIds = new Set<string>();
  const uniqueTraces = traces.filter((trace) => {
    if (uniqueTraceIds.has(trace.traceId)) return false;
    uniqueTraceIds.add(trace.traceId);
    return true;
  });
  const turns = pages?.flatMap((page) => page.turns) ?? [];
  const uniqueTurnIds = new Set<string>();
  const uniqueTurns = turns.filter((turn) => {
    if (uniqueTurnIds.has(turn.trace.traceId)) return false;
    uniqueTurnIds.add(turn.trace.traceId);
    return true;
  });
  const detail =
    firstPage === undefined
      ? undefined
      : {
          summary: firstPage.summary,
          traces: uniqueTraces,
          turns: uniqueTurns,
          nextCursor: pages?.at(-1)?.nextCursor ?? null,
        };
  const deleteSession = () =>
    deletions.create.mutate([sessionId], {
      onSuccess: () =>
        void navigate({
          to: "/$projectId/sessions",
          params: { projectId: project.id },
          search: { range: "24h" },
        }),
    });
  return {
    deleteSession,
    deletionPending: deletions.create.isPending,
    detail,
    project,
    session,
  };
}
