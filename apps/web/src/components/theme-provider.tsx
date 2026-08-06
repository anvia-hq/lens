import { type ReactNode, useEffect, useState } from "react";
import { type Theme, ThemeContext } from "../hooks/use-theme";

const storageKey = "lens-ui-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.classList.remove("light", "dark");
      root.classList.add(theme === "system" ? (media.matches ? "dark" : "light") : theme);
    };
    apply();
    localStorage.setItem(storageKey, theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
