/**
 * Claude API pricing (USD per million tokens), as of early 2026.
 *
 * ⚠️ These are local estimates — prices may have changed.
 * Always verify at https://console.anthropic.com/ for current rates.
 */

export interface ModelPricing {
  input: number; // USD per million input tokens
  output: number; // USD per million output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  model: string;
  pricingSource: "known" | "fallback";
}

export function getPricing(model: string): {
  pricing: ModelPricing;
  source: "known" | "fallback";
} {
  const known = MODEL_PRICING[model];
  if (known) return { pricing: known, source: "known" };
  // Fall back to Sonnet pricing if model unknown
  return { pricing: MODEL_PRICING[DEFAULT_MODEL], source: "fallback" };
}

export function computeCost(
  usage: TokenUsage,
  model: string = DEFAULT_MODEL,
): CostBreakdown {
  const { pricing, source } = getPricing(model);
  const inputUsd = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.output;
  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
    model,
    pricingSource: source,
  };
}

/** Rough heuristic for an agent run. */
export interface AgentEstimateInput {
  expectedSteps?: number; // default 10
  model?: string;
  diagnoseModel?: string;
  /** Approx input tokens per step (image + text + history). Defaults to a typical 1280x800 screenshot scenario. */
  inputTokensPerStep?: number;
  /** Approx output tokens per step (the JSON action). */
  outputTokensPerStep?: number;
}

export interface CostEstimate {
  lowUsd: number;
  highUsd: number;
  centerUsd: number;
  model: string;
  pricingSource: "known" | "fallback";
  note: string;
}

export function estimateAgentCost(
  input: AgentEstimateInput = {},
): CostEstimate {
  const model = input.model ?? DEFAULT_MODEL;
  const diagnoseModel = input.diagnoseModel ?? model;
  const inputPerStep = input.inputTokensPerStep ?? 4_000;
  const outputPerStep = input.outputTokensPerStep ?? 300;

  // Range: 5 to 15 steps (low/high)
  const lowSteps = 5;
  const highSteps = 15;
  const expected = input.expectedSteps ?? 10;

  const { pricing: stepPricing, source } = getPricing(model);
  const { pricing: diagPricing } = getPricing(diagnoseModel);

  const stepCost = (steps: number) => {
    const inputUsd = (steps * inputPerStep * stepPricing.input) / 1_000_000;
    const outputUsd =
      (steps * outputPerStep * stepPricing.output) / 1_000_000;
    return inputUsd + outputUsd;
  };

  // Diagnose: ~2000 input, ~500 output, scales slightly with steps
  const diagnoseCost = (steps: number) => {
    const diagInput = 2_000 + steps * 50;
    const diagOutput = 500;
    return (
      (diagInput * diagPricing.input) / 1_000_000 +
      (diagOutput * diagPricing.output) / 1_000_000
    );
  };

  const lowUsd = stepCost(lowSteps) + diagnoseCost(lowSteps);
  const highUsd = stepCost(highSteps) + diagnoseCost(highSteps);
  const centerUsd = stepCost(expected) + diagnoseCost(expected);

  return {
    lowUsd,
    highUsd,
    centerUsd,
    model,
    pricingSource: source,
    note:
      source === "fallback"
        ? `Pricing for model "${model}" not in our table — using Sonnet 4.6 as fallback estimate.`
        : "Estimate only — prices may have changed at https://console.anthropic.com",
  };
}

export interface ScreenshotEstimateInput {
  model?: string;
  inputTokens?: number; // default ~3000
  outputTokens?: number; // default ~1000
}

export function estimateScreenshotCost(
  input: ScreenshotEstimateInput = {},
): CostEstimate {
  const model = input.model ?? DEFAULT_MODEL;
  const inputTokens = input.inputTokens ?? 3_000;
  const outputTokens = input.outputTokens ?? 1_000;
  const { pricing, source } = getPricing(model);
  const center =
    (inputTokens * pricing.input) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000;
  return {
    lowUsd: center * 0.7,
    highUsd: center * 1.3,
    centerUsd: center,
    model,
    pricingSource: source,
    note:
      source === "fallback"
        ? `Pricing for model "${model}" not in our table — using Sonnet 4.6 as fallback estimate.`
        : "Estimate only — prices may have changed at https://console.anthropic.com",
  };
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
