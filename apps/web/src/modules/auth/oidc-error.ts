export function oidcErrorFromSearch(search: string): Error | undefined {
  const error = new URLSearchParams(search).get("error");
  if (error === null) return undefined;
  return new Error(`OIDC authentication failed: ${error.replaceAll("_", " ")}`);
}
