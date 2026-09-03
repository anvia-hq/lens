import { randomUUID } from "node:crypto";
import type { LensConfig } from "@lens/config";
import {
  account,
  invitation,
  type LensPostgres,
  member,
  organization,
  user as userTable,
} from "@lens/db";
import { APIError } from "better-auth/api";
import { and, asc, eq, gt } from "drizzle-orm";

type OidcHookContext = { path?: string; request?: Request } | null;

type OidcAccess = {
  invitationId?: string;
  organizationId: string;
  role: "admin" | "member";
};

function isOidcCallback(context: OidcHookContext, providerId: string): boolean {
  const callbackPath = `/oauth2/callback/${providerId}`;
  if (context?.path?.endsWith(callbackPath)) return true;
  if (context?.request === undefined) return false;
  return new URL(context.request.url).pathname.endsWith(callbackPath);
}

export function oidcEmailDomain(email: string): string | undefined {
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return undefined;
  return email.slice(separator + 1).toLowerCase();
}

export function isOidcEmailAllowed(email: string, allowedDomains: string[]): boolean {
  const domain = oidcEmailDomain(email);
  return domain !== undefined && allowedDomains.includes(domain);
}

export async function isRecoverableOidcUser(
  db: LensPostgres,
  userId: string,
  providerId: string,
): Promise<boolean> {
  const [existingMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  if (existingMembership !== undefined) return false;

  const [oidcAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    .limit(1);
  return oidcAccount !== undefined;
}

async function resolveOidcAccess(
  db: LensPostgres,
  email: string,
  config: LensConfig,
): Promise<OidcAccess | undefined> {
  const [pendingInvitation] = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      role: invitation.role,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt))
    .limit(1);

  if (pendingInvitation !== undefined) {
    return {
      invitationId: pendingInvitation.id,
      organizationId: pendingInvitation.organizationId,
      role: pendingInvitation.role === "admin" ? "admin" : "member",
    };
  }

  if (!config.OIDC_AUTO_PROVISION || !isOidcEmailAllowed(email, config.OIDC_ALLOWED_DOMAINS)) {
    return undefined;
  }

  const [workspace] = await db
    .select({ id: organization.id })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);
  return workspace === undefined ? undefined : { organizationId: workspace.id, role: "member" };
}

const oidcDenied = () =>
  new APIError("FORBIDDEN", {
    code: "oidc_access_denied",
    message: "Your account is not approved for this Anvia Lens workspace",
  });

function requiresVerifiedOidcEmail(config: LensConfig, access: OidcAccess): boolean {
  // Domain auto-provisioning grants access from the email address itself, so it
  // always demands a provider-verified address. Invitations and existing
  // memberships carry admin intent and sign in even without email_verified.
  return config.OIDC_REQUIRE_VERIFIED_EMAIL || access.invitationId === undefined;
}

const oidcEmailUnverified = () =>
  new APIError("FORBIDDEN", {
    code: "oidc_email_unverified",
    message: "The identity provider must verify your email address",
  });

export function oidcDatabaseHooks(db: LensPostgres, config: LensConfig) {
  const approvedAccess = new WeakMap<object, OidcAccess>();

  return {
    user: {
      create: {
        async before(user: { email: string; emailVerified: boolean }, context: OidcHookContext) {
          if (!isOidcCallback(context, config.OIDC_PROVIDER_ID)) return;
          const access = await resolveOidcAccess(db, user.email, config);
          if (access === undefined) throw oidcDenied();
          if (!user.emailVerified && requiresVerifiedOidcEmail(config, access)) {
            throw oidcEmailUnverified();
          }
          if (context !== null) approvedAccess.set(context, access);
        },
      },
    },
    session: {
      create: {
        async before(
          session: { userId: string; activeOrganizationId?: string | null },
          context: OidcHookContext,
        ) {
          if (!isOidcCallback(context, config.OIDC_PROVIDER_ID)) return;

          const [existingMembership] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1);
          if (existingMembership !== undefined) {
            if (context !== null) approvedAccess.delete(context);
            return {
              data: { ...session, activeOrganizationId: existingMembership.organizationId },
            };
          }

          const [user] = await db
            .select({ email: userTable.email, emailVerified: userTable.emailVerified })
            .from(userTable)
            .where(eq(userTable.id, session.userId))
            .limit(1);
          if (user === undefined) throw oidcDenied();

          const access =
            (context === null ? undefined : approvedAccess.get(context)) ??
            (await resolveOidcAccess(db, user.email, config));
          if (access === undefined) throw oidcDenied();
          if (!user.emailVerified && requiresVerifiedOidcEmail(config, access)) {
            throw oidcEmailUnverified();
          }

          const activeOrganizationId = await db.transaction(async (tx) => {
            await tx
              .insert(member)
              .values({
                id: randomUUID(),
                organizationId: access.organizationId,
                userId: session.userId,
                role: access.role,
                createdAt: new Date(),
              })
              .onConflictDoNothing();

            const [provisionedMembership] = await tx
              .select({ organizationId: member.organizationId })
              .from(member)
              .where(eq(member.userId, session.userId))
              .orderBy(asc(member.createdAt))
              .limit(1);
            if (provisionedMembership === undefined) throw oidcDenied();

            if (
              access.invitationId !== undefined &&
              provisionedMembership.organizationId === access.organizationId
            ) {
              await tx
                .update(invitation)
                .set({ status: "accepted" })
                .where(
                  and(eq(invitation.id, access.invitationId), eq(invitation.status, "pending")),
                );
            }
            return provisionedMembership.organizationId;
          });

          if (context !== null) approvedAccess.delete(context);
          return { data: { ...session, activeOrganizationId } };
        },
      },
    },
  };
}
