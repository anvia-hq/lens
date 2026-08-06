import { Toaster } from "@lens/ui/components/toast";
import { TooltipProvider } from "@lens/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "@lens/ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./components/theme-provider";
import { routeTree } from "./routeTree.gen";

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
