import {
  type AlertChannel,
  type AlertChannelInput,
  type AlertChannelType,
  alertChannelInputSchema,
  alertChannelTypes,
} from "@lens/contracts";
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
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Bell, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { AlertsState } from "../hooks/use-alerts";
import { LoadingRows } from "./loading-rows";

const typeLabels: Record<AlertChannelType, string> = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  webhook: "Webhook",
};

export function AlertChannelsView({ state }: { state: AlertsState }) {
  const [editing, setEditing] = useState<AlertChannel | "new" | null>(null);
  const [deleting, setDeleting] = useState<AlertChannel | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  const channels = state.channels.data?.items ?? [];
  const saving = state.createChannel.isPending || state.updateChannel.isPending;

  return (
    <div className="grid gap-4">
      {state.channels.error ? <ErrorAlert error={state.channels.error} /> : null}
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus /> New channel
          </Button>
        </div>
      ) : null}
      {state.channels.isLoading ? (
        <div className="overflow-hidden rounded-lg border">
          <LoadingRows />
        </div>
      ) : channels.length > 0 ? (
        <ChannelTable
          channels={channels}
          canManage={canManage}
          testing={state.testChannel}
          onEdit={setEditing}
          onDelete={setDeleting}
          onTest={(id) => state.testChannel.mutate(id)}
        />
      ) : (
        <EmptyState
          icon={<Bell />}
          title="No alert channels"
          text="Connect Slack, Discord, Telegram, or a webhook to be notified when incidents open."
        />
      )}

      <ChannelDialog
        item={editing}
        saving={saving}
        error={state.createChannel.error ?? state.updateChannel.error}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (editing === "new") {
            state.createChannel.mutate(input, { onSuccess: () => setEditing(null) });
          } else if (editing) {
            state.updateChannel.mutate(
              { id: editing.id, input },
              { onSuccess: () => setEditing(null) },
            );
          }
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert channel?</AlertDialogTitle>
            <AlertDialogDescription>
              Rules that send to this channel stop delivering. Past deliveries are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={state.deleteChannel.isPending}
              onClick={() =>
                deleting &&
                state.deleteChannel.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }
            >
              Delete channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChannelTable(props: {
  channels: AlertChannel[];
  canManage: boolean;
  testing: AlertsState["testChannel"];
  onEdit: (channel: AlertChannel) => void;
  onDelete: (channel: AlertChannel) => void;
  onTest: (channelId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Created</TableHead>
            {props.canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.channels.map((channel) => (
            <TableRow key={channel.id}>
              <TableCell className="font-medium">{channel.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{typeLabels[channel.type]}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(channel.createdAt)}
              </TableCell>
              {props.canManage ? (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={props.testing.isPending}
                      onClick={() => props.onTest(channel.id)}
                    >
                      {props.testing.variables === channel.id ? "Sending…" : "Send test"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => props.onEdit(channel)}>
                      <PencilSimple /> Edit
                    </Button>
                    <Button
                      aria-label={`Delete ${channel.name}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => props.onDelete(channel)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ChannelDraft = {
  name: string;
  type: AlertChannelType;
  webhookUrl: string;
  botToken: string;
  chatId: string;
  url: string;
  secret: string;
};

function ChannelDialog(props: {
  item: AlertChannel | "new" | null;
  saving: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: (input: AlertChannelInput) => void;
}) {
  const [draft, setDraft] = useState<ChannelDraft>(emptyDraft());
  useEffect(
    () => setDraft(props.item && props.item !== "new" ? channelDraft(props.item) : emptyDraft()),
    [props.item],
  );
  const parsed = alertChannelInputSchema.safeParse(channelInput(draft));
  const editing = props.item !== null && props.item !== "new";
  return (
    <Dialog open={props.item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>{editing ? "Edit alert channel" : "Create alert channel"}</DialogTitle>
          <DialogDescription>Deliveries are sent here when an incident opens.</DialogDescription>
        </DialogHeader>
        <form
          id="alert-channel-form"
          className="grid max-h-[68vh] gap-4 overflow-y-auto px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed.success && !props.saving) props.onSave(parsed.data);
          }}
        >
          <Field>
            <FieldLabel htmlFor="channel-name">Name</FieldLabel>
            <Input
              id="channel-name"
              autoFocus
              value={draft.name}
              placeholder="On-call Slack"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="channel-type">Type</FieldLabel>
            <NativeSelect
              id="channel-type"
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value as AlertChannelType })
              }
            >
              {alertChannelTypes.map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {typeLabels[type]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {draft.type === "slack" || draft.type === "discord" ? (
            <Field>
              <FieldLabel htmlFor="channel-webhook-url">Webhook URL</FieldLabel>
              <Input
                id="channel-webhook-url"
                type="password"
                autoComplete="off"
                value={draft.webhookUrl}
                placeholder="Re-enter to replace"
                onChange={(event) => setDraft({ ...draft, webhookUrl: event.target.value })}
              />
              <FieldDescription>
                {draft.type === "slack"
                  ? "From your Slack app: an incoming-webhook URL (hooks.slack.com/…)."
                  : "From your Discord channel: Integration → Webhooks → Copy URL."}
              </FieldDescription>
            </Field>
          ) : null}
          {draft.type === "telegram" ? (
            <>
              <Field>
                <FieldLabel htmlFor="channel-bot-token">Bot token</FieldLabel>
                <Input
                  id="channel-bot-token"
                  type="password"
                  autoComplete="off"
                  value={draft.botToken}
                  placeholder="Re-enter to replace"
                  onChange={(event) => setDraft({ ...draft, botToken: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="channel-chat-id">Chat ID</FieldLabel>
                <Input
                  id="channel-chat-id"
                  value={draft.chatId}
                  placeholder="123456789 or @channelname"
                  onChange={(event) => setDraft({ ...draft, chatId: event.target.value })}
                />
              </Field>
            </>
          ) : null}
          {draft.type === "webhook" ? (
            <>
              <Field>
                <FieldLabel htmlFor="channel-url">URL</FieldLabel>
                <Input
                  id="channel-url"
                  type="url"
                  value={draft.url}
                  placeholder="https://example.com/hooks/lens"
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="channel-secret">Signing secret (optional)</FieldLabel>
                <Input
                  id="channel-secret"
                  type="password"
                  autoComplete="off"
                  value={draft.secret}
                  placeholder={editing ? "Re-enter to replace" : "Minimum 16 characters"}
                  onChange={(event) => setDraft({ ...draft, secret: event.target.value })}
                />
                <FieldDescription>
                  When set, requests are signed with an HMAC-SHA256 <code>x-lens-signature</code>{" "}
                  header.
                </FieldDescription>
              </Field>
            </>
          ) : null}
          {editing ? (
            <FieldDescription>
              Saved credentials are never shown. Re-enter them to replace; they are required on
              every save.
            </FieldDescription>
          ) : null}
          {!parsed.success && draft.name ? (
            <p className="text-sm text-destructive">{parsed.error.issues[0]?.message}</p>
          ) : null}
          {props.error ? <ErrorAlert error={props.error} /> : null}
        </form>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            form="alert-channel-form"
            type="submit"
            disabled={!parsed.success || props.saving}
          >
            {props.saving ? "Saving…" : "Save channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyDraft(): ChannelDraft {
  return {
    name: "",
    type: "slack",
    webhookUrl: "",
    botToken: "",
    chatId: "",
    url: "",
    secret: "",
  };
}

function channelDraft(channel: AlertChannel): ChannelDraft {
  // The API never returns stored config; secret fields start empty by design.
  return { ...emptyDraft(), name: channel.name, type: channel.type };
}

export function channelInput(draft: ChannelDraft): AlertChannelInput {
  if (draft.type === "slack" || draft.type === "discord") {
    return { type: draft.type, name: draft.name, webhookUrl: draft.webhookUrl };
  }
  if (draft.type === "telegram") {
    return { type: "telegram", name: draft.name, botToken: draft.botToken, chatId: draft.chatId };
  }
  return { type: "webhook", name: draft.name, url: draft.url, secret: draft.secret || undefined };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
