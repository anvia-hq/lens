import { toast } from "@lens/ui/components/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notify, slugify } from "../modules/projects/utils";
import { shortId } from "./format";

vi.mock("@lens/ui/components/toast", () => ({ toast: { add: vi.fn() } }));

describe("web formatting utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shortens identifiers while retaining both ends", () => {
    expect(shortId("1234567890abcdef")).toBe("123456…cdef");
  });

  it("normalizes project names into URL-safe slugs", () => {
    expect(slugify("  Support & Success!  ")).toBe("support-success");
  });

  it.each([
    [undefined, "success", "low"],
    ["error", "error", "high"],
    ["info", "info", "low"],
  ] as const)(
    "sends %s notifications with the expected priority",
    (type, expectedType, priority) => {
      notify("Saved", type);
      expect(toast.add).toHaveBeenCalledWith({ title: "Saved", type: expectedType, priority });
    },
  );
});
