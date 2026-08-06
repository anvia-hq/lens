import { createFileRoute } from "@tanstack/react-router";
import { ConnectContent } from "../../modules/projects/components/connect-content";
import { useConnect } from "../../modules/projects/hooks/use-connect";

export const Route = createFileRoute("/$projectId/connect")({ component: ConnectPage });

function ConnectPage() {
  const state = useConnect();
  return <ConnectContent state={state} />;
}
