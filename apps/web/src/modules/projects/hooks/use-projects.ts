import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../lib/api";
import type { ProjectWithRole } from "../types";

export function useProjects() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const routeProjectId = "projectId" in params ? params.projectId : undefined;
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: ProjectWithRole[] }>("/api/v1/projects"),
  });
  const projects = projectsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("lens-project") ?? "");
  const project =
    projects.find((item) => item.id === routeProjectId) ??
    (routeProjectId === undefined
      ? (projects.find((item) => item.id === selectedId) ?? projects[0])
      : undefined);

  const selectProject = (id: string) => {
    localStorage.setItem("lens-project", id);
    setSelectedId(id);
    void navigate({ to: "/$projectId", params: { projectId: id }, search: { range: "24h" } });
  };

  return { project, projects, projectsQuery, selectProject };
}
