import { createHash } from "node:crypto";
import type { JsonValue, NormalizedSpan, ObservationKind, SpanStatus } from "@lens/contracts";

const TRACE_COUNT = 64;

type Scenario = {
  traceName: string;
  serviceName: string;
  agentName: string;
  team: string;
  prompt: string;
  resolution: string;
  knowledgeQuery: string;
  knowledgeResult: string;
  channel: string;
};

const scenarios: Scenario[] = [
  {
    traceName: "Resolve delayed shipment",
    serviceName: "customer-support-agent",
    agentName: "Support Concierge",
    team: "support",
    prompt: "My order was due yesterday but tracking has not moved. Can you check it?",
    resolution:
      "The parcel is delayed at the regional hub. I shared the updated delivery window and applied a shipping credit.",
    knowledgeQuery: "late shipment policy and shipping credit eligibility",
    knowledgeResult: "Orders delayed more than 24 hours qualify for a shipping credit up to $15.",
    channel: "web-chat",
  },
  {
    traceName: "Review refund eligibility",
    serviceName: "customer-support-agent",
    agentName: "Support Concierge",
    team: "support",
    prompt: "The headphones arrived damaged. I would like a refund instead of a replacement.",
    resolution:
      "The order is inside the return window. I created a prepaid return and confirmed the refund timeline.",
    knowledgeQuery: "damaged item refund policy electronics",
    knowledgeResult:
      "Damaged electronics may be refunded within 30 days with a prepaid return label.",
    channel: "email",
  },
  {
    traceName: "Recover customer account",
    serviceName: "identity-assistant",
    agentName: "Account Recovery Agent",
    team: "trust-safety",
    prompt: "I changed phones and cannot access my authenticator codes anymore.",
    resolution:
      "I verified the recovery signals and sent a time-limited identity verification link.",
    knowledgeQuery: "lost authenticator secure account recovery procedure",
    knowledgeResult:
      "Require two verified recovery signals before issuing a 15-minute recovery link.",
    channel: "web-chat",
  },
  {
    traceName: "Explain invoice variance",
    serviceName: "billing-copilot",
    agentName: "Billing Analyst",
    team: "finance",
    prompt: "Why is our August invoice higher even though our seat count stayed the same?",
    resolution:
      "Usage overages increased by 18%. I summarized the affected services and linked the detailed usage report.",
    knowledgeQuery: "usage overage invoice calculation enterprise plan",
    knowledgeResult:
      "Enterprise overages are calculated daily and aggregated by billable service at month end.",
    channel: "dashboard",
  },
  {
    traceName: "Triage checkout incident",
    serviceName: "incident-response-agent",
    agentName: "Incident Commander",
    team: "platform",
    prompt: "Checkout error rate crossed 8% in eu-west-1 after the latest deployment.",
    resolution:
      "The payment adapter rollout correlates with the regression. I prepared a rollback and paged the owning team.",
    knowledgeQuery: "checkout payment adapter rollback runbook eu-west-1",
    knowledgeResult:
      "Rollback payment-adapter independently, verify queue drain, then monitor the five-minute error window.",
    channel: "slack",
  },
  {
    traceName: "Qualify enterprise lead",
    serviceName: "sales-research-agent",
    agentName: "Account Researcher",
    team: "revenue",
    prompt: "Prepare a concise brief for the discovery call with Northwind Logistics.",
    resolution:
      "I prepared the company brief, likely pain points, stakeholder map, and five discovery questions.",
    knowledgeQuery: "Northwind Logistics recent initiatives and technology footprint",
    knowledgeResult:
      "Northwind is consolidating regional systems and has publicly prioritized shipment visibility.",
    channel: "crm",
  },
  {
    traceName: "Summarize product feedback",
    serviceName: "product-insights-agent",
    agentName: "Feedback Synthesizer",
    team: "product",
    prompt: "Summarize the recurring themes from this week's onboarding feedback.",
    resolution:
      "The main themes are unclear API-key placement, missing sample data, and confusion around environment selection.",
    knowledgeQuery: "onboarding feedback last seven days recurring themes",
    knowledgeResult:
      "42 responses mention setup friction; API keys and empty-state guidance are the most frequent topics.",
    channel: "dashboard",
  },
  {
    traceName: "Investigate suspicious login",
    serviceName: "risk-review-agent",
    agentName: "Risk Investigator",
    team: "trust-safety",
    prompt: "Review the high-risk login for customer C-1842 and recommend an action.",
    resolution:
      "The device and travel signals conflict with prior activity. I recommended a temporary challenge instead of a lockout.",
    knowledgeQuery: "adaptive authentication travel anomaly decision policy",
    knowledgeResult:
      "Use a step-up challenge when device risk is high but credential-compromise signals are inconclusive.",
    channel: "risk-queue",
  },
];

const models = ["gpt-4.1-mini", "gpt-4.1", "claude-sonnet-4", "gemini-2.5-flash"];
const customerIds = ["usr_01HZA6Q4", "usr_01J2KF7P", "usr_01J8C9TX", "usr_01JB5MNR"];

export type SeedTelemetry = {
  spans: NormalizedSpan[];
  traceIds: string[];
};

export function buildSeedTelemetry(projectId: string, now = new Date()): SeedTelemetry {
  const spans: NormalizedSpan[] = [];
  const traceIds: string[] = [];
  const ingestedAt = now.toISOString();

  for (let index = 0; index < TRACE_COUNT; index += 1) {
    const scenario = scenarios[index % scenarios.length] as Scenario;
    const traceId = stableHex(`trace:${index}`, 32);
    const rootSpanId = stableHex(`trace:${index}:root`, 16);
    const model = models[index % models.length] as string;
    const userId = customerIds[index % customerIds.length] as string;
    const sessionId = `ses_${stableHex(`session:${Math.floor(index / 3)}`, 12)}`;
    const ticketId = `${scenario.team.toUpperCase().slice(0, 3)}-${1842 + index}`;
    const ageMinutes = 18 + (TRACE_COUNT - index - 1) * 21;
    const startMs = now.getTime() - ageMinutes * 60_000;
    const totalMs = integer(`duration:${index}`, 1_900, 8_400);
    const failed = index % 9 === 4;
    const inputTokens = integer(`input:${index}`, 620, 4_800);
    const outputTokens = integer(`output:${index}`, 110, 980);
    const tags = [
      "production",
      scenario.team,
      scenario.channel,
      index % 5 === 0 ? "priority" : "standard",
    ];
    const expiresAt = new Date(startMs + 30 * 86_400_000).toISOString();
    const base = {
      projectId,
      traceId,
      traceState: "",
      kind: 1,
      statusMessage: "",
      serviceName: scenario.serviceName,
      scopeName: "@anvia/observability-otel",
      scopeVersion: "0.1.0",
      resourceAttributes: {
        "service.name": scenario.serviceName,
        "service.version": `2026.08.${1 + (index % 4)}`,
        "deployment.environment.name": "production",
        "cloud.region": index % 3 === 0 ? "ap-southeast-1" : "us-east-1",
      },
      links: [] as JsonValue[],
      traceName: scenario.traceName,
      userId,
      sessionId,
      tags,
      version: "2026-08",
      expiresAt,
      ingestedAt,
      ingestVersion: String(BigInt(now.getTime()) * 1_000_000n + BigInt(index)),
    };

    const addSpan = (args: {
      key: string;
      parentSpanId: string | null;
      name: string;
      observationKind: ObservationKind;
      from: number;
      to: number;
      status?: SpanStatus;
      statusMessage?: string;
      attributes: Record<string, JsonValue>;
      events?: JsonValue[];
      model?: string | null;
      inputTokens?: number;
      outputTokens?: number;
      input?: JsonValue | null;
      output?: JsonValue | null;
    }) => {
      const spanStartMs = startMs + Math.round(totalMs * args.from);
      const spanEndMs = startMs + Math.round(totalMs * args.to);
      spans.push({
        ...base,
        spanId: args.key === "root" ? rootSpanId : stableHex(`trace:${index}:${args.key}`, 16),
        parentSpanId: args.parentSpanId,
        name: args.name,
        observationKind: args.observationKind,
        status: args.status ?? "ok",
        statusMessage: args.statusMessage ?? "",
        startTimeUnixNano: toNano(spanStartMs),
        endTimeUnixNano: toNano(spanEndMs),
        durationNano: String(BigInt(spanEndMs - spanStartMs) * 1_000_000n),
        spanAttributes: args.attributes,
        events: args.events ?? [],
        model: args.model ?? null,
        inputTokens: args.inputTokens ?? 0,
        outputTokens: args.outputTokens ?? 0,
        totalTokens: (args.inputTokens ?? 0) + (args.outputTokens ?? 0),
        input: args.input ?? null,
        output: args.output ?? null,
      });
    };

    addSpan({
      key: "root",
      parentSpanId: null,
      name: `agent ${scenario.agentName}`,
      observationKind: "agent",
      from: 0,
      to: 1,
      status: failed ? "error" : "ok",
      statusMessage: failed ? "A required policy service was unavailable" : "",
      attributes: {
        "anvia.agent.name": scenario.agentName,
        "anvia.agent.description": `Production ${scenario.team} workflow agent`,
        "anvia.run.max_turns": 6,
        "anvia.trace.name": scenario.traceName,
        "anvia.trace.user_id": userId,
        "anvia.trace.session_id": sessionId,
        "anvia.trace.tags": tags,
        "anvia.trace.metadata.ticket_id": ticketId,
        "anvia.trace.metadata.channel": scenario.channel,
      },
      input: { message: scenario.prompt, ticketId, channel: scenario.channel },
      output: failed
        ? { status: "escalated", reason: "policy service unavailable" }
        : { message: scenario.resolution },
    });
    addSpan({
      key: "profile",
      parentSpanId: rootSpanId,
      name: "tool get_customer_context",
      observationKind: "tool",
      from: 0.03,
      to: 0.11,
      attributes: {
        "anvia.tool.name": "get_customer_context",
        "anvia.tool.turn": 1,
        "anvia.tool.call_id": `call_${stableHex(`profile:${index}`, 10)}`,
      },
      input: { userId },
      output: { plan: index % 4 === 0 ? "enterprise" : "pro", tenureMonths: 8 + (index % 47) },
    });
    addSpan({
      key: "classify",
      parentSpanId: rootSpanId,
      name: `generation ${model}`,
      observationKind: "generation",
      from: 0.07,
      to: 0.21,
      attributes: generationAttributes(model, 1, Math.round(inputTokens * 0.18), 42),
      model,
      inputTokens: Math.round(inputTokens * 0.18),
      outputTokens: 42,
      input: [{ role: "user", content: scenario.prompt }],
      output: {
        intent: scenario.traceName,
        confidence: Number(decimal(`confidence:${index}`, 0.86, 0.99).toFixed(2)),
      },
    });
    addSpan({
      key: "knowledge",
      parentSpanId: rootSpanId,
      name: "tool search_knowledge_base",
      observationKind: "tool",
      from: 0.23,
      to: 0.43,
      attributes: {
        "anvia.tool.name": "search_knowledge_base",
        "anvia.tool.turn": 2,
        "anvia.tool.call_id": `call_${stableHex(`knowledge:${index}`, 10)}`,
        "db.system": "pgvector",
        "db.operation.name": "vector_search",
      },
      input: { query: scenario.knowledgeQuery, topK: 5 },
      output: { matches: 5, topResult: scenario.knowledgeResult, score: 0.93 },
    });
    addSpan({
      key: "draft",
      parentSpanId: rootSpanId,
      name: `generation ${model}`,
      observationKind: "generation",
      from: 0.44,
      to: 0.68,
      attributes: generationAttributes(
        model,
        2,
        Math.round(inputTokens * 0.37),
        Math.round(outputTokens * 0.38),
      ),
      model,
      inputTokens: Math.round(inputTokens * 0.37),
      outputTokens: Math.round(outputTokens * 0.38),
      input: { prompt: scenario.prompt, context: scenario.knowledgeResult },
      output: { draft: scenario.resolution, citations: ["kb://policy/current"] },
    });
    addSpan({
      key: "policy",
      parentSpanId: rootSpanId,
      name: "tool validate_policy",
      observationKind: "tool",
      from: 0.69,
      to: 0.78,
      status: failed ? "error" : "ok",
      statusMessage: failed ? "policy-service request timed out after 2,000ms" : "",
      attributes: {
        "anvia.tool.name": "validate_policy",
        "anvia.tool.turn": 3,
        "anvia.tool.call_id": `call_${stableHex(`policy:${index}`, 10)}`,
        "server.address": "policy-service.internal",
      },
      events: failed
        ? [
            {
              name: "exception",
              attributes: {
                "exception.type": "TimeoutError",
                "exception.message": "Policy service did not respond",
              },
            },
          ]
        : [],
      input: { action: scenario.resolution, policyVersion: "2026-07" },
      output: failed ? { allowed: false, retryable: true } : { allowed: true, checks: 6 },
    });
    addSpan({
      key: "response",
      parentSpanId: rootSpanId,
      name: `generation ${model}`,
      observationKind: "generation",
      from: 0.8,
      to: 0.97,
      status: failed ? "error" : "ok",
      statusMessage: failed ? "Response generation stopped after policy validation failure" : "",
      attributes: generationAttributes(
        model,
        3,
        Math.round(inputTokens * 0.45),
        Math.round(outputTokens * 0.62),
      ),
      model,
      inputTokens: Math.round(inputTokens * 0.45),
      outputTokens: Math.round(outputTokens * 0.62),
      input: { draft: scenario.resolution, tone: "clear and empathetic" },
      output: failed
        ? { action: "handoff_to_human", ticketId }
        : { message: scenario.resolution, channel: scenario.channel },
    });

    traceIds.push(traceId);
  }

  return { spans, traceIds };
}

function generationAttributes(
  model: string,
  turn: number,
  inputTokens: number,
  outputTokens: number,
): Record<string, JsonValue> {
  return {
    "anvia.generation.turn": turn,
    "anvia.generation.model": model,
    "anvia.generation.temperature": 0.2,
    "anvia.generation.max_tokens": 1_024,
    "anvia.usage.input_tokens": inputTokens,
    "anvia.usage.output_tokens": outputTokens,
    "anvia.usage.total_tokens": inputTokens + outputTokens,
    "gen_ai.system": model.startsWith("claude")
      ? "anthropic"
      : model.startsWith("gemini")
        ? "google"
        : "openai",
    "gen_ai.request.model": model,
  };
}

function stableHex(value: string, length: number): string {
  return createHash("sha256").update(`lens-realistic-seed:${value}`).digest("hex").slice(0, length);
}

function decimal(key: string, minimum: number, maximum: number): number {
  const value = Number.parseInt(stableHex(key, 8), 16) / 0xffffffff;
  return minimum + value * (maximum - minimum);
}

function integer(key: string, minimum: number, maximum: number): number {
  return Math.round(decimal(key, minimum, maximum));
}

function toNano(milliseconds: number): string {
  return String(BigInt(Math.round(milliseconds)) * 1_000_000n);
}
