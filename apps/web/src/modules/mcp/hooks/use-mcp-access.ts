import type { CreatedMcpToken, McpToken } from "@lens/contracts";
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../lib/api";
import { useProject } from "../../projects/hooks/use-project";
import { notify } from "../../projects/utils";

export function useMcpAccess() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const [newMcpToken, setNewMcpToken] = useState<CreatedMcpToken | null>(null);
  const [mcpTokenName, setMcpTokenName] = useState("AI assistant");
  const [mcpExpiryDays, setMcpExpiryDays] = useState("never");
  const [allowRawPayloads, setAllowRawPayloads] = useState(false);
  const canManage = project.role === "owner" || project.role === "admin";
  const mcpTokens = useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: () => api<{ items: McpToken[] }>("/api/v1/mcp-tokens"),
    enabled: canManage,
  });
  const createMcpToken = useMutation({
    mutationFn: () => {
      const expiresAt =
        mcpExpiryDays === "never"
          ? null
          : new Date(Date.now() + Number(mcpExpiryDays) * 86_400_000).toISOString();
      return api<CreatedMcpToken>("/api/v1/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name: mcpTokenName, expiresAt, allowRawPayloads }),
      });
    },
    onSuccess: (result) => {
      setNewMcpToken(result);
      setAllowRawPayloads(false);
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
      notify("MCP token created");
    },
  });
  const revokeMcpToken = useMutation({
    mutationFn: (tokenId: string) =>
      api<void>(`/api/v1/mcp-tokens/${tokenId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
      notify("MCP token revoked");
    },
  });
  return {
    allowRawPayloads,
    canManage,
    createMcpToken,
    mcpExpiryDays,
    mcpTokenName,
    mcpTokens,
    newMcpToken,
    revokeMcpToken,
    setAllowRawPayloads,
    setMcpExpiryDays,
    setMcpTokenName,
    setNewMcpToken,
  };
}

export type McpAccessState = {
  allowRawPayloads: boolean;
  canManage: boolean;
  createMcpToken: UseMutationResult<CreatedMcpToken, Error, void>;
  mcpExpiryDays: string;
  mcpTokenName: string;
  mcpTokens: UseQueryResult<{ items: McpToken[] }, Error>;
  newMcpToken: CreatedMcpToken | null;
  revokeMcpToken: UseMutationResult<void, Error, string>;
  setAllowRawPayloads: (value: boolean) => void;
  setMcpExpiryDays: (value: string) => void;
  setMcpTokenName: (value: string) => void;
  setNewMcpToken: (value: CreatedMcpToken | null) => void;
};
