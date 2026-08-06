import type { Project } from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../lib/api";
import type { TeamDirectory, TeamInvitation } from "../types";
import { notify, slugify } from "../utils";
import { useProject } from "./use-project";

export function useProjectManagement() {
  const { project, projects, selectProject } = useProject();
  const queryClient = useQueryClient();
  const directory = useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamDirectory>("/api/v1/team"),
  });
  const [projectName, setProjectNameState] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const setProjectName = (value: string) => {
    setProjectNameState(value);
    setProjectSlug(slugify(value));
  };
  const invalidateDirectory = () => queryClient.invalidateQueries({ queryKey: ["team"] });
  const createProject = useMutation({
    mutationFn: () =>
      api<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName, slug: projectSlug }),
      }),
    onSuccess: async (created) => {
      setProjectNameState("");
      setProjectSlug("");
      setCreateProjectOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      selectProject(created.id);
      notify("Project created");
    },
  });
  const deleteProject = useMutation({
    mutationFn: (projectId: string) =>
      api<void>(`/api/v1/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleteProjectId(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      notify("Project deletion queued");
    },
  });
  const inviteMember = useMutation({
    mutationFn: () =>
      api<TeamInvitation>("/api/auth/organization/invite-member", {
        method: "POST",
        body: JSON.stringify({
          organizationId: directory.data?.organizationId,
          email: inviteEmail,
          role: inviteRole,
        }),
      }),
    onSuccess: async () => {
      setInviteEmail("");
      setInviteMemberOpen(false);
      await invalidateDirectory();
      notify("Invitation sent");
    },
  });
  const updateRole = useMutation({
    mutationFn: (input: { memberId: string; role: "admin" | "member" }) =>
      api<{ id: string; role: string }>(`/api/v1/team/members/${input.memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: input.role }),
      }),
    onSuccess: async () => {
      await invalidateDirectory();
      notify("Member role updated");
    },
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api<void>(`/api/v1/team/members/${memberId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoveMemberId(null);
      await invalidateDirectory();
      notify("Member removed");
    },
  });
  const cancelInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      api<unknown>("/api/auth/organization/cancel-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: async () => {
      await invalidateDirectory();
      notify("Invitation canceled", "info");
    },
  });
  const managementError =
    deleteProject.error ?? updateRole.error ?? removeMember.error ?? cancelInvitation.error;

  return {
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
  };
}

export type ProjectManagementState = ReturnType<typeof useProjectManagement>;
