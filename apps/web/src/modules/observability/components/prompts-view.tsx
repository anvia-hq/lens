import {
  type ChatMessage,
  type ChatMessageRole,
  chatMessageRoles,
  type PromptDetail,
  type PromptInput,
  type PromptType,
  type PromptVersion,
  type PromptVersionCommit,
  promptInputSchema,
  promptVersionCommitSchema,
} from "@lens/contracts";
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
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Textarea } from "@lens/ui/components/textarea";
import {
  Archive,
  ArrowLeft,
  ChatText,
  PencilSimple,
  Plus,
  MagnifyingGlass as Search,
  Trash,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { FullPageMessage } from "../../../components/full-page-message";
import type { PromptDetailState, PromptsState } from "../hooks/use-prompts";
import { formatTimestamp } from "../utils/trace-detail";

export function PromptsView({ state }: { state: PromptsState }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  if (state.prompts.isLoading)
    return <FullPageMessage icon={<ChatText />} text="Loading prompts" contained />;
  if (state.prompts.error || !state.prompts.data)
    return <FullPageMessage icon={<ChatText />} text="Unable to load prompts" contained />;
  const error = state.createPrompt.error;
  const normalizedSearch = searchDraft.trim().toLocaleLowerCase();
  const archived = state.search.archived;
  const prompts = state.prompts.data.items.filter((prompt) =>
    archived ? prompt.archivedAt !== null : prompt.archivedAt === null,
  );
  const visible = normalizedSearch
    ? prompts.filter((prompt) =>
        `${prompt.name} ${prompt.description ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
      )
    : prompts;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:py-0">
        <div className="relative h-8 min-w-52 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            aria-label="Search prompts"
            placeholder="Search prompts"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={!archived ? "default" : "outline"}
            onClick={() => state.setSearch({ archived: false })}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={archived ? "default" : "outline"}
            onClick={() => state.setSearch({ archived: true })}
          >
            Archived
          </Button>
        </div>
        {canManage && !archived ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Create prompt
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        {error ? (
          <div className="p-4">
            <ErrorAlert error={error} />
          </div>
        ) : null}
        {visible.length ? (
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="pl-4">Prompt</TableHead>
                <TableHead>Labels</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead>Versions</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((prompt) => (
                <TableRow
                  key={prompt.id}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  tabIndex={0}
                  onClick={() => state.openPrompt(prompt.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    state.openPrompt(prompt.id);
                  }}
                >
                  <TableCell className="pl-4 font-medium">{prompt.name}</TableCell>
                  <TableCell>
                    {prompt.labels.length ? (
                      <span className="flex flex-wrap gap-1">
                        {prompt.labels.map((label) => (
                          <Badge key={label.label} variant={labelVariant(label.label)}>
                            {label.label} · v{label.version}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>v{prompt.latestVersion}</TableCell>
                  <TableCell>{prompt.versionCount}</TableCell>
                  <TableCell className="pr-4">{formatTimestamp(prompt.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<ChatText />}
            title={
              normalizedSearch
                ? "No matching prompts"
                : archived
                  ? "No archived prompts"
                  : "No prompts"
            }
            text={
              normalizedSearch
                ? "Try another search."
                : archived
                  ? "Archived prompts no longer appear in the active list."
                  : "Create a prompt, commit versions, and move labels like production to deploy them."
            }
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
        <span>
          {visible.length} prompt{visible.length === 1 ? "" : "s"}
        </span>
        {normalizedSearch ? <span>{prompts.length} total</span> : null}
      </div>

      <CreatePromptDialog
        open={createOpen}
        error={state.createPrompt.error}
        onClose={() => setCreateOpen(false)}
        onSave={(input) =>
          state.createPrompt.mutate(input, { onSuccess: () => setCreateOpen(false) })
        }
      />
    </main>
  );
}

export function PromptDetailView({ state }: { state: PromptDetailState }) {
  const [versionOpen, setVersionOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [moveLabel, setMoveLabel] = useState<string | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  if (state.detail.isLoading)
    return <FullPageMessage icon={<ChatText />} text="Loading prompt" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<ChatText />} text="Prompt not found" contained />;
  const prompt = state.detail.data;
  const versions = [...prompt.versions].sort((left, right) => right.version - left.version);
  const error =
    state.commitVersion.error ??
    state.setLabel.error ??
    state.updateDescription.error ??
    state.archivePrompt.error ??
    state.history.error;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              render={
                <Link
                  to="/$projectId/prompts"
                  params={{ projectId: state.project.id }}
                  search={{ archived: false }}
                />
              }
            >
              <ArrowLeft />
              <span className="sr-only">Back to prompts</span>
            </Button>
            <div className="grid min-w-0 gap-1">
              <h1 className="text-lg font-semibold tracking-tight">{prompt.name}</h1>
              <p className="text-xs text-muted-foreground">
                {prompt.description ?? "No description"}
              </p>
            </div>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDescriptionOpen(true)}>
                <PencilSimple /> Edit description
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVersionOpen(true)}>
                <Plus /> New version
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm(`Archive ${prompt.name}?`)) state.archivePrompt.mutate();
                }}
              >
                <Archive /> Archive
              </Button>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-10">
          {prompt.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
          {prompt.labels.map((label) => (
            <Badge key={label.label} variant={labelVariant(label.label)}>
              {label.label} · v{label.version}
            </Badge>
          ))}
        </div>
      </header>
      {error ? (
        <div className="border-b p-4">
          <ErrorAlert error={error} />
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {versions.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Version</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Change message</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead className="pr-4">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.version}>
                  <TableCell className="pl-4 font-medium">v{version.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{version.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-sm truncate">
                    {version.type === "chat"
                      ? `${version.messages?.length ?? 0} messages`
                      : excerpt(version.template)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {version.changeMessage ?? "—"}
                  </TableCell>
                  <TableCell>{version.createdBy}</TableCell>
                  <TableCell className="pr-4">{formatTimestamp(version.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-4 py-8 text-sm text-muted-foreground">
            This prompt has no versions.
          </div>
        )}
        <div className="border-t p-4">
          <h3 className="mb-3 text-sm font-semibold">Labels</h3>
          {prompt.labels.length ? (
            <div className="grid gap-2">
              {prompt.labels.map((label) => (
                <div key={label.label} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={labelVariant(label.label)}>{label.label}</Badge>
                  <span>→ v{label.version}</span>
                  <span className="text-muted-foreground">
                    updated by {label.updatedBy} · {formatTimestamp(label.updatedAt)}
                  </span>
                  {canManage ? (
                    <Button size="sm" variant="ghost" onClick={() => setMoveLabel(label.label)}>
                      Move
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No labels point at this prompt yet.</p>
          )}
        </div>
        <div className="border-t p-4">
          <h3 className="mb-3 text-sm font-semibold">Deployment history</h3>
          {state.history.data?.items.length ? (
            <div className="grid gap-2">
              {[...state.history.data.items]
                .sort(
                  (left, right) =>
                    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
                )
                .map((event) => (
                  <div key={event.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={labelVariant(event.label)}>{event.label}</Badge>
                    <span>
                      v{event.fromVersion ?? "—"} → v{event.toVersion}
                    </span>
                    <span className="text-muted-foreground">
                      by {event.changedBy} · {formatTimestamp(event.createdAt)}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No label changes yet.</p>
          )}
        </div>
      </ScrollArea>
      <CommitVersionDialog
        open={versionOpen}
        prompt={prompt}
        error={state.commitVersion.error}
        onClose={() => setVersionOpen(false)}
        onSave={(input) =>
          state.commitVersion.mutate(input, { onSuccess: () => setVersionOpen(false) })
        }
      />
      <EditDescriptionDialog
        open={descriptionOpen}
        description={prompt.description ?? ""}
        error={state.updateDescription.error}
        onClose={() => setDescriptionOpen(false)}
        onSave={(description) =>
          state.updateDescription.mutate(description, {
            onSuccess: () => setDescriptionOpen(false),
          })
        }
      />
      <MoveLabelDialog
        label={moveLabel}
        versions={versions}
        error={state.setLabel.error}
        onClose={() => setMoveLabel(null)}
        onSave={(version) => {
          if (!moveLabel) return;
          state.setLabel.mutate(
            { label: moveLabel, version },
            { onSuccess: () => setMoveLabel(null) },
          );
        }}
      />
    </main>
  );
}

type MessageRow = { rowId: number; message: ChatMessage };

let messageRowSequence = 0;

function nextMessageRowId(): number {
  messageRowSequence += 1;
  return messageRowSequence;
}

function toMessageRows(messages: ChatMessage[]): MessageRow[] {
  return messages.map((message) => ({ rowId: nextMessageRowId(), message }));
}

function fromMessageRows(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => row.message);
}

function PromptContentFields(props: {
  type: PromptType;
  template: string;
  messages: MessageRow[];
  config: string;
  onConfigChange: (config: string) => void;
  onTypeChange: (type: PromptType) => void;
  onTemplateChange: (template: string) => void;
  onMessagesChange: (messages: MessageRow[]) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <NativeSelect
          aria-label="Type"
          value={props.type}
          onChange={(event) => props.onTypeChange(event.target.value as PromptType)}
        >
          <NativeSelectOption value="text">Text template</NativeSelectOption>
          <NativeSelectOption value="chat">Chat messages</NativeSelectOption>
        </NativeSelect>
      </Field>
      {props.type === "text" ? (
        <Field>
          <FieldLabel>Template</FieldLabel>
          <Textarea
            aria-label="Template"
            rows={6}
            value={props.template}
            onChange={(event) => props.onTemplateChange(event.target.value)}
            placeholder="Answer the question: {{question}}"
          />
        </Field>
      ) : (
        <div className="grid gap-2">
          <FieldLabel>Messages</FieldLabel>
          {props.messages.map((row, index) => {
            const position = index + 1;
            return (
              <div key={row.rowId} className="flex items-start gap-2">
                <NativeSelect
                  aria-label={`Role for message ${position}`}
                  value={row.message.role}
                  onChange={(event) =>
                    props.onMessagesChange(
                      props.messages.map((item) =>
                        item.rowId === row.rowId
                          ? {
                              ...item,
                              message: {
                                ...item.message,
                                role: event.target.value as ChatMessageRole,
                              },
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {chatMessageRoles.map((role) => (
                    <NativeSelectOption key={role} value={role}>
                      {role}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Textarea
                  rows={2}
                  aria-label={`Content for message ${position}`}
                  value={row.message.content}
                  onChange={(event) =>
                    props.onMessagesChange(
                      props.messages.map((item) =>
                        item.rowId === row.rowId
                          ? { ...item, message: { ...item.message, content: event.target.value } }
                          : item,
                      ),
                    )
                  }
                  placeholder="Message content"
                />
                <Button
                  aria-label={`Remove message ${position}`}
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.messages.length === 1}
                  onClick={() =>
                    props.onMessagesChange(
                      props.messages.filter((item) => item.rowId !== row.rowId),
                    )
                  }
                >
                  <Trash />
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                props.onMessagesChange([
                  ...props.messages,
                  { rowId: nextMessageRowId(), message: { role: "user", content: "" } },
                ])
              }
            >
              <Plus /> Add message
            </Button>
          </div>
        </div>
      )}
      <Field>
        <FieldLabel>Config (JSON object)</FieldLabel>
        <Textarea
          aria-label="Config (JSON object)"
          rows={5}
          value={props.config}
          onChange={(event) => props.onConfigChange(event.target.value)}
          placeholder={'{"model": "gpt-4.1", "temperature": 0.7}'}
        />
      </Field>
    </>
  );
}

function CreatePromptDialog(props: {
  open: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (input: PromptInput) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PromptType>("text");
  const [template, setTemplate] = useState("");
  const [config, setConfig] = useState("{}");
  const [messages, setMessages] = useState<MessageRow[]>(() =>
    toMessageRows([{ role: "system", content: "" }]),
  );
  const [changeMessage, setChangeMessage] = useState("");
  const [labels, setLabels] = useState("");
  const [parseError, setParseError] = useState<string>();
  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
    setType("text");
    setTemplate("");
    setConfig("{}");
    setMessages(toMessageRows([{ role: "system", content: "" }]));
    setChangeMessage("");
    setLabels("");
    setParseError(undefined);
  }, [props.open]);
  const save = () => {
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(config);
    } catch {
      setParseError("Config must be a valid JSON object");
      return;
    }
    const candidate: Record<string, unknown> = {
      name: name.trim(),
      content:
        type === "text"
          ? { type, template, config: parsedConfig }
          : {
              type,
              config: parsedConfig,
              messages: fromMessageRows(messages.filter((row) => row.message.content.trim())),
            },
    };
    if (description.trim()) candidate.description = description.trim();
    if (changeMessage.trim()) candidate.changeMessage = changeMessage.trim();
    const labelItems = labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    if (labelItems.length) candidate.labels = labelItems;
    const parsed = promptInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setParseError(parsed.error.issues[0]?.message ?? "Invalid prompt");
      return;
    }
    setParseError(undefined);
    props.onSave(parsed.data);
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create prompt</DialogTitle>
          <DialogDescription>Lens will commit this content as version 1.</DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto p-1">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              aria-label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Description (optional)</FieldLabel>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <PromptContentFields
            type={type}
            template={template}
            config={config}
            onConfigChange={setConfig}
            messages={messages}
            onTypeChange={setType}
            onTemplateChange={setTemplate}
            onMessagesChange={setMessages}
          />
          <Field>
            <FieldLabel>Change message (optional)</FieldLabel>
            <Input
              value={changeMessage}
              onChange={(event) => setChangeMessage(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Labels (optional, comma-separated)</FieldLabel>
            <Input
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="production, staging"
            />
          </Field>
        </div>
        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
        <DialogFooter showCloseButton>
          <Button disabled={!name.trim()} onClick={save}>
            Create prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitVersionDialog(props: {
  open: boolean;
  prompt: PromptDetail;
  error: unknown;
  onClose: () => void;
  onSave: (input: PromptVersionCommit) => void;
}) {
  const [type, setType] = useState<PromptType>("text");
  const [template, setTemplate] = useState("");
  const [config, setConfig] = useState("{}");
  const initializedPrompt = useRef<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>(() =>
    toMessageRows([{ role: "system", content: "" }]),
  );
  const [changeMessage, setChangeMessage] = useState("");
  const [parseError, setParseError] = useState<string>();
  useEffect(() => {
    if (!props.open) {
      initializedPrompt.current = null;
      return;
    }
    if (initializedPrompt.current === props.prompt.id) return;
    initializedPrompt.current = props.prompt.id;
    const latest = [...props.prompt.versions].sort(
      (left, right) => right.version - left.version,
    )[0];
    setType(latest?.type ?? "text");
    setTemplate(latest?.template ?? "");
    setConfig(JSON.stringify(latest?.config ?? {}, null, 2));
    setMessages(toMessageRows(latest?.messages ?? [{ role: "system", content: "" }]));
    setChangeMessage("");
    setParseError(undefined);
  }, [props.open, props.prompt]);
  const save = () => {
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(config);
    } catch {
      setParseError("Config must be a valid JSON object");
      return;
    }
    const candidate: Record<string, unknown> =
      type === "text"
        ? { type, template, config: parsedConfig }
        : {
            type,
            messages: fromMessageRows(messages.filter((row) => row.message.content.trim())),
            config: parsedConfig,
          };
    if (changeMessage.trim()) candidate.changeMessage = changeMessage.trim();
    const parsed = promptVersionCommitSchema.safeParse(candidate);
    if (!parsed.success) {
      setParseError(parsed.error.issues[0]?.message ?? "Invalid version");
      return;
    }
    setParseError(undefined);
    props.onSave(parsed.data);
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Commit new version</DialogTitle>
          <DialogDescription>
            Content is committed as an immutable version and existing labels stay in place.
          </DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto p-1">
          <PromptContentFields
            type={type}
            template={template}
            config={config}
            onConfigChange={setConfig}
            messages={messages}
            onTypeChange={setType}
            onTemplateChange={setTemplate}
            onMessagesChange={setMessages}
          />
          <Field>
            <FieldLabel>Change message (optional)</FieldLabel>
            <Input
              value={changeMessage}
              onChange={(event) => setChangeMessage(event.target.value)}
            />
          </Field>
        </div>
        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
        <DialogFooter showCloseButton>
          <Button onClick={save}>Commit version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDescriptionDialog(props: {
  open: boolean;
  description: string;
  error: unknown;
  onClose: () => void;
  onSave: (description: string) => void;
}) {
  const [description, setDescription] = useState(props.description);
  useEffect(() => {
    if (props.open) setDescription(props.description);
  }, [props.open, props.description]);
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit description</DialogTitle>
          <DialogDescription>Versions and labels are not affected.</DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <DialogFooter showCloseButton>
          <Button onClick={() => props.onSave(description.trim())}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveLabelDialog(props: {
  label: string | null;
  versions: PromptVersion[];
  error: unknown;
  onClose: () => void;
  onSave: (version: number) => void;
}) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (props.label !== null) setVersion("");
  }, [props.label]);
  return (
    <Dialog open={props.label !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {props.label ?? "label"}</DialogTitle>
          <DialogDescription>Point this label at an existing version.</DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <Field>
          <FieldLabel>Version</FieldLabel>
          <NativeSelect value={version} onChange={(event) => setVersion(event.target.value)}>
            <NativeSelectOption value="">Select a version</NativeSelectOption>
            {props.versions.map((item) => (
              <NativeSelectOption key={item.version} value={String(item.version)}>
                v{item.version}
                {item.changeMessage ? ` · ${item.changeMessage}` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter showCloseButton>
          <Button disabled={!version} onClick={() => props.onSave(Number(version))}>
            Move label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelVariant(label: string): "default" | "secondary" | "outline" {
  if (label === "production") return "default";
  if (label === "staging") return "secondary";
  return "outline";
}
function excerpt(value: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}
