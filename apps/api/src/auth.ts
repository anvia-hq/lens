import type { LensConfig } from "@lens/config";
import type { LensPostgres } from "@lens/db";
import { authSchema } from "@lens/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import nodemailer from "nodemailer";

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
    appName: "Lens",
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
          subject: "Reset your Lens password",
          text: `Reset your Lens password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: config.NODE_ENV === "production",
      async sendVerificationEmail({ user, url }) {
        await send({
          to: user.email,
          subject: "Verify your Lens email",
          text: `Verify your Lens account: ${url}`,
        });
      },
    },
    plugins: [
      organization({
        async sendInvitationEmail(data) {
          const invitationUrl = `${config.PUBLIC_APP_URL}/accept-invitation/${data.id}`;
          await send({
            to: data.email,
            subject: `Join ${data.organization.name} on Lens`,
            text: `${data.inviter.user.name} invited you to ${data.organization.name}: ${invitationUrl}`,
          });
        },
      }),
    ],
  });
}

export type LensAuth = ReturnType<typeof createAuth>;
