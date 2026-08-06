import { Pulse as Activity } from "@solar-icons/react";
import { Outlet } from "@tanstack/react-router";
import { AuthenticatedApp } from "../components/app-shell";
import { FullPageMessage } from "../components/full-page-message";
import { AuthForm } from "../modules/auth/components/auth-form";
import { useAuthForm } from "../modules/auth/hooks/use-auth-form";
import { useAuthSession } from "../modules/auth/hooks/use-auth-session";

export function AppRoot() {
  const session = useAuthSession();
  if (session.isPending) return <FullPageMessage icon={<Activity />} text="Opening Anvia Lens" />;
  if (session.data === null) return <AuthPage />;
  if (window.location.pathname.startsWith("/accept-invitation/")) return <Outlet />;
  return <AuthenticatedApp user={session.data.user} />;
}

function AuthPage() {
  const state = useAuthForm();
  return <AuthForm state={state} />;
}
