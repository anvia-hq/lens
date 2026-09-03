import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { validateAuthorizationCode } from "@better-auth/core/oauth2";
import type { LensConfig } from "@lens/config";

export type TokenEndpointAuth = "basic" | "post";

const CLIENT_SECRET_BASIC = "client_secret_basic";
const CLIENT_SECRET_POST = "client_secret_post";

/**
 * Picks how Lens authenticates to the provider's token endpoint. An explicit
 * override always wins. Otherwise the provider's advertised
 * `token_endpoint_auth_methods_supported` decides, with `client_secret_basic`
 * as the fallback because RFC 8414 and the OIDC Discovery spec both make Basic
 * the default when a discovery document omits the field.
 */
export function resolveTokenEndpointAuth(
  metadata: unknown,
  override: TokenEndpointAuth | undefined,
): TokenEndpointAuth {
  if (override !== undefined) return override;
  const supported = (metadata as { token_endpoint_auth_methods_supported?: unknown } | null)
    ?.token_endpoint_auth_methods_supported;
  if (Array.isArray(supported)) {
    if (supported.includes(CLIENT_SECRET_BASIC)) return "basic";
    if (supported.includes(CLIENT_SECRET_POST)) return "post";
    const advertised = supported.filter((method) => typeof method === "string").join(", ");
    throw new Error(
      `OIDC provider advertises token endpoint auth methods [${advertised}]; Lens only supports ${CLIENT_SECRET_BASIC} and ${CLIENT_SECRET_POST}. Set OIDC_TOKEN_ENDPOINT_AUTH=basic|post to force one.`,
    );
  }
  return "basic";
}

/**
 * Builds a better-auth `getToken` hook that exchanges authorization codes
 * following the provider's own metadata instead of always using
 * client_secret_post. Discovery is fetched once and reused; a failed fetch is
 * retried on the next sign-in.
 */
export function createOidcTokenExchange(config: LensConfig) {
  const discoveryUrl = config.OIDC_DISCOVERY_URL;
  if (discoveryUrl === undefined) {
    throw new Error("OIDC_DISCOVERY_URL is required when OIDC is enabled");
  }
  const clientId = config.OIDC_CLIENT_ID;
  if (clientId === undefined) throw new Error("OIDC_CLIENT_ID is required when OIDC is enabled");
  const clientSecret = config.OIDC_CLIENT_SECRET;
  if (clientSecret === undefined) {
    throw new Error("OIDC_CLIENT_SECRET is required when OIDC is enabled");
  }
  const override =
    config.OIDC_TOKEN_ENDPOINT_AUTH === "auto" ? undefined : config.OIDC_TOKEN_ENDPOINT_AUTH;

  let resolution: Promise<{ tokenEndpoint: string; authentication: TokenEndpointAuth }> | undefined;
  const resolve = () => {
    if (resolution !== undefined) return resolution;
    resolution = (async () => {
      const response = await fetch(discoveryUrl, { headers: { accept: "application/json" } });
      if (!response.ok) {
        throw new Error(
          `OIDC discovery request to ${discoveryUrl} failed with HTTP ${response.status}`,
        );
      }
      const metadata: unknown = await response.json();
      const tokenEndpoint = (metadata as { token_endpoint?: unknown } | null)?.token_endpoint;
      if (typeof tokenEndpoint !== "string" || tokenEndpoint.length === 0) {
        throw new Error(
          `OIDC discovery document at ${discoveryUrl} does not advertise a token_endpoint`,
        );
      }
      return { tokenEndpoint, authentication: resolveTokenEndpointAuth(metadata, override) };
    })();
    resolution.catch(() => {
      resolution = undefined;
    });
    return resolution;
  };

  return async (data: {
    code: string;
    redirectURI: string;
    codeVerifier?: string;
  }): Promise<OAuth2Tokens> => {
    const { tokenEndpoint, authentication } = await resolve();
    return validateAuthorizationCode({
      code: data.code,
      codeVerifier: data.codeVerifier,
      redirectURI: data.redirectURI,
      options: { clientId, clientSecret },
      tokenEndpoint,
      authentication,
    });
  };
}
