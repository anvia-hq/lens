// @vitest-environment happy-dom

import type { SessionDetail } from "@lens/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractSessionMessageText,
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/session";
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

  it("formats session metrics and identifiers across their display thresholds", () => {
    expect(formatNumber(12_345)).toBe("12,345");
    expect(formatNumber(123_456)).toBe("123K");
    expect(formatDuration(0.125)).toBe("125µs");
    expect(formatDuration(125)).toBe("125ms");
    expect(formatDuration(1_250)).toBe("1.25s");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.00001)).toBe("<$0.0001");
    expect(formatCost(0.005)).toBe("$0.0050");
    expect(formatCost(1.25)).toBe("$1.25");
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatTimestamp("2026-08-05T00:00:00.000Z")).not.toBe("2026-08-05T00:00:00.000Z");
    expect(shortId("trace-1")).toBe("trace-1");
    expect(shortId("1234567890abcdef")).toBe("123456…cdef");
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
