import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Persona {
  id: string;
  name: string;
  description: string;
  background: string;
  motivation: string;
  frustrations: string[];
  techLiteracy: "low" | "medium" | "high";
  patience: "low" | "medium" | "high";
}

export const PERSONAS: Record<string, Persona> = {
  newbie: {
    id: "newbie",
    name: "Maya the Newbie",
    description: "First-time user, never seen your product before",
    background:
      "27, marketing coordinator at a small agency. Just signed up because a colleague vaguely mentioned it.",
    motivation:
      "Wants to quickly understand what this tool does and whether it's worth trying.",
    frustrations: [
      "confusing jargon",
      "forms with too many fields",
      "unclear primary CTAs",
      "having to figure out what each section is for",
    ],
    techLiteracy: "medium",
    patience: "low",
  },
  buyer: {
    id: "buyer",
    name: "Dan the Buyer",
    description: "Evaluating whether to pay for this product",
    background:
      "42, head of operations at a 30-person startup. Has budget. Comparing 3 alternatives.",
    motivation:
      "Wants to see pricing, understand value vs alternatives, find a contact for enterprise.",
    frustrations: [
      "hidden or 'contact sales' pricing",
      "vague feature descriptions",
      "no comparison to competitors",
      "missing case studies or social proof",
    ],
    techLiteracy: "high",
    patience: "medium",
  },
  power: {
    id: "power",
    name: "Riley the Power User",
    description:
      "Already uses similar tools, expects keyboard shortcuts and depth",
    background:
      "31, senior engineer at a SaaS company. Uses 20+ tools daily. Notion, Linear, Raycast, Cursor.",
    motivation:
      "Wants to evaluate fast — does this fit their workflow? Can they integrate it?",
    frustrations: [
      "no keyboard shortcuts",
      "slow loading or sluggish UI",
      "hand-holding onboarding they can't skip",
      "missing API or integrations",
    ],
    techLiteracy: "high",
    patience: "low",
  },
  skeptic: {
    id: "skeptic",
    name: "Sam the Skeptic",
    description: "Doesn't trust marketing copy, looks for proof",
    background:
      "38, freelance designer. Burned by 20+ SaaS subscriptions they forgot to cancel.",
    motivation:
      "Wants social proof, real screenshots, transparent pricing, easy cancellation.",
    frustrations: [
      "AI-generated stock landing pages",
      "fake-looking testimonials",
      "vague pricing or 'starts at' language",
      "buzzwords without substance",
    ],
    techLiteracy: "high",
    patience: "low",
  },
  hurried: {
    id: "hurried",
    name: "Alex In-A-Hurry",
    description: "Has 60 seconds. Will bounce if not immediately clear.",
    background:
      "29, product manager. Browsing on phone between meetings. Saw a tweet, clicked the link.",
    motivation:
      "Wants to grasp the value in 10 seconds and decide whether to bookmark or close.",
    frustrations: [
      "walls of text",
      "video-only explanations that require sound",
      "multi-step signup before seeing the product",
      "popups that block content",
    ],
    techLiteracy: "medium",
    patience: "low",
  },
};

export const CUSTOM_PERSONAS_PATH = join(
  homedir(),
  ".ghostuser",
  "personas.json",
);

/** Sync lookup of built-in personas only. */
export function getPersona(id: string): Persona {
  const persona = PERSONAS[id];
  if (!persona) {
    throw new Error(
      `Unknown built-in persona: "${id}". Available built-ins: ${Object.keys(PERSONAS).join(", ")}. (For custom personas, use getPersonaAsync.)`,
    );
  }
  return persona;
}

/** Sync list of built-in personas only. */
export function listPersonas(): Array<
  Pick<Persona, "id" | "name" | "description">
> {
  return Object.values(PERSONAS).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}

/** Read user-created personas from ~/.ghostuser/personas.json. */
export async function loadCustomPersonas(): Promise<Persona[]> {
  try {
    const content = await readFile(CUSTOM_PERSONAS_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Persona =>
        p !== null &&
        typeof p === "object" &&
        typeof (p as Persona).id === "string" &&
        typeof (p as Persona).name === "string",
    );
  } catch {
    return [];
  }
}

/** Append or replace a custom persona. Built-ins cannot be overridden. */
export async function addCustomPersona(persona: Persona): Promise<void> {
  if (PERSONAS[persona.id]) {
    throw new Error(
      `Cannot override built-in persona "${persona.id}". Use a different id.`,
    );
  }
  const existing = await loadCustomPersonas();
  const filtered = existing.filter((p) => p.id !== persona.id);
  const updated = [...filtered, persona];
  await mkdir(dirname(CUSTOM_PERSONAS_PATH), { recursive: true });
  await writeFile(
    CUSTOM_PERSONAS_PATH,
    JSON.stringify(updated, null, 2),
    "utf8",
  );
}

/** All personas: built-in + custom merged. */
export async function getAllPersonas(): Promise<Record<string, Persona>> {
  const custom = await loadCustomPersonas();
  const merged: Record<string, Persona> = { ...PERSONAS };
  for (const p of custom) merged[p.id] = p;
  return merged;
}

/** Async lookup including custom personas. */
export async function getPersonaAsync(id: string): Promise<Persona> {
  const all = await getAllPersonas();
  const persona = all[id];
  if (!persona) {
    throw new Error(
      `Unknown persona: "${id}". Available: ${Object.keys(all).join(", ")}`,
    );
  }
  return persona;
}

/** Async list including custom personas. */
export async function listAllPersonas(): Promise<
  Array<Pick<Persona, "id" | "name" | "description"> & { custom: boolean }>
> {
  const all = await getAllPersonas();
  const builtIns = new Set(Object.keys(PERSONAS));
  return Object.values(all).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    custom: !builtIns.has(p.id),
  }));
}
