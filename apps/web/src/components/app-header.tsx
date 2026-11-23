import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lens/ui/components/breadcrumb";
import { SidebarTrigger } from "@lens/ui/components/sidebar";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { savedFiltersSearch } from "../modules/observability/utils/saved-filters";
import { useProject } from "../modules/projects/hooks/use-project";
import { shortId } from "../utils/format";
import { ModeToggle } from "./mode-toggle";

export function AppHeader() {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  const projectRoot = `/${project.id}`;
  const relativePath = pathname.slice(projectRoot.length).split("/").filter(Boolean);
  const routeSection = relativePath[0];
  const evaluationPage = relativePath[1];
  const isEvaluations = routeSection === "evaluations";
  const section = isEvaluations ? evaluationPage : routeSection;
  const sectionLabel = isEvaluations
    ? evaluationPage === "datasets"
      ? "Datasets"
      : evaluationPage === "results"
        ? "Results"
        : evaluationPage === "compare"
          ? "Compare"
          : evaluationPage === "gates"
            ? "Quality gates"
            : "Experiments"
    : section === "traces"
      ? "Traces"
      : section === "runs"
        ? "Runs"
        : section === "threads" || section === "sessions"
          ? "Threads"
          : section === "users"
            ? "Users"
            : section === "alerts"
              ? "Alerts"
              : section === "prompts"
                ? "Prompt Management"
                : section === "connect"
                  ? "Connect"
                  : section === "settings"
                    ? "Project settings"
                    : "Overview";
  const detailId = relativePath[isEvaluations ? 2 : 1];
  const detailLabel = section === "traces" && detailId === "compare" ? "Compare traces" : detailId;
  return (
    <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger className="md:hidden" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink
              className="truncate font-medium"
              render={
                <Link
                  to="/$projectId"
                  params={{ projectId: project.id }}
                  search={savedFiltersSearch}
                />
              }
            >
              {project.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {detailId ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    isEvaluations && evaluationPage === "datasets" ? (
                      <Link
                        to="/$projectId/evaluations/datasets"
                        params={{ projectId: project.id }}
                        search={{
                          tab: detailId === "observed" ? "observed" : "managed",
                          page: 1,
                        }}
                      />
                    ) : isEvaluations ? (
                      <Link
                        to="/$projectId/evaluations/runs"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    ) : section === "traces" ? (
                      <Link
                        to="/$projectId/traces"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    ) : section === "runs" ? (
                      <Link
                        to="/$projectId/runs"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    ) : section === "threads" || section === "sessions" ? (
                      <Link
                        to="/$projectId/threads"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    ) : section === "alerts" ? (
                      <Link
                        to="/$projectId/alerts"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    ) : (
                      <Link
                        to="/$projectId/users"
                        params={{ projectId: project.id }}
                        search={savedFiltersSearch}
                      />
                    )
                  }
                >
                  {sectionLabel}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage
                  className={detailId === "compare" ? "truncate" : "truncate font-mono text-xs"}
                >
                  {"traceId" in params
                    ? shortId(String(params.traceId))
                    : "runId" in params
                      ? shortId(String(params.runId))
                      : "datasetId" in params
                        ? shortId(String(params.datasetId))
                        : "datasetName" in params
                          ? String(params.datasetName)
                          : "sessionId" in params
                            ? String(params.sessionId)
                            : "userId" in params
                              ? String(params.userId)
                              : "incidentId" in params
                                ? shortId(String(params.incidentId))
                                : detailLabel}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <ModeToggle standalone />
    </header>
  );
}
