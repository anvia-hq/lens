import type { LensConfig } from "@lens/config";
import type { LensPostgres } from "@lens/db";
import { authSchema } from "@lens/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { MiddlewareHandler } from "hono";
import nodemailer from "nodemailer";
import { apiError } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

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
      requireEmailVerification: config.NODE_ENV === "production",
      async sendResetPassword({ user, url }) {
        await send({
          to: user.email,
          subject: "Reset your Anvia Lens password",
          text: `Reset your Anvia Lens password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: config.NODE_ENV === "production",
      async sendVerificationEmail({ user, url }) {
        await send({
          to: user.email,
          subject: "Verify your Anvia Lens email",
          text: `Verify your Anvia Lens account: ${url}`,
        });
      },
    },
    plugins: [
      organization({
        async sendInvitationEmail(data) {
          const invitationUrl = `${config.PUBLIC_APP_URL}/accept-invitation/${data.id}`;
          await send({
            to: data.email,
            subject: `Join ${data.organization.name} on Anvia Lens`,
            text: `${data.inviter.user.name} invited you to ${data.organization.name}: ${invitationUrl}`,
          });
        },
      }),
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
