import Anthropic from "@anthropic-ai/sdk";
import { getPersonaAsync, type Persona } from "./persona.js";
import { loadCriteria } from "./criteria.js";
import {
  computeCost,
  DEFAULT_MODEL,
  type CostBreakdown,
  type TokenUsage,
} from "./pricing.js";
import { withRetry, extractToolInput } from "./llm.js";

export type ImageMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

export interface SimulateOptions {
  imageBase64: string;
  imageMediaType?: ImageMediaType;
  personaId: string;
  goal: string;
  model?: string;
  apiKey?: string;
  /** Explicit criteria override. If undefined, auto-loads from ~/.ghostuser/criteria.md. Pass null to disable. */
  criteria?: string | null;
}

export type Verdict = "passed" | "warning" | "failed";
export type Severity = "low" | "medium" | "high";

export interface UxBug {
  severity: Severity;
  description: string;
}

export interface SimulationResult {
  persona: Persona;
  goal: string;
  chainOfThought: string;
  verdict: Verdict;
  bugs: UxBug[];
  usage: TokenUsage;
  cost: CostBreakdown;
}

interface SimulationToolInput {
  chainOfThought: string;
  verdict: Verdict;
  bugs: UxBug[];
}

const SIMULATION_TOOL: Anthropic.Messages.Tool = {
  name: "submit_simulation",
  description:
    "Submit the persona's reaction to the screen, their verdict, and any UX bugs they noticed.",
  input_schema: {
    type: "object",
    properties: {
      chainOfThought: {
        type: "string",
        description:
          "2–4 short paragraphs in first person, as the persona, narrating what they see and what they'd do. Brutally honest; no consultant-speak.",
      },
      verdict: {
        type: "string",
        enum: ["passed", "warning", "failed"],
        description:
          "passed = goal completed easily; warning = completed with friction; failed = persona gave up.",
      },
      bugs: {
        type: "array",
        description: "UX issues the persona encountered. Empty array if none.",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            description: {
              type: "string",
              description: "Concrete UX bug description.",
            },
          },
          required: ["severity", "description"],
        },
      },
    },
    required: ["chainOfThought", "verdict", "bugs"],
  },
};

const SYSTEM_PROMPT_BASE = `You are simulating a real user looking at a UI. You ARE the persona described — not an AI, not a tester, not a designer.

Be brutally honest. If you don't understand something, say "I have no idea what this is" — don't politely speculate. If something looks clickable but isn't actually labeled or styled clearly, say so. If you'd bounce, say so.

Call the submit_simulation tool with your result.`;

async function buildSystemPrompt(
  explicitCriteria: string | null | undefined,
): Promise<string> {
  const criteria =
    explicitCriteria === undefined
      ? await loadCriteria()
      : explicitCriteria;
  if (!criteria) return SYSTEM_PROMPT_BASE;
  return `${SYSTEM_PROMPT_BASE}

EXTRA EVALUATION CRITERIA (from user's ~/.ghostuser/criteria.md):
${criteria}

When you submit, ALSO include any criteria violations as bugs (accessibility, brand voice, terminology, etc.) — even if the persona wouldn't naturally notice them.`;
}

export async function simulate(
  options: SimulateOptions,
): Promise<SimulationResult> {
  const persona = await getPersonaAsync(options.personaId);
  const systemPrompt = await buildSystemPrompt(options.criteria);
  const model = options.model ?? DEFAULT_MODEL;

  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  const userPrompt = buildPersonaPrompt(persona, options.goal);

  const message = await withRetry(() =>
    client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [SIMULATION_TOOL],
      tool_choice: { type: "tool", name: SIMULATION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: options.imageMediaType ?? "image/png",
                data: options.imageBase64,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    }),
  );

  const input = extractToolInput<SimulationToolInput>(
    message,
    SIMULATION_TOOL.name,
  );

  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
  const cost = computeCost(usage, model);

  return {
    persona,
    goal: options.goal,
    chainOfThought: input.chainOfThought ?? "",
    verdict: (input.verdict ?? "warning") as Verdict,
    bugs: Array.isArray(input.bugs) ? input.bugs : [],
    usage,
    cost,
  };
}

function buildPersonaPrompt(persona: Persona, goal: string): string {
  return `You are "${persona.name}" — ${persona.description}.

Background: ${persona.background}
What motivates you: ${persona.motivation}
What frustrates you: ${persona.frustrations.join("; ")}
Tech literacy: ${persona.techLiteracy}
Patience: ${persona.patience}

YOUR GOAL on this screen: ${goal}

Look at the screenshot. Walk through what you'd actually do, in your own voice. Don't be polite. Don't speculate to sound smart. Be the real person. Submit your reaction via submit_simulation.`;
}
