import { describe, expect, it } from "vitest";
import {
  alertChannelInputSchema,
  alertDeliveryTargetSchema,
  alertRuleInputSchema,
} from "../src/index.js";

describe("alert contracts", () => {
  it("validates thresholds and quality-gate rules", () => {
    const rule = {
      name: "Production errors",
      kind: "trace_error_rate",
      threshold: 0.05,
      windowMinutes: 15,
      minimumSamples: 20,
    };
    expect(alertRuleInputSchema.safeParse(rule).success).toBe(true);
    expect(alertRuleInputSchema.safeParse({ ...rule, threshold: 1.1 }).success).toBe(false);
    expect(
      alertRuleInputSchema.safeParse({
        ...rule,
        kind: "tool_error_rate",
        threshold: 1.1,
      }).success,
    ).toBe(false);
    expect(
      alertRuleInputSchema.safeParse({
        name: "Release gate",
        kind: "failed_quality_gate",
        qualityGateId: "10000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("restricts provider URLs to their official HTTPS hosts", () => {
    expect(
      alertChannelInputSchema.safeParse({
        type: "slack",
        name: "Slack",
        webhookUrl: "https://hooks.slack.com/services/a/b/c",
      }).success,
    ).toBe(true);
    expect(
      alertChannelInputSchema.safeParse({
        type: "slack",
        name: "Slack",
        webhookUrl: "http://127.0.0.1/hook",
      }).success,
    ).toBe(false);
    expect(
      alertChannelInputSchema.safeParse({ type: "webhook", name: "Broken", url: "not-a-url" })
        .success,
    ).toBe(false);
    expect(
      alertChannelInputSchema.safeParse({
        type: "discord",
        name: "Discord",
        webhookUrl: "https://evil.example/api/webhooks/1/x",
      }).success,
    ).toBe(false);
  });

  it("allows HTTP(S) generic webhooks and correlates persisted target config", () => {
    expect(
      alertChannelInputSchema.safeParse({
        type: "webhook",
        name: "Local receiver",
        url: "http://receiver.example/hook",
      }).success,
    ).toBe(true);
    expect(
      alertChannelInputSchema.safeParse({
        type: "webhook",
        name: "File",
        url: "file:///tmp/hook",
      }).success,
    ).toBe(false);
    expect(
      alertDeliveryTargetSchema.safeParse({
        type: "telegram",
        config: { webhookUrl: "https://hooks.slack.com/x" },
      }).success,
    ).toBe(false);
  });
});
