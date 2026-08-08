import { createFileRoute } from "@tanstack/react-router";
import { LlmModelsView } from "../modules/llm-models/components/llm-models-view";
import { useLlmModels } from "../modules/llm-models/hooks/use-llm-models";

export const Route = createFileRoute("/cost-settings")({ component: CostSettingsPage });

function CostSettingsPage() {
  return <LlmModelsView state={useLlmModels()} />;
}
