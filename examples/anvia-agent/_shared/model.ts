import type { CompletionModel } from "@anvia/core/completion";
import { OpenAIClient } from "@anvia/openai";

export function createLiveModel(): CompletionModel {
  const completionApi = optionalEnvironment("OPENAI_COMPLETION_API") ?? "chat";
  if (completionApi !== "chat" && completionApi !== "responses") {
    throw new Error("OPENAI_COMPLETION_API must be either 'chat' or 'responses'");
  }

  const baseUrl = optionalEnvironment("OPENAI_BASEURL") ?? optionalEnvironment("OPENAI_BASE_URL");
  const client = new OpenAIClient({
    apiKey: requiredEnvironment("OPENAI_API_KEY"),
    completionApi,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });

  return client.completionModel(requiredEnvironment("OPENAI_MODEL"));
}

function requiredEnvironment(name: string): string {
  const value = optionalEnvironment(name);
  if (value === undefined) {
    throw new Error(`Set ${name} in examples/anvia-agent/.env`);
  }
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}
