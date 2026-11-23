import { Github as GithubLogo, X } from "@mynaui/icons-react";
import { useState } from "react";

export const GITHUB_PROMO_DISMISSED_KEY = "lens.github-promo-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(GITHUB_PROMO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function SidebarGithubPromo() {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  return (
    <div className="relative mx-2 mb-2">
      <a
        className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-promo py-2.5 pl-3 pr-8 transition-colors hover:border-border-strong hover:bg-sidebar-hover hover:text-sidebar-accent-foreground"
        href="https://github.com/anvia-hq/lens"
        target="_blank"
        rel="noreferrer"
      >
        <GithubLogo className="size-5 shrink-0" />
        <span className="grid min-w-0">
          <span className="truncate text-xs font-medium">Enjoying Anvia Lens?</span>
          <span className="truncate text-xs text-muted-foreground">Star us on GitHub</span>
        </span>
      </a>
      <button
        type="button"
        aria-label="Dismiss GitHub star prompt"
        className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(GITHUB_PROMO_DISMISSED_KEY, "1");
          } catch {
            // Ignore unavailable storage.
          }
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
