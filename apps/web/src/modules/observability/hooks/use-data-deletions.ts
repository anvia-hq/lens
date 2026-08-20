import type {
  DataDeletionEntityType,
  DataDeletionRequest,
  DataDeletionRequestsResponse,
} from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../../lib/api";
import { notify } from "../../projects/utils";

export function useDataDeletions(projectId: string, entityType: DataDeletionEntityType) {
  const queryClient = useQueryClient();
  const observed = useRef<Map<string, DataDeletionRequest["status"]> | null>(null);
  const requests = useQuery({
    queryKey: ["data-deletions", projectId],
    queryFn: () =>
      api<DataDeletionRequestsResponse>(`/api/v1/projects/${projectId}/data-deletions`),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "queued" || item.status === "running")
        ? 2_000
        : 30_000,
  });
  const items = requests.data?.items ?? [];
  const pendingIds = useMemo(
    () =>
      new Set(
        items.flatMap((item) =>
          item.entityType === entityType && (item.status === "queued" || item.status === "running")
            ? item.ids
            : [],
        ),
      ),
    [entityType, items],
  );

  useEffect(() => {
    const next = new Map(items.map((item) => [item.id, item.status]));
    if (observed.current === null) {
      observed.current = next;
      return;
    }
    for (const item of items) {
      const previous = observed.current.get(item.id);
      if (previous === undefined || previous === item.status) continue;
      if (item.status === "completed") {
        notify("Data deletion completed");
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey.includes(projectId) && query.queryKey[0] !== "data-deletions",
        });
      } else if (item.status === "failed") {
        notify("Data deletion failed. The selected data may be retried.", "error");
      }
    }
    observed.current = next;
  }, [items, projectId, queryClient]);

  const create = useMutation({
    mutationFn: (ids: string[]) =>
      api<DataDeletionRequest>(`/api/v1/projects/${projectId}/data-deletions`, {
        method: "POST",
        body: JSON.stringify({ entityType, ids }),
      }),
    onSuccess: (request) => {
      queryClient.setQueryData<DataDeletionRequestsResponse>(
        ["data-deletions", projectId],
        (current) => ({ items: [request, ...(current?.items ?? [])].slice(0, 100) }),
      );
      notify("Deletion queued", "info");
    },
  });

  return { create, pendingIds, requests };
}
