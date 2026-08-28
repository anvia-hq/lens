export function formatEvaluationSource(source: string, detailed = false): string {
  if (source === "end_user") return "End-user feedback";
  if (source === "human") return detailed ? "Human review" : "Human";
  if (source === "telemetry") return "Telemetry";
  return source;
}
