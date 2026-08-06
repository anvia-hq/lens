import { createFileRoute } from "@tanstack/react-router";
import { OnboardingContent } from "../../modules/projects/components/onboarding-content";
import { useOnboarding } from "../../modules/projects/hooks/use-onboarding";

export const Route = createFileRoute("/$projectId/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const state = useOnboarding();
  return <OnboardingContent state={state} />;
}
