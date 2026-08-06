export type AuthMode = "login" | "bootstrap";

export type SetupStatus = { initialized: boolean };

export type InvitationDetail = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
};
