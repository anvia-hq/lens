import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lens/ui/components/breadcrumb";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { defaultUserColumns } from "../modules/observability/types";
import { useProject } from "../modules/projects/hooks/use-project";
import { shortId } from "../utils/format";

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
            : "Runs"
    : section === "traces"
      ? "Traces"
      : section === "sessions"
        ? "Sessions"
        : section === "users"
          ? "Users"
          : section === "connect"
            ? "Connect"
            : section === "settings"
              ? "Project settings"
              : "Overview";
  const detailId = relativePath[isEvaluations ? 2 : 1];
  const detailLabel = section === "traces" && detailId === "compare" ? "Compare traces" : detailId;
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b bg-background px-4">
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink
              className="truncate font-medium"
              render={
                <Link
                  to="/$projectId"
                  params={{ projectId: project.id }}
                  search={{ range: "24h" }}
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
                    isEvaluations ? (
                      <Link
                        to="/$projectId/evaluations/runs"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    ) : section === "traces" ? (
                      <Link
                        to="/$projectId/traces"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    ) : section === "sessions" ? (
                      <Link
                        to="/$projectId/sessions"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    ) : (
                      <Link
                        to="/$projectId/users"
                        params={{ projectId: project.id }}
                        search={{
                          range: "all",
                          sort: "lastSeenAt",
                          order: "desc",
                          page: 1,
                          pageSize: 50,
                          columns: defaultUserColumns,
                        }}
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
                      : "sessionId" in params
                        ? String(params.sessionId)
                        : "userId" in params
                          ? String(params.userId)
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
    </header>
  );
}
