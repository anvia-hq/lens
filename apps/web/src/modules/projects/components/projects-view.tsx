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
import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@lens/ui/components/field";
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
import {
  CaretRight as ArrowRight,
  Copy,
  Stack as Layers3,
  UserPlus as MailPlus,
  Plus,
  Trash as Trash2,
  X,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { ProjectManagementState } from "../hooks/use-project-management";
import { notify } from "../utils";

export function ProjectsView({
  state,
  section,
}: {
  state: ProjectManagementState;
  section: "projects" | "members";
}) {
  const {
    cancelInvitation,
    createProject,
    createProjectOpen,
    deleteProject,
    deleteProjectId,
    directory,
    inviteEmail,
    inviteMember,
    inviteMemberOpen,
    inviteRole,
    managementError,
    projectName,
    projectSlug,
    projects,
    removeMember,
    removeMemberId,
    setCreateProjectOpen,
    setDeleteProjectId,
    setInviteEmail,
    setInviteMemberOpen,
    setInviteRole,
    setProjectName,
    setProjectSlug,
    setRemoveMemberId,
    updateRole,
  } = state;
  const invitationUrl = (invitationId: string) =>
    new URL(`/accept-invitation/${invitationId}`, window.location.origin).toString();
  const copyInvitation = async (invitationId: string) => {
    await navigator.clipboard.writeText(invitationUrl(invitationId));
    notify("Invitation link copied");
  };
  return (
    <Page
      action={
        directory.data?.canManage ? (
          section === "projects" ? (
            <Button size="sm" onClick={() => setCreateProjectOpen(true)}>
              <Plus /> Create project
            </Button>
          ) : (
            <Button size="sm" onClick={() => setInviteMemberOpen(true)}>
              <MailPlus /> Add member
            </Button>
          )
        ) : null
      }
      className={section === "projects" ? "mx-auto max-w-6xl" : "mx-auto max-w-5xl"}
      eyebrow="Anvia Lens"
      title={section === "projects" ? "Projects" : "Members"}
      description={
        section === "projects"
          ? "Choose a project to open its observability dashboard"
          : "Manage the people who can access Anvia Lens"
      }
    >
      {managementError ? <ErrorAlert error={managementError} /> : null}
      {section === "projects" ? (
        projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Layers3 className="size-4" />
                    </span>
                    <span className="truncate">{item.name}</span>
                  </CardTitle>
                  <CardDescription className="truncate">{item.slug}</CardDescription>
                  {directory.data?.canManage ? (
                    <CardAction>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${item.name}`}
                        onClick={() => setDeleteProjectId(item.id)}
                      >
                        <Trash2 />
                      </Button>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{item.state}</Badge>
                  <Badge variant="outline">{item.role}</Badge>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <Link
                        to="/$projectId"
                        params={{ projectId: item.id }}
                        search={{ range: "24h" }}
                      />
                    }
                  >
                    Open project <ArrowRight />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Layers3 />}
            title="No projects yet"
            text="Create your first telemetry project."
          />
        )
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Owners and admins can invite people and update roles.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.data?.members.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>{item.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="grid">
                          <span className="font-medium">
                            {item.name}
                            {item.isCurrentUser ? " (you)" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">{item.email}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {directory.data?.canManage && item.role !== "owner" ? (
                        <NativeSelect
                          size="sm"
                          value={item.role}
                          disabled={updateRole.isPending}
                          onChange={(event) =>
                            updateRole.mutate({
                              memberId: item.id,
                              role: event.target.value as "admin" | "member",
                            })
                          }
                        >
                          <NativeSelectOption value="member">Member</NativeSelectOption>
                          <NativeSelectOption value="admin">Admin</NativeSelectOption>
                        </NativeSelect>
                      ) : (
                        <Badge variant="secondary">{item.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {directory.data?.canManage && item.role !== "owner" && !item.isCurrentUser ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => setRemoveMemberId(item.id)}
                        >
                          <X />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {directory.data?.canManage &&
          directory.data.invitations.some((item) => item.status === "pending") ? (
            <CardFooter className="grid gap-2">
              <p className="text-sm font-medium">Pending invitations</p>
              {directory.data.invitations
                .filter((item) => item.status === "pending")
                .map((item) => (
                  <div className="flex w-full items-center gap-3" key={item.id}>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm">{item.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.role ?? "member"} · expires{" "}
                        {new Date(item.expiresAt).toLocaleDateString()}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyInvitation(item.id)}
                    >
                      <Copy /> Copy link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelInvitation.isPending}
                      onClick={() => cancelInvitation.mutate(item.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
            </CardFooter>
          ) : null}
        </Card>
      )}

      <Dialog
        open={createProjectOpen}
        onOpenChange={(open) => {
          setCreateProjectOpen(open);
          if (!open) createProject.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Create an isolated destination for telemetry, settings, and ingestion keys.
            </DialogDescription>
          </DialogHeader>
          {createProject.error ? <ErrorAlert error={createProject.error} /> : null}
          <form
            id="create-project-form"
            onSubmit={(event) => {
              event.preventDefault();
              createProject.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-name">Name</FieldLabel>
                <Input
                  id="project-name"
                  required
                  autoFocus
                  placeholder="Production agents"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-slug">Slug</FieldLabel>
                <Input
                  id="project-slug"
                  required
                  placeholder="production-agents"
                  value={projectSlug}
                  onChange={(event) => setProjectSlug(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter showCloseButton>
            <Button form="create-project-form" type="submit" disabled={createProject.isPending}>
              <Plus /> Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteMemberOpen}
        onOpenChange={(open) => {
          setInviteMemberOpen(open);
          if (!open) inviteMember.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Create a private invitation link to share with the new member.
            </DialogDescription>
          </DialogHeader>
          {inviteMember.error ? <ErrorAlert error={inviteMember.error} /> : null}
          {inviteMember.data ? (
            <Field>
              <FieldLabel htmlFor="invitation-link">Invitation link</FieldLabel>
              <div className="flex gap-2">
                <Input id="invitation-link" readOnly value={invitationUrl(inviteMember.data.id)} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyInvitation(inviteMember.data.id)}
                >
                  <Copy /> Copy
                </Button>
              </div>
            </Field>
          ) : (
            <form
              id="invite-member-form"
              onSubmit={(event) => {
                event.preventDefault();
                inviteMember.mutate();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    required
                    autoFocus
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                  <NativeSelect
                    id="invite-role"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                    className="w-full"
                  >
                    <NativeSelectOption value="member">Member</NativeSelectOption>
                    <NativeSelectOption value="admin">Admin</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </form>
          )}
          <DialogFooter showCloseButton>
            {inviteMember.data ? null : (
              <Button form="invite-member-form" type="submit" disabled={inviteMember.isPending}>
                <MailPlus /> Create invitation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteProjectId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProjectId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              Ingestion stops immediately and the worker permanently removes its traces, keys, and
              settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteProject.isPending}
              onClick={() => {
                if (deleteProjectId) deleteProject.mutate(deleteProjectId);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={removeMemberId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              They will immediately lose access to every project in Anvia Lens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={() => {
                if (removeMemberId) removeMember.mutate(removeMemberId);
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
