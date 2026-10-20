import { createHmac } from "node:crypto";
import { loadConfig } from "@lens/config";
import { hashPassword } from "better-auth/crypto";
import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { account } from "../src/schema.js";
import { runSeed } from "../src/seed-runner.js";

type RecordedInsert = {
  table: string;
  values: Record<string, unknown>;
  conflict: "nothing" | "update";
  set?: Record<string, unknown>;
};

const recorded: RecordedInsert[] = [];
let accountRows: { id: string; password?: string | null }[] = [];
let apiKeyRows: { id: string; publicKey?: string; secretHash?: string }[] = [];

vi.mock("../src/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/index.js")>();
  const tx = {
    insert: (table: object) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          recorded.push({ table: getTableName(table as never), values, conflict: "nothing" });
          return Promise.resolve();
        },
        onConflictDoUpdate: (options: { set: Record<string, unknown> }) => {
          recorded.push({
            table: getTableName(table as never),
            values,
            conflict: "update",
            set: options.set,
          });
          return Promise.resolve();
        },
      }),
    }),
  };
  const db = {
    select: () => ({
      from: (table: object) => ({
        where: () => ({
          limit: async () => (table === account ? accountRows : apiKeyRows),
        }),
      }),
    }),
    transaction: async (callback: (tx: unknown) => Promise<void>) => callback(tx),
  };
  return {
    ...original,
    createPostgres: () => ({ db, sql: {}, close: async () => {} }),
    createClickHouse: () => ({ command: async () => {}, close: async () => {} }),
    insertSpans: async () => {},
    materializeTrace: async () => {},
    queryMetrics: async () => ({ current: { traces: 1, spans: 2, errors: 0 } }),
  };
});

function testConfig(nodeEnv: "development" | "production" = "development") {
  return loadConfig({
    NODE_ENV: nodeEnv,
    BETTER_AUTH_SECRET: "test-better-auth-secret-with-32-chars",
    INGESTION_KEY_PEPPER: "test-ingestion-pepper",
    LOG_LEVEL: "error",
  });
}

beforeEach(() => {
  recorded.length = 0;
  accountRows = [];
  apiKeyRows = [];
  delete process.env.LENS_ALLOW_SEED;
  delete process.env.LENS_SEED_DEMO_PASSWORD;
  delete process.env.LENS_SEED_DEMO_SECRET_KEY;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("demo seed guard", () => {
  it("refuses to run in production without an explicit opt-in", async () => {
    await expect(runSeed(testConfig("production"))).rejects.toThrow(
      /Refusing to run the demo seed in production.*LENS_ALLOW_SEED=1/,
    );
    expect(recorded).toHaveLength(0);
  });

  it("runs in production with LENS_ALLOW_SEED=1", async () => {
    process.env.LENS_ALLOW_SEED = "1";
    const credentials = await runSeed(testConfig("production"));

    expect(credentials.email).toBe("demo@lens.local");
    expect(credentials.password).toMatch(/^lens-demo-/);
    expect(credentials.publicKey).toMatch(/^pk-lens-demo-/);
    expect(credentials.secretKey).toMatch(/^sk-lens-demo-/);
  });

  it("runs outside production without the opt-in", async () => {
    const credentials = await runSeed(testConfig("development"));

    expect(credentials.password).not.toBeNull();
    expect(credentials.secretKey).not.toBeNull();
  });
});

describe("demo seed credentials", () => {
  it("creates fresh random credentials and never rotates them on conflict", async () => {
    const first = await runSeed(testConfig());

    expect(first.password).not.toBeNull();
    expect(first.secretKey).not.toBeNull();
    expect(first.password).not.toContain("LensDemo2026!");

    const accountInsert = recorded.find((entry) => entry.table === "accounts");
    expect(accountInsert?.conflict).toBe("nothing");
    expect(accountInsert?.values).toMatchObject({ password: expect.any(String) });

    const keyInsert = recorded.find((entry) => entry.table === "project_api_keys");
    expect(keyInsert?.conflict).toBe("nothing");
    expect(keyInsert?.values).toMatchObject({
      publicKey: first.publicKey,
      secretHash: createHmac("sha256", "test-ingestion-pepper")
        .update(first.secretKey ?? "")
        .digest("hex"),
    });

    // The credential and API key rows only ever use onConflictDoNothing, so a
    // re-run can never rewrite auth data. (Non-auth rows such as users, orgs,
    // and projects intentionally refresh display fields on conflict.)
    const authTables = new Set(["accounts", "project_api_keys"]);
    for (const entry of recorded.filter((candidate) => authTables.has(candidate.table))) {
      expect(entry.conflict).toBe("nothing");
      expect(entry.set).toBeUndefined();
    }

    // A second run finds the existing rows and leaves their auth data alone.
    // (Rows without stored hashes exercise the "no legacy match" warning path.)
    recorded.length = 0;
    accountRows = [{ id: "seed-account-demo" }];
    apiKeyRows = [{ id: "22222222-2222-4222-8222-222222222222" }];
    const second = await runSeed(testConfig());

    expect(second).toEqual({
      email: "demo@lens.local",
      password: null,
      publicKey: null,
      secretKey: null,
    });
    const rerunAccount = recorded.find((entry) => entry.table === "accounts");
    expect(rerunAccount?.conflict).toBe("nothing");
    expect(rerunAccount?.values).not.toHaveProperty("password");
    expect(recorded.some((entry) => entry.table === "project_api_keys")).toBe(false);
  });

  it("warns about previously published credentials without rotating them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const legacyPasswordHash = await hashPassword("LensDemo2026!");
      accountRows = [{ id: "seed-account-demo", password: legacyPasswordHash }];
      apiKeyRows = [
        {
          id: "22222222-2222-4222-8222-222222222222",
          publicKey: "pk-lens-demo-production-agents",
          secretHash: createHmac("sha256", "test-ingestion-pepper")
            .update("sk-lens-demo-4Yp9Xq7Wm2Ns8Kd5Rt3Vh6Bj1Lc0ZaEeFuGiPoUyQ")
            .digest("hex"),
        },
      ];

      const credentials = await runSeed(testConfig());

      // Flagged but untouched: no rotation, no revival.
      expect(credentials).toEqual({
        email: "demo@lens.local",
        password: null,
        publicKey: null,
        secretKey: null,
      });
      expect(recorded.some((entry) => entry.table === "project_api_keys")).toBe(false);
      const rerunAccount = recorded.find((entry) => entry.table === "accounts");
      expect(rerunAccount?.values).not.toHaveProperty("password");
      const warnings = warn.mock.calls.map((call) => String(call[0])).join("\n");
      expect(warnings).toContain("previously published demo password");
      expect(warnings).toContain("previously published key material");

      // A non-legacy existing login stays silent.
      warn.mockClear();
      recorded.length = 0;
      accountRows = [{ id: "seed-account-demo", password: await hashPassword("rotated") }];
      apiKeyRows = [{ id: "22222222-2222-4222-8222-222222222222", publicKey: "pk-fresh" }];
      await runSeed(testConfig());
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("uses caller-supplied credentials when provided", async () => {
    process.env.LENS_SEED_DEMO_PASSWORD = "operator-chosen-password";
    process.env.LENS_SEED_DEMO_SECRET_KEY = "operator-chosen-secret";

    const credentials = await runSeed(testConfig());

    expect(credentials.password).toBe("operator-chosen-password");
    expect(credentials.secretKey).toBe("operator-chosen-secret");
    const keyInsert = recorded.find((entry) => entry.table === "project_api_keys");
    expect(keyInsert?.values).toMatchObject({
      secretHash: createHmac("sha256", "test-ingestion-pepper")
        .update("operator-chosen-secret")
        .digest("hex"),
    });
  });

  it("treats a blank caller-supplied password as unset", async () => {
    process.env.LENS_SEED_DEMO_PASSWORD = "   ";

    const credentials = await runSeed(testConfig());

    expect(credentials.password).toMatch(/^lens-demo-/);
  });

  it("prints fresh secrets only on the run that creates them", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message: string) => {
      logs.push(message);
    });

    await runSeed(testConfig());
    expect(logs.some((line) => line.includes("(generated for this seed run only)"))).toBe(true);

    logs.length = 0;
    accountRows = [{ id: "seed-account-demo" }];
    apiKeyRows = [{ id: "22222222-2222-4222-8222-222222222222" }];
    await runSeed(testConfig());
    expect(logs.some((line) => line.includes("(generated for this seed run only)"))).toBe(false);
    expect(logs.some((line) => line.includes("unchanged"))).toBe(true);
  });

  it("ships no hardcoded demo credential values", async () => {
    await runSeed(testConfig());
    const printed = vi
      .mocked(console.log)
      .mock.calls.map((call) => String(call[0]))
      .join("\n");

    expect(printed).not.toContain("LensDemo2026!");
    expect(printed).not.toContain("pk-lens-demo-production-agents");
    expect(printed).not.toContain("4Yp9Xq7Wm2Ns8Kd5Rt3Vh6Bj1Lc0ZaEeFuGiPoUyQ");
  });
});
