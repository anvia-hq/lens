// @vitest-environment happy-dom

import type { SessionDetail } from "@lens/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { extractSessionMessageText } from "../utils/session";
import { SessionConversation } from "./session-conversation";

afterEach(cleanup);

describe("session conversation", () => {
  it("extracts the current user prompt and final assistant response", () => {
    expect(
      extractSessionMessageText(
        {
          chatHistory: [
            { role: "user", content: "Earlier question" },
            { role: "assistant", content: "Earlier answer" },
          ],
          prompt: { role: "user", content: "Current question" },
        },
        "user",
      ),
    ).toBe("Current question");
    expect(
      extractSessionMessageText(
        {
          choices: [{ message: { role: "assistant", content: "Final answer" } }],
          response: { role: "assistant", content: "Preferred final answer" },
        },
        "assistant",
      ),
    ).toBe("Preferred final answer");
  });

  it("uses the latest matching role in message arrays and preserves arbitrary JSON", () => {
    expect(
      extractSessionMessageText(
        [
          { role: "user", content: "First" },
          { role: "assistant", content: "Reply" },
          { role: "user", content: "Second" },
        ],
        "user",
      ),
    ).toBe("Second");
    expect(extractSessionMessageText({ custom: { nested: true } }, "assistant")).toContain(
      '"custom"',
    );
  });

  it("renders a clear empty conversation state without a card wrapper", () => {
    render(<SessionConversation detail={emptySession()} projectId="project-1" />);
    expect(screen.getByRole("heading", { name: "session-1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Usage" })).toBeTruthy();
    expect(screen.getByText("No conversation payloads captured")).toBeTruthy();
  });

  it("keeps successful session status outcome-only when child spans failed", () => {
    const detail = emptySession();
    detail.summary.spanErrorCount = 3;
    render(<SessionConversation detail={detail} projectId="project-1" />);
    expect(screen.getByText("Success")).toBeTruthy();
    expect(screen.queryByText(/recovered/i)).toBeNull();
  });
});

function emptySession(): SessionDetail {
  return {
    summary: {
      projectId: "project-1",
      sessionId: "session-1",
      userId: "user-1",
      startedAt: "2026-08-05T00:00:00.000Z",
      endedAt: "2026-08-05T00:00:01.000Z",
      durationMs: 1_000,
      traceCount: 1,
      errorCount: 0,
      spanErrorCount: 0,
      spanCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      inputCost: 0.01,
      outputCost: 0.02,
      totalCost: 0.03,
      status: "success",
      services: ["support"],
      environments: ["production"],
      models: ["gpt-4.1"],
      tags: [],
      lastSeenAt: "2026-08-05T00:00:01.000Z",
    },
    traces: [],
    turns: [],
    nextCursor: null,
  };
}
