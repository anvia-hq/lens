import type { CostRecalculationsResponse, LlmModel, LlmModelsResponse } from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { notify } from "../../projects/utils";

export type ModelPriceInput = {
  model: string;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number;
};

export function useLlmModels() {
  const queryClient = useQueryClient();
  const models = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => api<LlmModelsResponse>("/api/v1/llm-models"),
  });
  const recalculations = useQuery({
    queryKey: ["cost-recalculations"],
    queryFn: () => api<CostRecalculationsResponse>("/api/v1/llm-models/recalculations"),
    refetchInterval: (query) => (query.state.data?.hasActiveRecalculation === true ? 2_000 : false),
  });
  const invalidateModels = () => queryClient.invalidateQueries({ queryKey: ["llm-models"] });
  const createPrice = useMutation({
    mutationFn: (input: ModelPriceInput) =>
      api<LlmModel>("/api/v1/llm-models", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await invalidateModels();
      notify("Model price configured");
    },
  });
  const updatePrice = useMutation({
    mutationFn: (input: ModelPriceInput & { id: string }) =>
      api<LlmModel>(`/api/v1/llm-models/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          inputPricePerMillion: input.inputPricePerMillion,
          cachedInputPricePerMillion: input.cachedInputPricePerMillion,
          outputPricePerMillion: input.outputPricePerMillion,
        }),
      }),
    onSuccess: async () => {
      await invalidateModels();
      notify("Model price updated");
    },
  });
  const deletePrice = useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/llm-models/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidateModels();
      notify("Model price removed", "info");
    },
  });
  const recalculate = useMutation({
    mutationFn: (range: { from?: string; to?: string }) =>
      api<{ id: string; status: string }>("/api/v1/llm-models/recalculations", {
        method: "POST",
        body: JSON.stringify(range),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cost-recalculations"] });
      notify("Cost recalculation queued");
    },
  });
  return { models, recalculations, createPrice, updatePrice, deletePrice, recalculate };
}

export type LlmModelsState = ReturnType<typeof useLlmModels>;
