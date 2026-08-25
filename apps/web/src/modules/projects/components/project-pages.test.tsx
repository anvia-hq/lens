// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectState } from "../hooks/use-connect";
import type { ProjectSettingsState } from "../hooks/use-project-settings";
import { ConnectContent } from "./connect-content";
import { ProjectSettings } from "./project-settings";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const project = {
  id: "project-alpha",
  teamId: "anvia-lens",
  name: "Alpha",
  slug: "alpha",
  state: "active" as const,
  settings: { retentionDays: 30 as const },
  createdAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-06T00:00:00.000Z",
  role: "owner",
};

afterEach(cleanup);

describe("simple project pages", () => {
  it("keeps Connect focused on credentials and instrumentation", () => {
    render(
      <ConnectContent
        state={
          {
            copied: null,
            copy: vi.fn(),
            project,
            snippets: {
              environment: "ANVIA_LENS_BASE_URL=http://localhost",
              anvia: "lens.create()",
              langfuse: "new LangfuseSpanProcessor()",
            },
          } as unknown as ConnectState
        }
      />,
    );

    expect(screen.getByText("1. Add your credentials")).toBeTruthy();
    expect(screen.getByText("2. Add instrumentation")).toBeTruthy();
    expect(screen.queryByText("Connection checklist")).toBeNull();
    expect(screen.getByRole("heading", { name: "Connect" }).closest("header")?.className).toContain(
      "max-w-4xl",
    );
  });

  it("keeps Settings focused on keys and retention", () => {
    render(
      <ProjectSettings
        state={
          {
            createKey: { error: null, isPending: false, mutate: vi.fn() },
            createMcpToken: { error: null, isPending: false, mutate: vi.fn() },
            deleteProject: { error: null, isPending: false, mutate: vi.fn() },
            allowRawPayloads: false,
            keyName: "Development",
            keys: { data: { items: [] }, isPending: false },
            mcpExpiryDays: "never",
            mcpTokenName: "AI assistant",
            mcpTokens: { data: { items: [] }, isPending: false },
            newKey: null,
            newMcpToken: null,
            project,
            retention: "30",
            revokeKey: { isPending: false, mutate: vi.fn() },
            revokeMcpToken: { isPending: false, mutate: vi.fn() },
            saveSettings: { error: null, isPending: false, isSuccess: false, mutate: vi.fn() },
            setKeyName: vi.fn(),
            setAllowRawPayloads: vi.fn(),
            setMcpExpiryDays: vi.fn(),
            setMcpTokenName: vi.fn(),
            setNewKey: vi.fn(),
            setNewMcpToken: vi.fn(),
            setRetention: vi.fn(),
          } as unknown as ProjectSettingsState
        }
      />,
    );

    expect(screen.getByText("Ingestion keys")).toBeTruthy();
    expect(screen.getByText("MCP access")).toBeTruthy();
    expect(screen.getByText("Data retention")).toBeTruthy();
    expect(screen.queryByText(/redaction/i)).toBeNull();
    expect(screen.queryByText("Project controls")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Project settings" }).closest("header")?.className,
    ).toContain("max-w-4xl");
    expect(screen.getByRole("button", { name: "Save retention" }).className).toContain("w-fit");
  });
});
