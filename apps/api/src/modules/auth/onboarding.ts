import { runWithTransaction } from "@better-auth/core/context";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { getOrgAdapter } from "better-auth/plugins/organization";
import { z } from "zod";

const credentialsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
});

const bootstrapSchema = credentialsSchema.extend({
  email: z.email().transform((value) => value.toLowerCase()),
});

const claimInvitationSchema = credentialsSchema.extend({
  invitationId: z.string().min(1),
});

const conflict = (message: string, code: string) => new APIError("CONFLICT", { message, code });

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function invitationOnboarding() {
  return {
    id: "invitation-onboarding" as const,
    endpoints: {
      bootstrap: createAuthEndpoint(
        "/bootstrap",
        { method: "POST", body: bootstrapSchema },
        async (ctx) => {
          const result = await (async () => {
            try {
              return await runWithTransaction(ctx.context.adapter, async () => {
                if ((await ctx.context.internalAdapter.countTotalUsers()) > 0) {
                  throw conflict("Anvia Lens has already been initialized", "already_initialized");
                }

                const password = await ctx.context.password.hash(ctx.body.password);
                const createdUser = await ctx.context.internalAdapter.createUser({
                  name: ctx.body.name,
                  email: ctx.body.email,
                  emailVerified: true,
                });
                await ctx.context.internalAdapter.linkAccount({
                  userId: createdUser.id,
                  providerId: "credential",
                  accountId: createdUser.id,
                  password,
                });

                const orgAdapter = getOrgAdapter(ctx.context);
                const organization = await orgAdapter.createOrganization({
                  organization: {
                    name: "Anvia Lens",
                    slug: "anvia-lens",
                    createdAt: new Date(),
                  },
                });
                await orgAdapter.createMember({
                  organizationId: organization.id,
                  userId: createdUser.id,
                  role: "owner",
                  createdAt: new Date(),
                });
                const session = await ctx.context.internalAdapter.createSession(
                  createdUser.id,
                  false,
                  { activeOrganizationId: organization.id },
                );
                return { session, user: createdUser };
              });
            } catch (error) {
              if (isUniqueViolation(error)) {
                throw conflict("Anvia Lens has already been initialized", "already_initialized");
              }
              throw error;
            }
          })();

          await setSessionCookie(ctx, result);
          return ctx.json({ user: result.user });
        },
      ),
      claimInvitation: createAuthEndpoint(
        "/claim-invitation",
        { method: "POST", body: claimInvitationSchema },
        async (ctx) => {
          const result = await runWithTransaction(ctx.context.adapter, async () => {
            const orgAdapter = getOrgAdapter(ctx.context);
            const invitation = await orgAdapter.findInvitationById(ctx.body.invitationId);
            if (
              invitation === null ||
              invitation.status !== "pending" ||
              invitation.expiresAt <= new Date()
            ) {
              throw new APIError("BAD_REQUEST", {
                message: "This invitation is unavailable",
                code: "invitation_unavailable",
              });
            }

            if (await ctx.context.internalAdapter.findUserByEmail(invitation.email)) {
              throw conflict("An account already exists for this email", "account_exists");
            }

            const password = await ctx.context.password.hash(ctx.body.password);
            const createdUser = await ctx.context.internalAdapter.createUser({
              name: ctx.body.name,
              email: invitation.email.toLowerCase(),
              emailVerified: true,
            });
            await ctx.context.internalAdapter.linkAccount({
              userId: createdUser.id,
              providerId: "credential",
              accountId: createdUser.id,
              password,
            });

            const accepted = await orgAdapter.updateInvitation({
              invitationId: invitation.id,
              status: "accepted",
              fromStatus: "pending",
            });
            if (accepted === null) {
              throw conflict("This invitation has already been used", "invitation_used");
            }
            await orgAdapter.createMember({
              organizationId: invitation.organizationId,
              userId: createdUser.id,
              role: invitation.role,
              createdAt: new Date(),
            });
            const session = await ctx.context.internalAdapter.createSession(createdUser.id, false, {
              activeOrganizationId: invitation.organizationId,
            });
            return { session, user: createdUser };
          });

          await setSessionCookie(ctx, result);
          return ctx.json({ user: result.user });
        },
      ),
    },
    rateLimit: [
      { pathMatcher: (path: string) => path === "/bootstrap", window: 60, max: 5 },
      { pathMatcher: (path: string) => path === "/claim-invitation", window: 60, max: 10 },
    ],
  };
}
