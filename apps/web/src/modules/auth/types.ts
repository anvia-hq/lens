export type AuthMode = "login" | "bootstrap";

export type SetupStatus = {
  initialized: boolean;
  passwordLoginEnabled: boolean;
  oidc: { providerId: string; displayName: string } | null;
};

export type InvitationDetail = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
};
