import {
  estimateAgentCost,
  estimateScreenshotCost,
  formatUsd,
  getPricing,
  MODEL_PRICING,
} from "./pricing.js";

export interface ModelInfo {
  id: string;
  displayName: string;
  description: string;
  bestFor: string;
  isKnown: boolean;
  estimatedCostAgent: string;
  estimatedCostScreenshot: string;
}

/**
 * Curated descriptions for known model families.
 * Anthropic model ids stay stable per release; alias keys catch both bare and dated forms.
 */
const KNOWN_MODEL_INFO: Record<
  string,
  Pick<ModelInfo, "displayName" | "description" | "bestFor">
> = {
  "claude-haiku-4-5": {
    displayName: "Haiku 4.5",
    description: "Fast & cheap",
    bestFor:
      "Quick sanity checks, batch testing many screens at low cost. Less nuanced.",
  },
  "claude-haiku-4-5-20251001": {
    displayName: "Haiku 4.5",
    description: "Fast & cheap",
    bestFor:
      "Quick sanity checks, batch testing many screens at low cost. Less nuanced.",
  },
  "claude-sonnet-4-6": {
    displayName: "Sonnet 4.6",
    description: "Balanced (recommended)",
    bestFor:
      "Best balance of quality and cost. Catches nuanced UX + QA issues. Default choice.",
  },
  "claude-opus-4-7": {
    displayName: "Opus 4.7",
    description: "Highest quality (premium)",
    bestFor:
      "Deepest analysis for high-stakes flows (payments, signup, onboarding).",
  },
};

const FAMILY_PRIORITY = ["sonnet", "opus", "haiku"];

function familyOf(id: string): string | null {
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  if (id.includes("haiku")) return "haiku";
  return null;
}

function buildModelInfo(id: string, displayNameFromApi?: string): ModelInfo {
  const known = KNOWN_MODEL_INFO[id];
  const { source } = getPricing(id);
  const isKnown = source === "known";

  const agentEst = estimateAgentCost({ model: id });
  const screenshotEst = estimateScreenshotCost({ model: id });

  const costSuffix = isKnown ? "" : " (pricing TBD — fallback estimate)";

  return {
    id,
    displayName: known?.displayName ?? displayNameFromApi ?? id,
    description: known?.description ?? "Newer model — pricing unconfirmed",
    bestFor:
      known?.bestFor ??
      "Recently released by Anthropic — pricing not yet in GhostUser table; estimates use Sonnet fallback. Verify cost at console.anthropic.com.",
    isKnown,
    estimatedCostAgent: `~${formatUsd(agentEst.centerUsd)}${costSuffix}`,
    estimatedCostScreenshot: `~${formatUsd(screenshotEst.centerUsd)}${costSuffix}`,
  };
}

/**
 * Fetch available Claude models from the Anthropic API at runtime.
 * Falls back to the known-models table if the API call fails (e.g. offline, bad key).
 */
export async function fetchAvailableModels(
  apiKey?: string,
): Promise<ModelInfo[]> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Object.keys(KNOWN_MODEL_INFO).map((id) => buildModelInfo(id));
  }

  try {
    const response = await fetch(
      "https://api.anthropic.com/v1/models?limit=50",
      {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    interface ApiModelEntry {
      id: string;
      display_name?: string;
    }
    interface ApiResponse {
      data?: ApiModelEntry[];
    }
    const body = (await response.json()) as ApiResponse;
    const data = body.data ?? [];
    const infos: ModelInfo[] = data
      .filter((m: ApiModelEntry) => m.id.startsWith("claude-"))
      .map((m: ApiModelEntry) => buildModelInfo(m.id, m.display_name));

    if (infos.length === 0) {
      return Object.keys(KNOWN_MODEL_INFO).map((id) => buildModelInfo(id));
    }

    infos.sort((a: ModelInfo, b: ModelInfo) => {
      if (a.isKnown !== b.isKnown) return a.isKnown ? -1 : 1;
      const fa = FAMILY_PRIORITY.indexOf(familyOf(a.id) ?? "");
      const fb = FAMILY_PRIORITY.indexOf(familyOf(b.id) ?? "");
      if (fa !== fb) return fa - fb;
      return b.id.localeCompare(a.id);
    });

    return infos;
  } catch {
    return Object.keys(KNOWN_MODEL_INFO).map((id) => buildModelInfo(id));
  }
}

/**
 * Pick a sensible default model from a list — prefer claude-sonnet-4-6 if present,
 * else any Sonnet family, else first known, else first item.
 */
export function pickDefaultModel(models: ModelInfo[]): string {
  if (models.length === 0) return "claude-sonnet-4-6";
  const explicit = models.find((m) => m.id === "claude-sonnet-4-6");
  if (explicit) return explicit.id;
  const sonnet = models.find((m) => familyOf(m.id) === "sonnet");
  if (sonnet) return sonnet.id;
  const known = models.find((m) => m.isKnown);
  if (known) return known.id;
  return models[0].id;
}
