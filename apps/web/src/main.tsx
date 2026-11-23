import { Button } from "@lens/ui/components/button";
import { Toaster } from "@lens/ui/components/toast";
import { TooltipProvider } from "@lens/ui/components/tooltip";
import { Danger as AlertCircle } from "@mynaui/icons-react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, Link, RouterProvider } from "@tanstack/react-router";
import "@lens/ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FullPageMessage } from "./components/full-page-message";
import { ThemeProvider } from "./components/theme-provider";
import { ApiError } from "./lib/api";
import { authClient } from "./lib/auth";
import { routeTree } from "./routeTree.gen";

function RouterErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "An unexpected error occurred while rendering this page.";
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Something went wrong</h1>
        <p className="max-w-md text-base text-muted-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
        <Button size="sm" variant="outline" render={<Link to="/" />}>
          Go to projects
        </Button>
      </div>
    </div>
  );
}

function RouterNotFoundFallback() {
  return <FullPageMessage icon={<AlertCircle />} text="Page not found" />;
}

const router = createRouter({
  routeTree,
  defaultErrorComponent: RouterErrorFallback,
  defaultNotFoundComponent: RouterNotFoundFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

let sessionRefreshInFlight = false;
function handleAuthError(error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401 || sessionRefreshInFlight) return;
  sessionRefreshInFlight = true;
  void authClient
    .getSession()
    .catch(() => undefined)
    .finally(() => {
      sessionRefreshInFlight = false;
    });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
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
