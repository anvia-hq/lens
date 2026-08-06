import type { LensConfig } from "@lens/config";
import { type LensPostgres, user as userTable } from "@lens/db";
import { authSchema } from "@lens/db/schema";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import nodemailer from "nodemailer";
import { apiError } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { invitationOnboarding } from "./onboarding.js";

export function createAuth(db: LensPostgres, config: LensConfig) {
  const mailer = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
  });
  const send = async (message: { to: string; subject: string; text: string }) => {
    await mailer.sendMail({ from: config.SMTP_FROM, ...message });
  };

  return betterAuth({
    appName: "Anvia Lens",
    baseURL: config.PUBLIC_APP_URL,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      async sendResetPassword({ user, url }) {
        await send({
          to: user.email,
          subject: "Reset your Anvia Lens password",
          text: `Reset your Anvia Lens password: ${url}`,
        });
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        organizationHooks: {
          async beforeCreateInvitation(data) {
            if (data.invitation.role !== "admin" && data.invitation.role !== "member") {
              throw new APIError("BAD_REQUEST", {
                message: "Role must be admin or member",
                code: "invalid_role",
              });
            }
            const [existing] = await db
              .select({ id: userTable.id })
              .from(userTable)
              .where(eq(userTable.email, data.invitation.email.toLowerCase()))
              .limit(1);
            if (existing !== undefined) {
              throw new APIError("CONFLICT", {
                message: "An account already exists for this email",
                code: "account_exists",
              });
            }
          },
        },
      }),
      invitationOnboarding(),
    ],
  });
}

export type LensAuth = ReturnType<typeof createAuth>;

export function createSessionMiddleware(deps: ApiDependencies): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return apiError(c, 401, "unauthorized", "Sign in is required");
    c.set("session", session);
    await next();
  };
}
