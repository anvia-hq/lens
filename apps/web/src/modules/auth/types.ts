export type AuthMode = "login" | "signup";

export type InvitationDetail = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  organizationName: string;
};
