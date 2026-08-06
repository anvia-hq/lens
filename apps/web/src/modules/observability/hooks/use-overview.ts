import type { Metrics, MetricsRangePreset } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import type { OverviewSearch, RefreshInterval } from "../types";
import { adaptiveRefreshInterval, refreshMilliseconds } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useOverview() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as OverviewSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(() =>
    adaptiveRefreshInterval(search.range),
  );
  useEffect(() => setRefreshInterval(adaptiveRefreshInterval(search.range)), [search.range]);
  const metrics = useQuery({
    queryKey: ["metrics", project.id, search.range],
    queryFn: () => api<Metrics>(`/api/v1/projects/${project.id}/metrics?range=${search.range}`),
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const setRange = (range: MetricsRangePreset) => {
    void navigate({
      to: "/$projectId",
      params: { projectId: project.id },
      search: { range },
      replace: true,
    });
  };

  return {
    metrics,
    project,
    refreshInterval,
    search,
    setRange,
    setRefreshInterval,
    value: metrics.data,
  };
}

export type OverviewState = ReturnType<typeof useOverview>;
