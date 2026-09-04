import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { mcpToken } from "../src/schema.js";

describe("workspace MCP token schema", () => {
  it("keeps token lookup constraints in the generated table config", () => {
    const config = getTableConfig(mcpToken);

    expect(config.name).toBe("mcp_tokens");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "name",
      "token_prefix",
      "token_hash",
      "allow_raw_payloads",
      "created_by",
      "created_at",
      "expires_at",
      "last_used_at",
      "revoked_at",
    ]);
    expect(config.indexes).toEqual([]);
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual([
      "mcp_tokens_created_by_users_id_fk",
    ]);
  });
});
