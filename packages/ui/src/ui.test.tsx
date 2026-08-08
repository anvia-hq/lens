import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { Input } from "@lens/ui/components/input";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { cn } from "@lens/ui/lib/utils";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("UI foundations", () => {
  it("merges conditional Tailwind classes without conflicting utilities", () => {
    expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
  });

  it("renders representative primitives with their semantic elements and slots", () => {
    const markup = renderToStaticMarkup(
      <Card size="sm">
        <CardHeader>
          <CardTitle>Dataset</CardTitle>
          <CardDescription>Regression cases</CardDescription>
        </CardHeader>
        <CardContent>
          <Input aria-label="Name" />
          <Badge>Ready</Badge>
          <Button>Save</Button>
        </CardContent>
      </Card>,
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-size="sm"');
    expect(markup).toContain("Dataset");
    expect(markup).toContain("<input");
    expect(markup).toContain("<button");
  });

  it("tracks the mobile breakpoint and removes its media listener", async () => {
    let changeListener: (() => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: vi.fn((_event, listener: () => void) => {
          changeListener = listener;
        }),
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1_024,
      writable: true,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    function Probe() {
      return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
    }

    await act(() => root.render(<Probe />));
    expect(container.textContent).toBe("desktop");

    window.innerWidth = 500;
    await act(() => changeListener?.());
    expect(container.textContent).toBe("mobile");

    await act(() => root.unmount());
    expect(removeEventListener).toHaveBeenCalledWith("change", changeListener);
  });
});
