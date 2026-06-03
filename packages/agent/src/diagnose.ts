import Anthropic from "@anthropic-ai/sdk";
import {
  loadCriteria,
  computeCost,
  withRetry,
  extractToolInput,
  resolveApiKey,
  DEFAULT_MODEL,
  type Persona,
  type CostBreakdown,
  type TokenUsage,
} from "ghostuser-core";
import type {
  AgentStep,
  TechnicalIssue,
  UxBug,
  QaBug,
  Severity,
} from "./types.js";

export interface DiagnoseInput {
  steps: AgentStep[];
  technicalIssues: TechnicalIssue[];
  goal: string;
  persona: Persona;
  verdict: string;
  reason?: string;
  apiKey?: string;
  model?: string;
}

export interface DiagnoseOutput {
  summary: string;
  uxBugs: UxBug[];
  qaBugs: QaBug[];
  usage: TokenUsage;
  cost: CostBreakdown;
  model: string;
}

interface DiagnosisToolInput {
  summary: string;
  uxBugs: UxBug[];
  qaBugs: QaBug[];
}

const DIAGNOSIS_TOOL: Anthropic.Messages.Tool = {
  name: "submit_diagnosis",
  description:
    "Submit the final UX + QA diagnosis of a persona's journey through the site.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "1–2 sentence summary of the journey and outcome.",
      },
      uxBugs: {
        type: "array",
        description:
          "UX bugs — confusion, friction, unclear copy, missing affordances, anything that frustrated the persona.",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["low", "medium", "high"] },
            description: { type: "string" },
          },
          required: ["severity", "description"],
        },
      },
      qaBugs: {
        type: "array",
        description:
          "QA bugs — things technically broken: failed features, errors, broken links, console errors, HTTP 4xx/5xx, unexpected behavior. Use the technical-issues list as authoritative evidence.",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["low", "medium", "high"] },
            description: { type: "string" },
            evidence: {
              type: "string",
              description: "Where you saw it (step, log entry, etc).",
            },
          },
          required: ["severity", "description"],
        },
      },
    },
    required: ["summary", "uxBugs", "qaBugs"],
  },
};

const DIAGNOSE_SYSTEM = `You are a senior UX + QA analyst. You're reviewing the journey of a fake user (persona) who just navigated a website.

You have TWO jobs:
1. Extract UX bugs from the persona's narrations.
2. Extract QA bugs from the technical-issue log (console errors, failed requests, HTTP errors) AND from things the persona experienced that suggest a broken feature (e.g. they clicked Submit and nothing happened).

Be precise. Don't fabricate. If there are no UX bugs, return an empty array; same for QA. Submit via submit_diagnosis.`;

export async function diagnoseRun(
  input: DiagnoseInput,
): Promise<DiagnoseOutput> {
  const model = input.model ?? DEFAULT_MODEL;

  if (input.steps.length === 0 && input.technicalIssues.length === 0) {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    return {
      summary: "No steps recorded.",
      uxBugs: [],
      qaBugs: [],
      usage,
      cost: computeCost(usage, model),
      model,
    };
  }

  const client = new Anthropic({
    apiKey: resolveApiKey(input.apiKey),
  });

  const criteria = await loadCriteria();

  const journeyText = input.steps.length
    ? input.steps
        .map(
          (s) =>
            `Step ${s.stepNum} [${s.action.type}] ${s.action.narration}${s.action.selector ? ` (selector: ${s.action.selector})` : ""}${s.action.reason ? ` (reason: ${s.action.reason})` : ""}`,
        )
        .join("\n")
    : "(no steps)";

  const technicalText = input.technicalIssues.length
    ? input.technicalIssues
        .map(
          (i) =>
            `[${i.type}] ${i.message}${i.url ? ` (at ${i.url})` : ""}${i.status ? ` status=${i.status}` : ""}${i.atStep ? ` at step ${i.atStep}` : ""}`,
        )
        .join("\n")
    : "(no technical issues detected)";

  const criteriaBlock = criteria
    ? `\n\nUSER-DEFINED EVALUATION CRITERIA (from ~/.ghostuser/criteria.md):\n${criteria}\n\nApply these as additional rules when classifying bugs.`
    : "";

  const userPrompt = `Persona: ${input.persona.name} (${input.persona.description})
Goal: ${input.goal}
Verdict: ${input.verdict}${input.reason ? `\nReason: ${input.reason}` : ""}

Journey:
${journeyText}

Technical issues observed by the browser:
${technicalText}${criteriaBlock}

Submit your diagnosis via submit_diagnosis.`;

  const message = await withRetry(() =>
    client.messages.create({
      model,
      max_tokens: 1500,
      system: DIAGNOSE_SYSTEM,
      tools: [DIAGNOSIS_TOOL],
      tool_choice: { type: "tool", name: DIAGNOSIS_TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    }),
  );

  const tool = extractToolInput<DiagnosisToolInput>(
    message,
    DIAGNOSIS_TOOL.name,
  );

  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };

  return {
    summary: tool.summary ?? "",
    uxBugs: normalizeBugs(tool.uxBugs),
    qaBugs: normalizeBugs(tool.qaBugs) as QaBug[],
    usage,
    cost: computeCost(usage, model),
    model,
  };
}

function normalizeBugs<T extends { severity?: string; description?: string }>(
  arr: T[] | undefined,
): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (b): b is T =>
      b !== null &&
      typeof b === "object" &&
      typeof b.description === "string" &&
      (["low", "medium", "high"] as const).includes(
        (b.severity ?? "medium") as Severity,
      ),
  );
}
