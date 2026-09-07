// @vitest-environment happy-dom

import type { PromptDetail, PromptVersion } from "@lens/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { PromptDetailState, PromptsState } from "../hooks/use-prompts";
import { PromptDetailView, PromptsView } from "./prompts-view";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params: _params,
    search: _search,
    ...props
  }: ComponentProps<"a"> & {
    to: string;
    params?: unknown;
    search?: unknown;
  }) => <a href={to} {...props} />,
}));

afterEach(cleanup);

const configLabel = "Config (JSON object)";
const config = { model: "test-model", temperature: 0.4, nested: { enabled: true } };

describe("prompt config editing", () => {
  it.each(["{", "[]", "null", '"model"', "42"])(
    "blocks create and commit for invalid object config %s without clearing it",
    (invalid) => {
      const create = vi.fn();
      const created = render(<PromptsView state={listState(create)} />);
      fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
      change("Name", "support");
      change("Template", "Hello {{name}}");
      change(configLabel, invalid);
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Create prompt" }),
      );
      expect(create).not.toHaveBeenCalled();
      expect(input(configLabel).value).toBe(invalid);
      expect(screen.getByRole("dialog").textContent).toMatch(/JSON|record/i);
      created.unmount();

      const commit = vi.fn();
      render(<PromptDetailView state={detailState(commit)} />);
      fireEvent.click(screen.getByRole("button", { name: "New version" }));
      change(configLabel, invalid);
      fireEvent.click(screen.getByRole("button", { name: "Commit version" }));
      expect(commit).not.toHaveBeenCalled();
      expect(input(configLabel).value).toBe(invalid);
      expect(screen.getByRole("dialog").textContent).toMatch(/JSON|record/i);
    },
  );

  it("creates with JSON config, retains a failed draft, and resets on reopen", () => {
    const create = vi.fn();
    const view = render(<PromptsView state={listState(create)} />);
    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    change("Name", "support");
    change("Template", "Hello {{name}}");
    change(configLabel, JSON.stringify(config));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create prompt" }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "support",
        content: { type: "text", template: "Hello {{name}}", config },
      }),
      expect.any(Object),
    );
    view.rerender(<PromptsView state={listState(create, new Error("Save failed"))} />);
    expect(input("Name").value).toBe("support");
    expect(input(configLabel).value).toBe(JSON.stringify(config));
    closeDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    expect(input("Name").value).toBe("");
    expect(input(configLabel).value).toBe("{}");
  });

  it("seeds content and config from the highest version and preserves draft on refetch failure", () => {
    const commit = vi.fn();
    const view = render(<PromptDetailView state={detailState(commit)} />);
    fireEvent.click(screen.getByRole("button", { name: "New version" }));
    expect(input("Template").value).toBe("Latest template");
    expect(JSON.parse(input(configLabel).value)).toEqual(config);
    fireEvent.click(screen.getByRole("button", { name: "Commit version" }));
    expect(commit).toHaveBeenLastCalledWith(
      { type: "text", template: "Latest template", config },
      expect.any(Object),
    );
    change("Template", "Unsaved draft");
    change(configLabel, '{"temperature":0.9}');
    view.rerender(
      <PromptDetailView
        state={detailState(commit, new Error("Save failed"), {
          ...prompt,
          versions: [...prompt.versions, version(3, "Refetched template", { model: "new" })],
        })}
      />,
    );
    expect(input("Template").value).toBe("Unsaved draft");
    expect(input(configLabel).value).toBe('{"temperature":0.9}');
    fireEvent.click(screen.getByRole("button", { name: "Commit version" }));
    expect(commit).toHaveBeenLastCalledWith(
      { type: "text", template: "Unsaved draft", config: { temperature: 0.9 } },
      expect.any(Object),
    );
    closeDialog();
    fireEvent.click(screen.getByRole("button", { name: "New version" }));
    expect(input("Template").value).toBe("Refetched template");
    expect(JSON.parse(input(configLabel).value)).toEqual({ model: "new" });
  });

  it("keeps remaining chat rows mounted after deletion and saves their config", () => {
    const commit = vi.fn();
    render(
      <PromptDetailView
        state={detailState(commit, null, {
          ...prompt,
          versions: [
            {
              ...version(3, "", config),
              type: "chat",
              template: null,
              messages: [
                { role: "system", content: "First" },
                { role: "user", content: "Second", name: "customer" },
              ],
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New version" }));
    const remaining = input("Content for message 2");
    fireEvent.click(screen.getByRole("button", { name: "Remove message 1" }));
    expect(input("Content for message 1")).toBe(remaining);
    change("Content for message 1", "Edited");
    change(configLabel, '{"model":"chat-model"}');
    fireEvent.click(screen.getByRole("button", { name: "Commit version" }));
    expect(commit).toHaveBeenCalledWith(
      {
        type: "chat",
        messages: [{ role: "user", content: "Edited", name: "customer" }],
        config: { model: "chat-model" },
      },
      expect.any(Object),
    );
  });
});

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function closeDialog() {
  const close = within(screen.getByRole("dialog")).getAllByRole("button", { name: "Close" })[0];
  if (!close) throw new Error("Expected a dialog close button");
  fireEvent.click(close);
}

function listState(mutate: Mock, error: unknown = null) {
  return {
    project: { id: "project-1", role: "owner" },
    prompts: { data: { items: [] }, isLoading: false, error: null },
    search: { archived: false },
    setSearch: vi.fn(),
    createPrompt: { mutate, error },
  } as unknown as PromptsState;
}

function detailState(mutate: Mock, error: unknown = null, data = prompt) {
  return {
    project: { id: "project-1", role: "owner" },
    detail: { data, isLoading: false, error: null },
    commitVersion: { mutate, error },
    setLabel: {},
    updateDescription: {},
    archivePrompt: {},
    history: {},
  } as unknown as PromptDetailState;
}

function version(number: number, template: string, config: PromptVersion["config"]): PromptVersion {
  return {
    id: `version-${number}`,
    promptId: "prompt-1",
    version: number,
    type: "text",
    template,
    messages: null,
    config,
    changeMessage: null,
    createdBy: "user-1",
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}

const prompt: PromptDetail = {
  id: "prompt-1",
  projectId: "project-1",
  name: "support",
  description: null,
  latestVersion: 2,
  versionCount: 2,
  labels: [],
  archivedAt: null,
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
  versions: [version(1, "Older template", { model: "old" }), version(2, "Latest template", config)],
};
