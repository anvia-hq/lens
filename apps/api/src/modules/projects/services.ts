import type { Project } from "@lens/contracts";
import type { project } from "@lens/db";
import { parseRetentionDays } from "../../utils/project.js";

export function projectFromRow(row: typeof project.$inferSelect): Project {
  return {
    id: row.id,
    teamId: row.organizationId,
    name: row.name,
    slug: row.slug,
    state: row.state,
    settings: {
      retentionDays: parseRetentionDays(row.retentionDays),
      redactionPatterns: row.redactionPatterns,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
