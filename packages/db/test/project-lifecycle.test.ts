import type { ClickHouseClient, LensPostgres } from "../src/index.js";
import { deleteProjectTelemetry } from "../src/telemetry-store.js";
import { withActiveProjectWrite } from "../src/project-lifecycle.js";
import { describe, expect, it, vi } from "vitest";

function database(rows: unknown[]) {
  const lock = vi.fn().mockResolvedValue(rows);
  const tx = { select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }) };
  const transaction = vi.fn(async (callback) => callback(tx));
  return { db: { transaction } as unknown as LensPostgres, tx, lock };
}

describe("project lifecycle write fence", () => {
  it("skips writes when the active project query returns no row", async () => {
    const { db, lock } = database([]);
    const write = vi.fn();
    expect(await withActiveProjectWrite(db, "project", write)).toBeUndefined();
    expect(lock).toHaveBeenCalledWith("share");
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the transaction open until the external write settles", async () => {
    const row = { id: "project", state: "active" };
    const { db, tx } = database([row]);
    const write = Promise.withResolvers<string>();
    const callback = vi.fn(() => write.promise);
    let finished = false;
    const result = withActiveProjectWrite(db, "project", callback).then((value) => {
      finished = true;
      return value;
    });
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(row, tx));
    expect(finished).toBe(false);
    write.resolve("written");
    expect(await result).toBe("written");
  });

  it("propagates external failures to release the transaction by rollback", async () => {
    const { db } = database([{ id: "project", state: "active" }]);
    await expect(
      withActiveProjectWrite(db, "project", async () => {
        throw new Error("ClickHouse unavailable");
      }),
    ).rejects.toThrow("ClickHouse unavailable");
  });
});

describe("project telemetry cleanup", () => {
  it("waits for each of the four mutations and requests replica completion", async () => {
    const first = Promise.withResolvers<unknown>();
    const command = vi.fn().mockResolvedValue({}).mockReturnValueOnce(first.promise);
    const deletion = deleteProjectTelemetry({ command } as unknown as ClickHouseClient, "project");
    expect(command).toHaveBeenCalledTimes(1);
    first.resolve({});
    await deletion;
    expect(command).toHaveBeenCalledTimes(4);
    for (const [input] of command.mock.calls) {
      expect(input.query).toContain("SETTINGS mutations_sync = 2");
      expect(input.query_params).toEqual({ projectId: "project" });
    }
  });
});
