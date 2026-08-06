export type MemberRole = "admin" | "member";

export function parseMemberRole(value: unknown): MemberRole | undefined {
  return value === "admin" || value === "member" ? value : undefined;
}
