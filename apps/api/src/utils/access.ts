import { type LensPostgres, member, organization, project } from "@lens/db";
import { and, asc, eq } from "drizzle-orm";

export type ProjectAccess = {
  project: typeof project.$inferSelect;
  role: string;
};

export function canManage(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export async function organizationMembership(
  db: LensPostgres,
  organizationId: string,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return row;
}

export async function appMembership(db: LensPostgres, userId: string) {
  const [row] = await db
    .select({ membership: member, organization })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return row;
}

export async function requireProjectAccess(
  db: LensPostgres,
  projectId: string,
  userId: string,
): Promise<ProjectAccess | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return undefined;
  }
  const [row] = await db
    .select({ project, role: member.role })
    .from(project)
    .innerJoin(member, eq(project.organizationId, member.organizationId))
    .where(and(eq(project.id, projectId), eq(member.userId, userId)))
    .limit(1);
  return row;
}
