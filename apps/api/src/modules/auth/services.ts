import type { LensConfig } from "@lens/config";
import { type LensPostgres, user as userTable } from "@lens/db";
import { authSchema } from "@lens/db/schema";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import nodemailer from "nodemailer";
import { apiError } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { isRecoverableOidcUser, oidcDatabaseHooks } from "./oidc.js";
import { invitationOnboarding } from "./onboarding.js";

function requiredOidcSetting(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`${name} is required when OIDC is enabled`);
  return value;
}

function oidcPlugins(config: LensConfig) {
  if (!config.OIDC_ENABLED) return [];
  return [
    genericOAuth({
      config: [
        {
          providerId: config.OIDC_PROVIDER_ID,
          discoveryUrl: requiredOidcSetting(config.OIDC_DISCOVERY_URL, "OIDC_DISCOVERY_URL"),
          clientId: requiredOidcSetting(config.OIDC_CLIENT_ID, "OIDC_CLIENT_ID"),
          clientSecret: requiredOidcSetting(config.OIDC_CLIENT_SECRET, "OIDC_CLIENT_SECRET"),
          scopes: config.OIDC_SCOPES,
          pkce: true,
          requireIssuerValidation: config.OIDC_REQUIRE_ISSUER_VALIDATION,
        },
      ],
    }),
  ];
}

export function createAuth(db: LensPostgres, config: LensConfig) {
  const mailer =
    config.SMTP_HOST === undefined
      ? undefined
      : nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          ...(config.SMTP_USER === undefined
            ? {}
            : { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }),
        });
  const send = async (message: { to: string; subject: string; text: string }) => {
    if (mailer === undefined) throw new Error("SMTP is not configured for password resets");
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
    ...(config.OIDC_ENABLED ? { databaseHooks: oidcDatabaseHooks(db, config) } : {}),
    emailAndPassword: {
      enabled: config.PASSWORD_LOGIN_ENABLED,
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
              const canRecover =
                config.OIDC_ENABLED &&
                (await isRecoverableOidcUser(db, existing.id, config.OIDC_PROVIDER_ID));
              if (canRecover) return;
              throw new APIError("CONFLICT", {
                message: "An account already exists for this email",
                code: "account_exists",
              });
            }
          },
        },
      }),
      invitationOnboarding({ passwordLoginEnabled: config.PASSWORD_LOGIN_ENABLED }),
      ...oidcPlugins(config),
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
