import { redirect } from "@tanstack/react-router";

const STORAGE_PREFIX = "lens:filters:v1";

/** Search params that describe a position or a drill-down, not a reusable filter. */
const TRANSIENT_KEYS = new Set(["page", "traceId"]);

type SavedFilters = Record<string, unknown>;

function storageKey(projectId: string, routeKey: string) {
  return `${STORAGE_PREFIX}:${projectId}:${routeKey}`;
}

export function pickSavedFilters(search: Record<string, unknown>): SavedFilters {
  return Object.fromEntries(
    Object.entries(search).filter(
      ([key, value]) => !TRANSIENT_KEYS.has(key) && value !== undefined,
    ),
  );
}

export function readSavedFilters(projectId: string, routeKey: string): SavedFilters | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, routeKey));
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as SavedFilters)
      : undefined;
  } catch {
    return undefined;
  }
}

export function writeSavedFilters(
  projectId: string,
  routeKey: string,
  search: Record<string, unknown>,
) {
  try {
    window.localStorage.setItem(
      storageKey(projectId, routeKey),
      JSON.stringify(pickSavedFilters(search)),
    );
  } catch {
    // Storage can be unavailable (private mode, quota); filters then simply don't persist.
  }
}

type BeforeLoadContext = {
  params: { projectId: string };
  search: Record<string, unknown>;
  location: { searchStr: string };
  cause: "preload" | "enter" | "stay";
};

/**
 * Route `beforeLoad` that keeps a page's filters in localStorage.
 *
 * - Landing on the page with no search params restores the saved filters via a redirect, which
 *   resolves before the first render, so the page never paints defaults and then jumps.
 * - Every other navigation (including in-page filter changes) saves the validated search.
 * - Preloads (link hover) are ignored so they can't overwrite what the user actually chose.
 */
export function restoreSavedFilters(routeKey: string, to: string) {
  return ({ params, search, location, cause }: BeforeLoadContext) => {
    if (cause === "preload") return;
    const { projectId } = params;
    if (cause === "enter" && location.searchStr === "") {
      const saved = readSavedFilters(projectId, routeKey);
      if (saved !== undefined && Object.keys(saved).length > 0) {
        throw redirect({
          to: to as never,
          params: { projectId } as never,
          search: saved as never,
          replace: true,
        });
      }
    }
    writeSavedFilters(projectId, routeKey, search);
  };
}

/**
 * Link `search` that is deliberately empty. Route search types require the validated keys, so
 * links can't just omit `search`; this lands on the page bare and lets `restoreSavedFilters`
 * apply the user's saved filters (or the defaults when nothing is saved yet).
 */
export const savedFiltersSearch = {} as never;
