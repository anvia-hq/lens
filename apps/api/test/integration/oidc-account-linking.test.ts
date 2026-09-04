import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { type LensConfig, loadConfig } from "@lens/config";
import {
  account,
  createPostgres,
  invitation,
  member,
  organization,
  type PostgresConnection,
  session as sessionTable,
  user as userTable,
} from "@lens/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type LensAuth } from "../../src/modules/auth/services";

/**
 * End-to-end OIDC sign-in against a provider that never asserts
 * `email_verified` (e.g. a minimal oidc-provider deployment). The provider is
 * deployment-configured, so its email claims are the identity source and an
 * existing member or invited user must link to their existing account instead
 * of being pushed through new-user creation.
 */

type MockUserInfo = {
  sub: string;
  email: string;
  name: string;
  email_verified?: boolean;
};

type MockProvider = {
  issuer: string;
  setUserInfo: (info: MockUserInfo) => void;
  close: () => Promise<void>;
};

function startMockOidcProvider(): Promise<MockProvider> {
  let userInfo: MockUserInfo = { sub: "sub-1", email: "member@example.com", name: "Member" };
  let issuer = "http://127.0.0.1:0";
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      });
    } else if (url.pathname === "/authorize") {
      const target = new URL(url.searchParams.get("redirect_uri") ?? "/");
      target.searchParams.set("code", "mock-auth-code");
      target.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: target.toString() });
      response.end();
    } else if (url.pathname === "/token") {
      const [type, encoded] = (request.headers.authorization ?? "").split(" ");
      expect(type).toBe("Basic");
      const [clientId, clientSecret] = Buffer.from(encoded ?? "", "base64")
        .toString("utf8")
        .split(":");
      expect(clientId).toBe("lens-client");
      expect(clientSecret).toBe("lens-secret");
      json({ access_token: "mock-access-token", token_type: "Bearer", expires_in: 3600 });
    } else if (url.pathname === "/userinfo") {
      expect(request.headers.authorization).toBe("Bearer mock-access-token");
      // The claim under test is deliberately absent unless a test opts in.
      const { email_verified: emailVerified, ...asserted } = userInfo;
      json(emailVerified === undefined ? asserted : { ...asserted, email_verified: emailVerified });
    } else {
      json({ error: "not_found" }, 404);
    }
  });
  const listening = Promise.withResolvers<void>();
  server.once("error", (error) => listening.reject(error));
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string" || !("port" in address)) {
      listening.reject(new Error("mock OIDC provider is not listening on a TCP port"));
      return;
    }
    issuer = `http://127.0.0.1:${address.port}`;
    listening.resolve();
  });
  return listening.promise.then(() => ({
    issuer,
    setUserInfo: (info: MockUserInfo) => {
      userInfo = info;
    },
    close: () => {
      const closed = Promise.withResolvers<void>();
      server.close((error) => (error === undefined ? closed.resolve() : closed.reject(error)));
      return closed.promise;
    },
  }));
}

/**
 * Cookie jar across the sign-in → authorize → callback round trip; better-auth
 * binds the OAuth state (and PKCE verifier) to cookies set on the first leg.
 */
type CookieJar = Map<string, string>;

function absorbCookies(jar: CookieJar, response: Response): void {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    if (pair === undefined || !pair.includes("=")) continue;
    const separator = pair.indexOf("=");
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

const cookieHeader = (jar: CookieJar) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

async function signInThroughProvider(
  auth: LensAuth,
  config: LensConfig,
  provider: MockProvider,
  userInfo: MockUserInfo,
): Promise<Response> {
  provider.setUserInfo(userInfo);
  const base = config.PUBLIC_APP_URL;

  const startResponse = await auth.handler(
    new Request(`${base}/api/auth/sign-in/oauth2`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({
        providerId: config.OIDC_PROVIDER_ID,
        callbackURL: `${base}/auth/sso`,
        errorCallbackURL: `${base}/auth/sso-error`,
      }),
    }),
  );
  expect(startResponse.status).toBe(200);
  const jar: CookieJar = new Map();
  absorbCookies(jar, startResponse);
  const startBody: unknown = await startResponse.json();
  if (typeof startBody !== "object" || startBody === null || !("url" in startBody)) {
    throw new Error(`sign-in response has no authorization URL: ${JSON.stringify(startBody)}`);
  }
  if (typeof startBody.url !== "string") {
    throw new Error(`sign-in response URL is not a string: ${JSON.stringify(startBody)}`);
  }
  const authorizeUrl = startBody.url;

  const authorizeResponse = await fetch(authorizeUrl, { redirect: "manual" });
  expect(authorizeResponse.status).toBe(302);
  const callbackUrl = authorizeResponse.headers.get("location");
  if (callbackUrl === null) throw new Error("authorize response has no location header");
  expect(callbackUrl).toContain(`/api/auth/oauth2/callback/${config.OIDC_PROVIDER_ID}`);

  const callbackResponse = await auth.handler(
    new Request(callbackUrl, { headers: { cookie: cookieHeader(jar) } }),
  );
  absorbCookies(jar, callbackResponse);
  return callbackResponse;
}

describe("OIDC account linking without email_verified", () => {
  let provider: MockProvider;
  let config: LensConfig;
  let postgres: PostgresConnection;
  let auth: LensAuth;

  beforeAll(async () => {
    provider = await startMockOidcProvider();
    config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      PUBLIC_APP_URL: "http://lens.test",
      WEB_ORIGIN: "http://lens.test",
      POSTGRES_URL: process.env.POSTGRES_URL,
      PASSWORD_LOGIN_ENABLED: "true",
      OIDC_ENABLED: "true",
      OIDC_PROVIDER_ID: "oidc",
      OIDC_DISCOVERY_URL: `${provider.issuer}/.well-known/openid-configuration`,
      OIDC_CLIENT_ID: "lens-client",
      OIDC_CLIENT_SECRET: "lens-secret",
      OIDC_AUTO_PROVISION: "true",
      OIDC_ALLOWED_DOMAINS: "example.com",
    });
    postgres = createPostgres(config);
    auth = createAuth(postgres.db, config);
  });

  afterEach(async () => {
    await postgres.sql`TRUNCATE users, sessions, accounts, verifications, organizations, members, invitations CASCADE`;
  });

  afterAll(async () => {
    await postgres.close();
    await provider.close();
  });

  const seedOrganization = async () => {
    const organizationId = randomUUID();
    await postgres.db
      .insert(organization)
      .values({ id: organizationId, name: "Acme", slug: `acme-${organizationId}` });
    return organizationId;
  };

  const seedUser = async (email: string, workspaceId?: string) => {
    const userId = randomUUID();
    await postgres.db
      .insert(userTable)
      .values({ id: userId, name: "Member", email, emailVerified: true });
    if (workspaceId !== undefined) {
      await postgres.db.insert(member).values({
        id: randomUUID(),
        organizationId: workspaceId,
        userId,
        role: "member",
      });
    }
    return userId;
  };

  it("links the OIDC identity of an existing member and opens the workspace session", async () => {
    const organizationId = await seedOrganization();
    const existingUserId = await seedUser("member@example.com", organizationId);

    const response = await signInThroughProvider(auth, config, provider, {
      sub: "provider-sub-1",
      email: "member@example.com",
      name: "Member",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${config.PUBLIC_APP_URL}/auth/sso`);

    const [linkedAccount] = await postgres.db
      .select({
        userId: account.userId,
        providerId: account.providerId,
        accountId: account.accountId,
      })
      .from(account)
      .where(eq(account.providerId, "oidc"));
    expect(linkedAccount).toEqual({
      userId: existingUserId,
      providerId: "oidc",
      accountId: "provider-sub-1",
    });

    const memberRows = await postgres.db.select({ id: member.id }).from(member);
    expect(memberRows).toHaveLength(1);

    const [sessionRow] = await postgres.db
      .select({
        userId: sessionTable.userId,
        activeOrganizationId: sessionTable.activeOrganizationId,
      })
      .from(sessionTable);
    expect(sessionRow?.userId).toBe(existingUserId);
    expect(sessionRow?.activeOrganizationId).toBe(organizationId);
  });

  it("links an invited existing user and consumes the invitation", async () => {
    const organizationId = await seedOrganization();
    const inviterId = await seedUser("admin@example.com", organizationId);
    const invitedUserId = await seedUser("invitee@example.com");
    const invitationId = randomUUID();
    await postgres.db.insert(invitation).values({
      id: invitationId,
      organizationId,
      email: "invitee@example.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId,
    });

    const response = await signInThroughProvider(auth, config, provider, {
      sub: "provider-sub-2",
      email: "invitee@example.com",
      name: "Invitee",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${config.PUBLIC_APP_URL}/auth/sso`);

    const [linkedAccount] = await postgres.db
      .select({ userId: account.userId })
      .from(account)
      .where(eq(account.providerId, "oidc"));
    expect(linkedAccount?.userId).toBe(invitedUserId);

    const userRows = await postgres.db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, "invitee@example.com"));
    expect(userRows).toHaveLength(1);

    const [membership] = await postgres.db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, invitedUserId));
    expect(membership?.organizationId).toBe(organizationId);

    const [invitationRow] = await postgres.db
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.id, invitationId));
    expect(invitationRow?.status).toBe("accepted");
  });

  it("still refuses to auto-provision an unverified email", async () => {
    await seedOrganization();

    const response = await signInThroughProvider(auth, config, provider, {
      sub: "provider-sub-3",
      email: "newbie@example.com",
      name: "Newbie",
    });
    // better-auth serializes the hook's denial into the error URL param; the
    // policy under test is observable in what it refuses to persist.
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/sso-error");
    expect(location.searchParams.get("error")).toBeTruthy();

    const userRows = await postgres.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, "newbie@example.com"));
    expect(userRows).toHaveLength(0);
    const accountRows = await postgres.db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.accountId, "provider-sub-3"));
    expect(accountRows).toHaveLength(0);
  });
});
