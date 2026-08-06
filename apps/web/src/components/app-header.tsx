import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lens/ui/components/breadcrumb";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useProject } from "../modules/projects/hooks/use-project";
import { shortId } from "../utils/format";

export function AppHeader() {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  const projectRoot = `/${project.id}`;
  const relativePath = pathname.slice(projectRoot.length).split("/").filter(Boolean);
  const section = relativePath[0];
  const sectionLabel =
    section === "traces"
      ? "Traces"
      : section === "sessions"
        ? "Sessions"
        : section === "onboarding"
          ? "Connect"
          : section === "settings"
            ? "Project settings"
            : "Overview";
  const detailId = relativePath[1];
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-background px-4">
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
                    section === "traces" ? (
                      <Link
                        to="/$projectId/traces"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    ) : (
                      <Link
                        to="/$projectId/sessions"
                        params={{ projectId: project.id }}
                        search={{ range: "24h" }}
                      />
                    )
                  }
                >
                  {sectionLabel}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-mono text-xs">
                  {"traceId" in params
                    ? shortId(String(params.traceId))
                    : "sessionId" in params
                      ? String(params.sessionId)
                      : detailId}
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
