import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$projectId/sessions/$sessionId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$projectId/threads/$sessionId",
      params: { projectId: params.projectId, sessionId: params.sessionId },
      replace: true,
    });
  },
});
