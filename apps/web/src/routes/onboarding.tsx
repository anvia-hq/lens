import { OnboardingContent } from "../modules/projects/components/onboarding-content";
import { useOnboarding } from "../modules/projects/hooks/use-onboarding";

export function OnboardingPage() {
  const state = useOnboarding();
  return <OnboardingContent state={state} />;
}
