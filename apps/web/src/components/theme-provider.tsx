import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type Theme, ThemeContext } from "../hooks/use-theme";

const storageKey = "lens-ui-theme";

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      document.getElementById("favicon")?.setAttribute("href", `/favicon-${resolvedTheme}.svg?v=2`);
    };
    apply();
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Ignore storage write errors in restricted browsing contexts.
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
