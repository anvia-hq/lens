import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  createOidcTokenExchange,
  resolveTokenEndpointAuth,
} from "../src/modules/auth/oidc-token-auth";

const discoveryUrl = "https://id.example.com/.well-known/openid-configuration";
const tokenEndpoint = "https://id.example.com/oauth/token";

function discoveryDocument(methods?: string[]) {
  return {
    issuer: "https://id.example.com",
    token_endpoint: tokenEndpoint,
    ...(methods === undefined ? {} : { token_endpoint_auth_methods_supported: methods }),
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tokenRequest(
  fetchMock: Mock<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>,
) {
  const call = fetchMock.mock.calls.find(([url]) => String(url) !== discoveryUrl);
  if (call === undefined) throw new Error("token endpoint was not called");
  const [, init] = call;
  const headers = new Headers(init?.headers);
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
  return { init, headers, body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTokenEndpointAuth", () => {
  it("follows the advertised methods with Basic as the spec default", () => {
    expect(resolveTokenEndpointAuth(discoveryDocument(["client_secret_basic"]), undefined)).toBe(
      "basic",
    );
    expect(resolveTokenEndpointAuth(discoveryDocument(["client_secret_post"]), undefined)).toBe(
      "post",
    );
    expect(
      resolveTokenEndpointAuth(
        discoveryDocument(["client_secret_post", "client_secret_basic"]),
        undefined,
      ),
    ).toBe("basic");
    expect(resolveTokenEndpointAuth(discoveryDocument(), undefined)).toBe("basic");
  });

  it("overrides lying metadata with the configured method", () => {
    expect(resolveTokenEndpointAuth(discoveryDocument(["client_secret_basic"]), "post")).toBe(
      "post",
    );
    expect(resolveTokenEndpointAuth(discoveryDocument(["client_secret_post"]), "basic")).toBe(
      "basic",
    );
  });

  it("refuses providers that only support methods Lens cannot perform", () => {
    expect(() =>
      resolveTokenEndpointAuth(
        discoveryDocument(["private_key_jwt", "tls_client_auth"]),
        undefined,
      ),
    ).toThrow(/OIDC_TOKEN_ENDPOINT_AUTH/);
  });
});

describe("createOidcTokenExchange", () => {
  const config = {
    OIDC_DISCOVERY_URL: discoveryUrl,
    OIDC_CLIENT_ID: "lens",
    OIDC_CLIENT_SECRET: "secret-value",
    OIDC_TOKEN_ENDPOINT_AUTH: "auto",
  } as never;

  it("authenticates with HTTP Basic when only client_secret_basic is advertised", async () => {
    const fetchMock = stubFetch((url) =>
      jsonResponse(
        url === discoveryUrl
          ? discoveryDocument(["client_secret_basic"])
          : { access_token: "at", token_type: "Bearer" },
      ),
    );
    const exchange = createOidcTokenExchange(config);

    const tokens = await exchange({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectURI: "http://localhost:3000/api/auth/oauth2/callback/oidc",
    });

    expect(tokens).toMatchObject({ accessToken: "at" });
    const { headers, body } = tokenRequest(fetchMock);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("lens:secret-value").toString("base64")}`,
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe("http://localhost:3000/api/auth/oauth2/callback/oidc");
    expect(body.get("client_secret")).toBeNull();
  });

  it("authenticates with client_secret_post when only post is advertised", async () => {
    const fetchMock = stubFetch((url) =>
      jsonResponse(
        url === discoveryUrl
          ? discoveryDocument(["client_secret_post"])
          : { access_token: "at", token_type: "Bearer" },
      ),
    );
    const exchange = createOidcTokenExchange(config);

    await exchange({ code: "the-code", redirectURI: "http://localhost:3000/callback/oidc" });

    const { headers, body } = tokenRequest(fetchMock);
    expect(headers.get("authorization")).toBeNull();
    expect(body.get("client_id")).toBe("lens");
    expect(body.get("client_secret")).toBe("secret-value");
  });

  it("fetches discovery once and reuses it across exchanges", async () => {
    const fetchMock = stubFetch((url) =>
      jsonResponse(
        url === discoveryUrl
          ? discoveryDocument(["client_secret_basic"])
          : { access_token: "at", token_type: "Bearer" },
      ),
    );
    const exchange = createOidcTokenExchange(config);

    await exchange({ code: "code-1", redirectURI: "http://localhost:3000/callback/oidc" });
    await exchange({ code: "code-2", redirectURI: "http://localhost:3000/callback/oidc" });

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === discoveryUrl)).toHaveLength(1);
  });

  it("retries discovery after a failed fetch", async () => {
    let healthy = false;
    const fetchMock = stubFetch((url) => {
      if (url !== discoveryUrl) return jsonResponse({ access_token: "at", token_type: "Bearer" });
      return healthy
        ? jsonResponse(discoveryDocument(["client_secret_basic"]))
        : jsonResponse({ error: "nope" }, 500);
    });
    const exchange = createOidcTokenExchange(config);

    await expect(
      exchange({ code: "c", redirectURI: "http://localhost:3000/callback/oidc" }),
    ).rejects.toThrow(/HTTP 500/);
    healthy = true;
    await expect(
      exchange({ code: "c", redirectURI: "http://localhost:3000/callback/oidc" }),
    ).resolves.toMatchObject({ accessToken: "at" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === discoveryUrl)).toHaveLength(2);
  });
});
