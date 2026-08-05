import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AppRoot,
  OnboardingPage,
  OverviewPage,
  SettingsPage,
  TraceDetailPage,
  TracesPage,
} from "./app";
import "./styles.css";

const rootRoute = createRootRoute({ component: AppRoot });
const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
const tracesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/traces",
  component: TracesPage,
});
const traceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/traces/$traceId",
  component: TraceDetailPage,
});
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});
const routeTree = rootRoute.addChildren([
  overviewRoute,
  tracesRoute,
  traceRoute,
  onboardingRoute,
  settingsRoute,
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
if (rootElement === null) throw new Error("Lens root element was not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
