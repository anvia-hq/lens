// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";

afterEach(cleanup);

describe("MarkdownContent", () => {
  it("renders headings, lists, bold, inline code, links, code blocks, and tables", () => {
    const { container } = render(
      <MarkdownContent
        content={[
          "## Summary",
          "",
          "1. **Core Facts & Numbers** with `tavily_search`",
          "2. **Key Unknowns** — see [Report](https://example.com/report)",
          "",
          "- Speaker 0: *Macro Analyst*",
          "- Speaker 1: ~~Old view~~ updated",
          "",
          "> Quoted rationale",
          "",
          "```json",
          '{"ok":true}',
          "```",
          "",
          "| Metric | Value |",
          "| --- | --- |",
          "| Latency | 120ms |",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Summary")).toBeTruthy();
    expect(container.querySelector("ol")?.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("ul")?.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("Core Facts & Numbers");
    expect(container.querySelector("code")?.textContent).toBe("tavily_search");
    expect(container.querySelector("em")?.textContent).toBe("Macro Analyst");
    expect(container.querySelector("del")?.textContent).toBe("Old view");
    expect(container.querySelector("blockquote")?.textContent).toContain("Quoted rationale");
    expect(container.querySelector("pre code")?.textContent).toBe('{"ok":true}');
    expect(container.querySelector("table")?.textContent).toContain("Latency");

    const link = screen.getByRole("link", { name: "Report" });
    expect(link.getAttribute("href")).toBe("https://example.com/report");
  });

  it("blocks unsafe link schemes", () => {
    render(<MarkdownContent content="Click [here](javascript:alert(1)) safely" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/here/)).toBeTruthy();
  });

  it("detects JSON previews separately from markdown prose", () => {
    expect(looksLikeJsonPreview('{"stance":"bull","confidence":0.9}')).toBe(true);
    expect(looksLikeJsonPreview('[{"id":1}]')).toBe(true);
    expect(looksLikeJsonPreview("1. **Core Facts**")).toBe(false);
  });
});
