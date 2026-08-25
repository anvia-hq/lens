import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { projectMcpToken } from "../src/schema.js";

describe("project MCP token schema", () => {
  it("keeps token lookup and ownership constraints in the generated table config", () => {
    const config = getTableConfig(projectMcpToken);

    expect(config.name).toBe("project_mcp_tokens");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "project_id",
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
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "project_mcp_tokens_project_idx",
    );
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual([
      "project_mcp_tokens_project_id_projects_id_fk",
      "project_mcp_tokens_created_by_users_id_fk",
    ]);
  });
});
