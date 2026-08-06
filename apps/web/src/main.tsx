import { Toaster } from "@lens/ui/components/toast";
import { TooltipProvider } from "@lens/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import "@lens/ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./components/theme-provider";
import { AcceptInvitationPage } from "./routes/accept-invitation";
import { OnboardingPage } from "./routes/onboarding";
import { OverviewPage, validateOverviewSearch } from "./routes/overview";
import { ProjectsPage } from "./routes/projects";
import { AppRoot } from "./routes/root";
import { SessionDetailPage } from "./routes/session-detail";
import { SessionsPage, validateSessionsSearch } from "./routes/sessions";
import { SettingsPage } from "./routes/settings";
import { TraceDetailPage, validateTraceDetailSearch } from "./routes/trace-detail";
import { TracesPage, validateTracesSearch } from "./routes/traces";

const rootRoute = createRootRoute({ component: AppRoot });
const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId",
  validateSearch: validateOverviewSearch,
  component: OverviewPage,
});
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsPage,
});
const tracesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/traces",
  validateSearch: validateTracesSearch,
  component: TracesPage,
});
const traceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/traces/$traceId",
  validateSearch: validateTraceDetailSearch,
  component: TraceDetailPage,
});
const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/sessions",
  validateSearch: validateSessionsSearch,
  component: SessionsPage,
});
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/sessions/$sessionId",
  component: SessionDetailPage,
});
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/onboarding",
  component: OnboardingPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectId/settings",
  component: SettingsPage,
});
const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation/$invitationId",
  component: AcceptInvitationPage,
});
const routeTree = rootRoute.addChildren([
  projectsRoute,
  overviewRoute,
  tracesRoute,
  traceRoute,
  sessionsRoute,
  sessionRoute,
  onboardingRoute,
  settingsRoute,
  acceptInvitationRoute,
]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, retry: 1 },
  },
});

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Anvia Lens root element was not found");

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </Toaster>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
