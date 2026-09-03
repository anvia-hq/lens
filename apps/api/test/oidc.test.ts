import { describe, expect, it, vi } from "vitest";
import {
  isOidcEmailAllowed,
  isRecoverableOidcUser,
  oidcDatabaseHooks,
  oidcEmailDomain,
} from "../src/modules/auth/oidc";
import { invitationOnboarding } from "../src/modules/auth/onboarding";

describe("OIDC workspace access", () => {
  it("normalizes and checks exact email domains", () => {
    expect(oidcEmailDomain("Person@Example.COM")).toBe("example.com");
    expect(oidcEmailDomain("invalid")).toBeUndefined();
    expect(isOidcEmailAllowed("person@example.com", ["example.com"])).toBe(true);
    expect(isOidcEmailAllowed("person@sub.example.com", ["example.com"])).toBe(false);
  });

  it("rejects unverified auto-provisioned emails", async () => {
    const hooks = oidcDatabaseHooks(
      readDatabase([], [{ id: "workspace-1" }]) as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: true,
        OIDC_ALLOWED_DOMAINS: ["example.com"],
      } as never,
    );

    await expect(
      hooks.user.create.before(
        { email: "person@example.com", emailVerified: false },
        { path: "/oauth2/callback/oidc" },
      ),
    ).rejects.toMatchObject({ body: { code: "oidc_email_unverified" } });
  });

  it("admits invited users whose provider never asserts email_verified", async () => {
    const database = mockDatabase([
      [{ id: "invitation-1", organizationId: "workspace-1", role: "member" }],
      [],
      [{ email: "person@example.com", emailVerified: false }],
      [{ organizationId: "workspace-1" }],
    ]);
    const hooks = oidcDatabaseHooks(
      database as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: false,
        OIDC_ALLOWED_DOMAINS: [],
      } as never,
    );
    const context = { path: "/oauth2/callback/oidc" };

    await expect(
      hooks.user.create.before({ email: "person@example.com", emailVerified: false }, context),
    ).resolves.toBeUndefined();
    await expect(
      hooks.session.create.before({ userId: "user-1", activeOrganizationId: null }, context),
    ).resolves.toEqual({
      data: { userId: "user-1", activeOrganizationId: "workspace-1" },
    });
    expect(database.updateQueries[0]?.set).toHaveBeenCalledWith({ status: "accepted" });
  });

  it("requires verified emails for every sign-in when OIDC_REQUIRE_VERIFIED_EMAIL is set", async () => {
    const hooks = oidcDatabaseHooks(
      readDatabase([
        [{ id: "invitation-1", organizationId: "workspace-1", role: "member" }],
      ]) as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_REQUIRE_VERIFIED_EMAIL: true,
      } as never,
    );

    await expect(
      hooks.user.create.before(
        { email: "person@example.com", emailVerified: false },
        { path: "/oauth2/callback/oidc" },
      ),
    ).rejects.toMatchObject({ body: { code: "oidc_email_unverified" } });
  });

  it("rejects unverified auto-provision fallback at session creation", async () => {
    const hooks = oidcDatabaseHooks(
      mockDatabase([
        [],
        [{ email: "person@example.com", emailVerified: false }],
        [],
        [{ id: "workspace-1" }],
      ]) as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: true,
        OIDC_ALLOWED_DOMAINS: ["example.com"],
      } as never,
    );

    await expect(
      hooks.session.create.before(
        { userId: "user-1", activeOrganizationId: null },
        { path: "/oauth2/callback/oidc" },
      ),
    ).rejects.toMatchObject({ body: { code: "oidc_email_unverified" } });
  });

  it("does not apply OIDC policy to password onboarding", async () => {
    const hooks = oidcDatabaseHooks(
      {} as never,
      {
        OIDC_PROVIDER_ID: "oidc",
      } as never,
    );

    await expect(
      hooks.user.create.before(
        { email: "person@example.com", emailVerified: false },
        { path: "/bootstrap" },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects new users without an invitation when auto-provisioning is disabled", async () => {
    const hooks = oidcDatabaseHooks(
      readDatabase([]) as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: false,
        OIDC_ALLOWED_DOMAINS: [],
      } as never,
    );

    await expect(
      hooks.user.create.before(
        { email: "person@example.com", emailVerified: true },
        { path: "/oauth2/callback/oidc" },
      ),
    ).rejects.toMatchObject({ body: { code: "oidc_access_denied" } });
  });

  it("allows verified users from an auto-provisioned domain", async () => {
    const database = readDatabase([], [{ id: "workspace-1" }]);
    const hooks = oidcDatabaseHooks(
      database as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: true,
        OIDC_ALLOWED_DOMAINS: ["example.com"],
      } as never,
    );

    await expect(
      hooks.user.create.before(
        { email: "person@example.com", emailVerified: true },
        { path: "/oauth2/callback/oidc" },
      ),
    ).resolves.toBeUndefined();
    expect(database.select).toHaveBeenCalledTimes(2);
  });

  it("uses an existing membership as the active organization", async () => {
    const database = mockDatabase([[{ organizationId: "workspace-1" }]]);
    const hooks = oidcDatabaseHooks(database as never, { OIDC_PROVIDER_ID: "oidc" } as never);

    await expect(
      hooks.session.create.before(
        { userId: "user-1", activeOrganizationId: null },
        { path: "/oauth2/callback/oidc" },
      ),
    ).resolves.toEqual({
      data: { userId: "user-1", activeOrganizationId: "workspace-1" },
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("keeps approved invitation access through session provisioning", async () => {
    const database = mockDatabase([
      [{ id: "invitation-1", organizationId: "workspace-1", role: "admin" }],
      [],
      [{ email: "person@example.com", emailVerified: true }],
      [{ organizationId: "workspace-1" }],
    ]);
    const hooks = oidcDatabaseHooks(
      database as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: false,
        OIDC_ALLOWED_DOMAINS: [],
      } as never,
    );
    const context = { path: "/oauth2/callback/oidc" };

    await hooks.user.create.before({ email: "person@example.com", emailVerified: true }, context);
    await expect(
      hooks.session.create.before({ userId: "user-1", activeOrganizationId: null }, context),
    ).resolves.toEqual({
      data: { userId: "user-1", activeOrganizationId: "workspace-1" },
    });

    expect(database.select).toHaveBeenCalledTimes(4);
    expect(database.insertQueries[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "workspace-1",
        userId: "user-1",
        role: "admin",
      }),
    );
    expect(database.updateQueries[0]?.set).toHaveBeenCalledWith({ status: "accepted" });
  });

  it("auto-provisions an allowed user as a workspace member", async () => {
    const database = mockDatabase([
      [],
      [{ email: "person@example.com", emailVerified: true }],
      [],
      [{ id: "workspace-1" }],
      [{ organizationId: "workspace-1" }],
    ]);
    const hooks = oidcDatabaseHooks(
      database as never,
      {
        OIDC_PROVIDER_ID: "oidc",
        OIDC_AUTO_PROVISION: true,
        OIDC_ALLOWED_DOMAINS: ["example.com"],
      } as never,
    );

    await expect(
      hooks.session.create.before(
        { userId: "user-1", activeOrganizationId: null },
        { path: "/oauth2/callback/oidc" },
      ),
    ).resolves.toEqual({
      data: { userId: "user-1", activeOrganizationId: "workspace-1" },
    });
    expect(database.insertQueries[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member" }),
    );
    expect(database.update).not.toHaveBeenCalled();
  });

  it("allows an OIDC account without membership to be invited again", async () => {
    const recoverable = mockDatabase([[], [{ id: "account-1" }]]);
    const memberAlready = mockDatabase([[{ id: "member-1" }]]);

    await expect(isRecoverableOidcUser(recoverable as never, "user-1", "oidc")).resolves.toBe(true);
    await expect(isRecoverableOidcUser(memberAlready as never, "user-1", "oidc")).resolves.toBe(
      false,
    );
  });

  it("rejects password invitation claiming when password login is disabled", async () => {
    const endpoint = invitationOnboarding({
      passwordLoginEnabled: false,
    }).endpoints.claimInvitation;

    await expect(
      endpoint({
        body: { invitationId: "invitation-1", name: "Person", password: "password123" },
      } as never),
    ).rejects.toMatchObject({ body: { code: "password_login_disabled" } });
  });
});

function readDatabase(...results: unknown[][]) {
  return {
    select: vi.fn(() => {
      const rows = results.shift() ?? [];
      const query = {
        from: vi.fn(() => query),
        where: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve(rows)),
      };
      return query;
    }),
  };
}

function mockDatabase(selectResults: unknown[][]) {
  const insertQueries: Array<{
    values: ReturnType<typeof vi.fn>;
    onConflictDoNothing: ReturnType<typeof vi.fn>;
  }> = [];
  const updateQueries: Array<{
    set: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];
  const database = {
    select: vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const query = {
        from: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
        limit: vi.fn(() => Promise.resolve(rows)),
      };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      return query;
    }),
    insert: vi.fn(() => {
      const query = {
        values: vi.fn(),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      };
      query.values.mockReturnValue(query);
      insertQueries.push(query);
      return query;
    }),
    update: vi.fn(() => {
      const query = {
        set: vi.fn(),
        where: vi.fn(() => Promise.resolve()),
      };
      query.set.mockReturnValue(query);
      updateQueries.push(query);
      return query;
    }),
    transaction: vi.fn(),
    insertQueries,
    updateQueries,
  };
  database.transaction.mockImplementation(
    async (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
  );
  return database;
}
