import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import type { ProjectWithRole } from "../types";

export function useProjects() {
  const params = useParams({ strict: false });
  const routeProjectId = "projectId" in params ? params.projectId : undefined;
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: ProjectWithRole[] }>("/api/v1/projects"),
  });
  const projects = projectsQuery.data?.items ?? [];
  const project =
    projects.find((item) => item.id === routeProjectId) ??
    (routeProjectId === undefined ? projects[0] : undefined);

  return { project, projects, projectsQuery };
}
