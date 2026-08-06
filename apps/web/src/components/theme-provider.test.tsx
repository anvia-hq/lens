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
    localStorage.clear();
    document.documentElement.className = "";
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

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem("lens-ui-theme")).toBe("dark");
  });
});
