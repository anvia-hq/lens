import type { Project } from "@lens/contracts";

export type ProjectWithRole = Project & { role: string };

export type ProjectContextValue = {
  project: ProjectWithRole;
  projects: ProjectWithRole[];
};

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  isCurrentUser: boolean;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type TeamDirectory = {
  organizationId: string;
  role: string;
  canManage: boolean;
  members: TeamMember[];
  invitations: TeamInvitation[];
};
