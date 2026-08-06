import { createHash, randomUUID } from "node:crypto";
import { type LensPostgres, member, organization, project } from "@lens/db";
import { and, asc, eq } from "drizzle-orm";
import type { SessionUser } from "./types.js";

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

async function defaultTeam(db: LensPostgres, userId: string) {
  const [row] = await db
    .select({ membership: member, organization })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return row;
}

export async function ensureDefaultTeam(db: LensPostgres, user: SessionUser) {
  const existing = await defaultTeam(db, user.id);
  if (existing !== undefined) return existing;

  const organizationId = randomUUID();
  const slug = `lens-${createHash("sha256").update(user.id).digest("hex").slice(0, 16)}`;
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: `${user.name}'s Team`,
      slug,
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId: user.id,
      role: "owner",
    });
  });
  const created = await defaultTeam(db, user.id);
  if (created === undefined) throw new Error("Default team was not created");
  return created;
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
