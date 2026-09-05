// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../hooks/use-theme";
import { ThemeProvider } from "./theme-provider";

function ThemeHarness() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span>{theme}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        Dark
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    document.documentElement.className = "";
    document.head.innerHTML = '<link id="favicon" rel="icon" href="/favicon.svg">';
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("uses the system theme by default and persists explicit changes", async () => {
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(screen.getByText("system")).toBeDefined();
    expect(document.getElementById("favicon")?.getAttribute("href")).toBe("/favicon-light.svg?v=2");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(window.localStorage.getItem("lens-ui-theme")).toBe("dark");
    expect(document.getElementById("favicon")?.getAttribute("href")).toBe("/favicon-dark.svg?v=2");
  });
});
