import { createFileRoute } from "@tanstack/react-router";
import { PromptDetailView, PromptsView } from "../../modules/observability/components/prompts-view";
import { usePromptDetail, usePrompts } from "../../modules/observability/hooks/use-prompts";
import { validatePromptsSearch } from "../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/prompts")({
  validateSearch: validatePromptsSearch,
  component: PromptsPage,
});

function PromptsPage() {
  const { prompt } = Route.useSearch();
  return prompt ? <PromptDetailPage promptId={prompt} /> : <PromptsListPage />;
}

function PromptDetailPage({ promptId }: { promptId: string }) {
  return <PromptDetailView state={usePromptDetail(promptId)} />;
}

function PromptsListPage() {
  return <PromptsView state={usePrompts()} />;
}
