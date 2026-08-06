import { Pulse as Activity } from "@phosphor-icons/react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthenticatedApp } from "../components/app-shell";
import { FullPageMessage } from "../components/full-page-message";
import { AuthForm } from "../modules/auth/components/auth-form";
import { useAuthForm } from "../modules/auth/hooks/use-auth-form";
import { useAuthSession } from "../modules/auth/hooks/use-auth-session";

export const Route = createRootRoute({ component: AppRoot });

function AppRoot() {
  const session = useAuthSession();
  if (window.location.pathname.startsWith("/accept-invitation/")) return <Outlet />;
  if (session.isPending) return <FullPageMessage icon={<Activity />} text="Opening Anvia Lens" />;
  if (session.data === null) return <AuthPage />;
  return <AuthenticatedApp user={session.data.user} />;
}

function AuthPage() {
  const state = useAuthForm();
  if (state.setup.isLoading)
    return <FullPageMessage icon={<Activity />} text="Checking Anvia Lens setup" />;
  if (state.setup.isError)
    return <FullPageMessage icon={<Activity />} text="Unable to check Anvia Lens setup" />;
  return <AuthForm state={state} />;
}
