import Anthropic from "@anthropic-ai/sdk";
import {
  getPersonaAsync,
  loadCriteria,
  computeCost,
  withRetry,
  extractToolInput,
  resolveApiKey,
  DEFAULT_MODEL,
  type CostBreakdown,
  type TokenUsage,
} from "ghostuser-core";
import type { AgentAction, AgentStep, ActionType } from "./types.js";
import type { InteractiveElement } from "./dom.js";

export interface DecisionResult {
  action: AgentAction;
  usage: TokenUsage;
  cost: CostBreakdown;
  model: string;
  isStateChange: boolean;
}

interface DecisionToolInput {
  narration: string;
  action: ActionType;
  elementIndex?: number;
  text?: string;
  reason?: string;
  isStateChange?: boolean;
}

const DECISION_TOOL: Anthropic.Messages.Tool = {
  name: "decide_next_action",
  description: "Decide the persona's next action on the current screen.",
  input_schema: {
    type: "object",
    properties: {
      narration: {
        type: "string",
        description:
          "1–2 sentences in first person, as the persona, explaining what you see and what you'll do next.",
      },
      action: {
        type: "string",
        enum: ["click", "type", "scroll", "wait", "done", "give_up"],
        description:
          "done = goal achieved. give_up = you'd bounce as a real user. wait = page is mid-load OR you just did something state-changing and need to see the response.",
      },
      elementIndex: {
        type: "integer",
        description:
          "Required for click and type. The index from the Interactive Elements list.",
      },
      text: {
        type: "string",
        description: "Required for type. The text to enter.",
      },
      reason: {
        type: "string",
        description: "Required for give_up. Why you'd bounce.",
      },
      isStateChange: {
        type: "boolean",
        description:
          "True if this action submits/sends/saves something that will change app state (e.g. you just clicked Submit/Send/Buy/Sign Up). When true, the system will wait longer for async feedback (toast notifications, modals).",
      },
    },
    required: ["narration", "action"],
  },
};

const SYSTEM_PROMPT_BASE = `You are simulating a real user navigating a website. You ARE the persona described — not an AI, not a designer, not a tester.

Look at the current screen. Decide what you'd actually do next as this person. Be honest: if you're confused, say so. If you'd give up, do it — that's valuable signal, not failure.

Call decide_next_action with your decision.

CRITICAL — async UI patience:
After clicking Submit / Send / Save / Buy / Sign Up / Login / Confirm / Post / Subscribe / Book (or any state-changing action), set isStateChange=true and your IMMEDIATE next action should usually be \`wait\` — toast notifications, modals, success messages, and page transitions take 1–2 seconds. Do NOT immediately conclude \`give_up\` because "nothing happened" right after a submit. Wait first, then look again. If after waiting the screen is still unchanged with no feedback, THAT is the real bug worth reporting.`;

async function buildSystemPrompt(): Promise<string> {
  const criteria = await loadCriteria();
  if (!criteria) return SYSTEM_PROMPT_BASE;
  return `${SYSTEM_PROMPT_BASE}

EXTRA EVALUATION CRITERIA (from user's ~/.ghostuser/criteria.md):
${criteria}

While navigating, call out anything violating these criteria in your narration (e.g. "this button has poor contrast — accessibility issue").`;
}

export async function decideNextAction(opts: {
  screenshotBase64: string;
  elements: InteractiveElement[];
  personaId: string;
  goal: string;
  history: AgentStep[];
  apiKey?: string;
  model?: string;
}): Promise<DecisionResult> {
  const persona = await getPersonaAsync(opts.personaId);
  const systemPrompt = await buildSystemPrompt();
  const model = opts.model ?? DEFAULT_MODEL;

  const client = new Anthropic({
    apiKey: resolveApiKey(opts.apiKey),
  });

  const elementsList = opts.elements.length
    ? opts.elements
        .map((e) => {
          const labels = [
            `[${e.index}]`,
            `<${e.tag}${e.type && e.tag === "input" ? ` type="${e.type}"` : ""}${e.role ? ` role="${e.role}"` : ""}>`,
            e.text ? `"${e.text}"` : "",
            e.placeholder ? `placeholder="${e.placeholder}"` : "",
          ]
            .filter(Boolean)
            .join(" ");
          return labels;
        })
        .join("\n")
    : "(no interactive elements detected)";

  const historyBlock =
    opts.history.length === 0
      ? "(this is your first step)"
      : opts.history
          .slice(-6)
          .map(
            (s) =>
              `Step ${s.stepNum}: [${s.action.type}] ${s.action.narration}`,
          )
          .join("\n");

  const userPrompt = `You are "${persona.name}" — ${persona.description}.

Background: ${persona.background}
What motivates you: ${persona.motivation}
What frustrates you: ${persona.frustrations.join("; ")}
Tech literacy: ${persona.techLiteracy}
Patience: ${persona.patience}

YOUR GOAL: ${opts.goal}

What you've done so far:
${historyBlock}

Interactive elements on current screen:
${elementsList}

Look at the screenshot and decide your next action. Call decide_next_action.`;

  const message = await withRetry(() =>
    client.messages.create({
      model,
      max_tokens: 600,
      system: systemPrompt,
      tools: [DECISION_TOOL],
      tool_choice: { type: "tool", name: DECISION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: opts.screenshotBase64,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    }),
  );

  const input = extractToolInput<DecisionToolInput>(
    message,
    DECISION_TOOL.name,
  );

  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
  const cost = computeCost(usage, model);

  let selector: string | undefined;
  if (
    (input.action === "click" || input.action === "type") &&
    typeof input.elementIndex === "number"
  ) {
    selector = opts.elements[input.elementIndex]?.selector;
  }

  const action: AgentAction = {
    type: input.action,
    narration: input.narration ?? "(no narration)",
    selector,
    text: input.text,
    reason: input.reason,
  };

  return {
    action,
    usage,
    cost,
    model,
    isStateChange: Boolean(input.isStateChange),
  };
}
