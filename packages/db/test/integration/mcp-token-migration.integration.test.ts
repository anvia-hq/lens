import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { loadConfig } from "@lens/config";
import postgres from "postgres";
import { expect, it } from "vitest";

it("upgrades existing MCP tokens without crossing workspace boundaries", async () => {
  const database = `lens_mcp_migration_${randomUUID().replaceAll("-", "")}`;
  const config = loadConfig();
  const admin = postgres(config.POSTGRES_URL, { max: 1 });
  const url = new URL(config.POSTGRES_URL);
  url.pathname = `/${database}`;
  const client = postgres(url.toString(), { max: 1 });
  const migrations = new URL("../../migrations/postgres/", import.meta.url);
  try {
    await admin.unsafe(`CREATE DATABASE "${database}"`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      if (file.startsWith("0017_")) break;
      await client.unsafe(await readFile(new URL(file, migrations), "utf8"));
    }
    await client`
      INSERT INTO users (id, name, email) VALUES
      ('owner-a', 'A', 'a@example.test'),
      ('owner-b', 'B', 'b@example.test'),
      ('former-owner', 'Former', 'former@example.test')
    `;
    await client`
      INSERT INTO organizations (id, name, slug) VALUES
      ('workspace-a', 'A', 'workspace-a'), ('workspace-b', 'B', 'workspace-b')
    `;
    await client`
      INSERT INTO members (id, organization_id, user_id, role) VALUES
      ('member-a', 'workspace-a', 'owner-a', 'owner'),
      ('member-b', 'workspace-b', 'owner-b', 'owner')
    `;
    await client`
      INSERT INTO mcp_tokens (name, token_prefix, token_hash, created_by, revoked_at) VALUES
      ('active-a', 'a', 'hash-a', 'owner-a', NULL),
      ('active-b', 'b', 'hash-b', 'owner-b', NULL),
      ('revoked-a', 'r', 'hash-r', 'owner-a', '2026-01-01T00:00:00Z'),
      ('orphan', 'o', 'hash-o', 'former-owner', NULL)
    `;
    await client.unsafe(
      await readFile(new URL("0017_third_crusher_hogan.sql", migrations), "utf8"),
    );
    const rows = await client`
      SELECT name, organization_id, token_hash, revoked_at FROM mcp_tokens ORDER BY name
    `;
    expect(rows.map((row) => ({ ...row }))).toEqual([
      { name: "active-a", organization_id: "workspace-a", token_hash: "hash-a", revoked_at: null },
      { name: "active-b", organization_id: "workspace-b", token_hash: "hash-b", revoked_at: null },
      {
        name: "revoked-a",
        organization_id: "workspace-a",
        token_hash: "hash-r",
        revoked_at: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    await expect(client`
      INSERT INTO mcp_tokens (name, token_prefix, token_hash, created_by)
      VALUES ('unscoped', 'u', 'hash-u', 'owner-a')
    `).rejects.toMatchObject({ code: "23502" });
    await expect(client`
      INSERT INTO mcp_tokens (name, token_prefix, token_hash, created_by, organization_id)
      VALUES ('foreign', 'f', 'hash-f', 'owner-a', 'missing-workspace')
    `).rejects.toMatchObject({ code: "23503" });
    await client`DELETE FROM organizations WHERE id = 'workspace-a'`;
    expect(await client`SELECT name FROM mcp_tokens`).toEqual([{ name: "active-b" }]);
  } finally {
    await client.end();
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`);
    } finally {
      await admin.end();
    }
  }
}, 30_000);
