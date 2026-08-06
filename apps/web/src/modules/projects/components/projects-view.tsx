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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import {
  Layers as Layers3,
  UserPlus as MailPlus,
  AddCircle as Plus,
  TrashBin2 as Trash2,
  UsersGroupRounded as Users,
  CloseCircle as X,
} from "@solar-icons/react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { ProjectManagementState } from "../hooks/use-project-management";
export function ProjectsView({ state }: { state: ProjectManagementState }) {
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
    project,
    projectName,
    projectSlug,
    projects,
    removeMember,
    removeMemberId,
    selectProject,
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
  return (
    <Page
      className="mx-auto max-w-2xl"
      title="Projects"
      description="Choose a project to open its observability dashboard"
    >
      {managementError ? <ErrorAlert error={managementError} /> : null}
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">
            <Layers3 /> Projects
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users /> Team
          </TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Telemetry, settings, and ingestion keys are isolated per project.
              </CardDescription>
              {directory.data?.canManage ? (
                <CardAction>
                  <Button size="sm" onClick={() => setCreateProjectOpen(true)}>
                    <Plus /> Create project
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-2">
              {projects.map((item) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={item.id}>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Layers3 className="size-4" />
                  </span>
                  <button
                    className="grid min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() => selectProject(item.id)}
                  >
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.slug} · {item.state}
                    </span>
                  </button>
                  {item.id === project.id ? <Badge>Current</Badge> : null}
                  {directory.data?.canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setDeleteProjectId(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
              {projects.length === 0 ? (
                <EmptyState
                  icon={<Layers3 />}
                  title="No projects yet"
                  text="Create your first telemetry project."
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                Owners and admins can invite people and update roles.
              </CardDescription>
              {directory.data?.canManage ? (
                <CardAction>
                  <Button size="sm" onClick={() => setInviteMemberOpen(true)}>
                    <MailPlus /> Add member
                  </Button>
                </CardAction>
              ) : null}
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
                        {directory.data?.canManage &&
                        item.role !== "owner" &&
                        !item.isCurrentUser ? (
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
        </TabsContent>
      </Tabs>

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
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Send an invitation to give someone access to the team's projects.
            </DialogDescription>
          </DialogHeader>
          {inviteMember.error ? <ErrorAlert error={inviteMember.error} /> : null}
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
          <DialogFooter showCloseButton>
            <Button form="invite-member-form" type="submit" disabled={inviteMember.isPending}>
              <MailPlus /> Send invitation
            </Button>
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
