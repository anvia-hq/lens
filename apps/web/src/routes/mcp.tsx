import { createFileRoute } from "@tanstack/react-router";
import { McpAccessView } from "../modules/mcp/components/mcp-access-view";
import { useMcpAccess } from "../modules/mcp/hooks/use-mcp-access";

export const Route = createFileRoute("/mcp")({ component: McpAccessPage });

function McpAccessPage() {
  return <McpAccessView state={useMcpAccess()} />;
}
