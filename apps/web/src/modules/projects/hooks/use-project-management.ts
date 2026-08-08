import type { Project } from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../lib/api";
import type { MemberDirectory, MemberInvitation } from "../types";
import { notify, slugify } from "../utils";
import { useProject } from "./use-project";

export function useProjectManagement() {
  const { projects } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const directory = useQuery({
    queryKey: ["members"],
    queryFn: () => api<MemberDirectory>("/api/v1/members"),
  });
  const [projectName, setProjectNameState] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const setProjectName = (value: string) => {
    setProjectNameState(value);
    setProjectSlug(slugify(value));
  };
  const invalidateDirectory = () => queryClient.invalidateQueries({ queryKey: ["members"] });
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
      await navigate({
        to: "/$projectId",
        params: { projectId: created.id },
        search: { range: "24h" },
      });
      notify("Project created");
    },
  });
  const inviteMember = useMutation({
    mutationFn: () =>
      api<MemberInvitation>("/api/auth/organization/invite-member", {
        method: "POST",
        body: JSON.stringify({
          organizationId: directory.data?.organizationId,
          email: inviteEmail,
          role: inviteRole,
        }),
      }),
    onSuccess: async () => {
      setInviteEmail("");
      await invalidateDirectory();
      notify("Invitation created");
    },
  });
  const updateRole = useMutation({
    mutationFn: (input: { memberId: string; role: "admin" | "member" }) =>
      api<{ id: string; role: string }>(`/api/v1/members/${input.memberId}`, {
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
      api<void>(`/api/v1/members/${memberId}`, { method: "DELETE" }),
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
  const managementError = updateRole.error ?? removeMember.error ?? cancelInvitation.error;

  return {
    cancelInvitation,
    createProject,
    createProjectOpen,
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
