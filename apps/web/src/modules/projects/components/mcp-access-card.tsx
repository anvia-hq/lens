import type { ProjectMcpToken } from "@lens/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lens/ui/components/alert-dialog";
import { Button, buttonVariants } from "@lens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { Checkbox } from "@lens/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Spinner } from "@lens/ui/components/spinner";
import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import type { ProjectSettingsState } from "../hooks/use-project-settings";
import { McpSecretReveal } from "./mcp-secret-reveal";

export function McpAccessCard({ state }: { state: ProjectSettingsState }) {
  const [tokenToRevoke, setTokenToRevoke] = useState<ProjectMcpToken | null>(null);
  const tokens = state.mcpTokens.data?.items ?? [];
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>MCP access</CardTitle>
          <CardDescription>
            Give an AI assistant read-only access to this project&apos;s observability data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (state.mcpTokenName.trim()) state.createMcpToken.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="mcp-token-name">Token name</FieldLabel>
                <Input
                  id="mcp-token-name"
                  placeholder="AI assistant"
                  value={state.mcpTokenName}
                  onChange={(event) => state.setMcpTokenName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mcp-token-expiry">Expiry</FieldLabel>
                <NativeSelect
                  id="mcp-token-expiry"
                  value={state.mcpExpiryDays}
                  onChange={(event) => state.setMcpExpiryDays(event.target.value)}
                >
                  <NativeSelectOption value="never">Never</NativeSelectOption>
                  <NativeSelectOption value="30">30 days</NativeSelectOption>
                  <NativeSelectOption value="90">90 days</NativeSelectOption>
                  <NativeSelectOption value="365">1 year</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Button
                type="submit"
                disabled={!state.mcpTokenName.trim() || state.createMcpToken.isPending}
              >
                {state.createMcpToken.isPending ? <Spinner /> : <Plus />}
                Create token
              </Button>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="mcp-raw-payloads"
                checked={state.allowRawPayloads}
                onCheckedChange={(checked) => state.setAllowRawPayloads(checked === true)}
              />
              <div className="grid gap-1">
                <FieldLabel htmlFor="mcp-raw-payloads">Allow raw payload access</FieldLabel>
                <FieldDescription>
                  Tool calls must still explicitly request inputs, outputs, attributes, events, and
                  evaluation payloads.
                </FieldDescription>
              </div>
            </Field>
          </form>

          {state.createMcpToken.error ? <ErrorAlert error={state.createMcpToken.error} /> : null}
          {state.newMcpToken ? (
            <McpSecretReveal
              credentials={state.newMcpToken}
              onClose={() => state.setNewMcpToken(null)}
            />
          ) : null}

          <div className="overflow-hidden rounded-xl border">
            {state.mcpTokens.isPending ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Spinner /> Loading MCP tokens
              </div>
            ) : tokens.length ? (
              <div className="divide-y">
                {tokens.map((token) => {
                  const status = tokenStatus(token);
                  return (
                    <div className="flex items-center gap-3 px-4 py-3" key={token.id}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{token.name}</span>
                          <span className="text-xs text-muted-foreground">{status}</span>
                          {token.allowRawPayloads ? (
                            <span className="text-xs text-status-warning">Raw payloads</span>
                          ) : null}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {token.tokenPrefix}…
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Last used {formatDate(token.lastUsedAt)} · Expires{" "}
                          {formatDate(token.expiresAt)}
                        </p>
                      </div>
                      {token.revokedAt === null ? (
                        <Button
                          aria-label={`Revoke ${token.name}`}
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setTokenToRevoke(token)}
                        >
                          <Trash />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium">No MCP tokens</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a token to connect a remote MCP client.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={tokenToRevoke !== null}
        onOpenChange={(open) => !open && setTokenToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this MCP token?</AlertDialogTitle>
            <AlertDialogDescription>
              {tokenToRevoke?.name} will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={state.revokeMcpToken.isPending}
              onClick={() => {
                if (!tokenToRevoke) return;
                state.revokeMcpToken.mutate(tokenToRevoke.id, {
                  onSuccess: () => setTokenToRevoke(null),
                });
              }}
            >
              {state.revokeMcpToken.isPending ? <Spinner /> : <Trash />}
              Revoke token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function tokenStatus(token: ProjectMcpToken): string {
  if (token.revokedAt !== null) return "Revoked";
  if (token.expiresAt !== null && Date.parse(token.expiresAt) <= Date.now()) return "Expired";
  return "Active";
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
