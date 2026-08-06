import type { Project } from "@lens/contracts";

export type ProjectWithRole = Project & { role: string };

export type ProjectContextValue = {
  project: ProjectWithRole;
  projects: ProjectWithRole[];
};

export type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  isCurrentUser: boolean;
};

export type MemberInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type MemberDirectory = {
  organizationId: string;
  role: string;
  canManage: boolean;
  members: Member[];
  invitations: MemberInvitation[];
};
