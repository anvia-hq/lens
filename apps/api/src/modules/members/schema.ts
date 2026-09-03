import { z } from "zod";

export const memberRoleSchema = z.object({ role: z.enum(["admin", "member"]) });

export type MemberRole = z.infer<typeof memberRoleSchema>["role"];
