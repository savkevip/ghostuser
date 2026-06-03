#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  input,
  select,
  checkbox,
  confirm,
} from "@inquirer/prompts";
import {
  listAllPersonas,
  addCustomPersona,
  formatUsd,
  loadCriteria,
  CRITERIA_PATH,
  fetchAvailableModels,
  pickDefaultModel,
  type Persona,
} from "ghostuser-core";
import { runAgent } from "./agent.js";
import type { AgentResult, AgentStep } from "./types.js";

async function loadEnv() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env optional
  }
}

function verdictEmoji(v: string): string {
  if (v === "passed") return "✅";
  if (v === "failed") return "❌";
  if (v === "blocked") return "🚫";
  return "⚠️";
}

function actionEmoji(t: string): string {
  if (t === "click") return "👆";
  if (t === "type") return "⌨️";
  if (t === "scroll") return "📜";
  if (t === "wait") return "⏳";
  if (t === "done") return "🎉";
  if (t === "give_up") return "🏳️";
  return "•";
}

function severityIcon(s: string): string {
  if (s === "high") return "🔴";
  if (s === "medium") return "🟡";
  return "🟢";
}

async function promptForNewPersona(): Promise<Persona> {
  console.log("\n✨ Let's define your custom persona.\n");
  const id = await input({
    message: "ID (kebab-case, e.g. 'fintech-officer'):",
    validate: (v) =>
      /^[a-z][a-z0-9-]+$/.test(v) ||
      "Use lowercase letters/numbers/hyphens, starting with a letter.",
  });
  const name = await input({
    message: "Friendly name (e.g. 'Priya the Compliance Officer'):",
  });
  const description = await input({
    message: "One-line description:",
  });
  const background = await input({
    message: "Background (age, role, context):",
  });
  const motivation = await input({
    message: "What motivates them (what they want from your product):",
  });
  const frustrationsRaw = await input({
    message: "Frustrations (comma-separated):",
  });
  const techLiteracy = (await select({
    message: "Tech literacy:",
    default: "medium",
    choices: [
      { name: "low", value: "low" },
      { name: "medium", value: "medium" },
      { name: "high", value: "high" },
    ],
  })) as "low" | "medium" | "high";
  const patience = (await select({
    message: "Patience:",
    default: "medium",
    choices: [
      { name: "low", value: "low" },
      { name: "medium", value: "medium" },
      { name: "high", value: "high" },
    ],
  })) as "low" | "medium" | "high";

  return {
    id,
    name,
    description,
    background,
    motivation,
    frustrations: frustrationsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    techLiteracy,
    patience,
  };
}

function printResult(result: AgentResult, label: string) {
  console.log("\n" + "=".repeat(60));
  console.log(
    `${verdictEmoji(result.verdict)} ${label} — ${result.verdict.toUpperCase()}  (${(result.durationMs / 1000).toFixed(1)}s, ${result.steps.length} steps)`,
  );
  if (result.reason) console.log(`Reason: ${result.reason}`);
  if (result.summary) console.log(`\nSummary: ${result.summary}`);
  console.log(
    `\n💰 Cost: ${formatUsd(result.costUsd)}  (${result.usage.inputTokens.toLocaleString()} in + ${result.usage.outputTokens.toLocaleString()} out)`,
  );
  console.log("=".repeat(60));

  if (result.uxBugs.length) {
    console.log("\n🎨 UX bugs:");
    for (const [i, bug] of result.uxBugs.entries()) {
      console.log(
        `  ${i + 1}. ${severityIcon(bug.severity)} [${bug.severity.toUpperCase()}] ${bug.description}`,
      );
    }
  } else {
    console.log("\n🎨 UX bugs: none reported");
  }

  if (result.qaBugs.length) {
    console.log("\n🐛 QA bugs:");
    for (const [i, bug] of result.qaBugs.entries()) {
      console.log(
        `  ${i + 1}. ${severityIcon(bug.severity)} [${bug.severity.toUpperCase()}] ${bug.description}`,
      );
      if (bug.evidence) console.log(`     evidence: ${bug.evidence}`);
    }
  } else {
    console.log("\n🐛 QA bugs: none reported");
  }

  if (result.technicalIssues.length) {
    console.log(
      `\n🔧 Browser-observed events: ${result.technicalIssues.length} (top 3):`,
    );
    for (const issue of result.technicalIssues.slice(0, 3)) {
      console.log(`   [${issue.type}] ${issue.message.slice(0, 100)}`);
    }
  }
  console.log("");
}

async function main() {
  console.log("\n🎭 GhostUser Agent — autonomous persona + QA testing\n");

  await loadEnv();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY not set. Put it in .env or export it.");
    process.exit(1);
  }

  // 1. URL
  const url = await input({
    message: "🌐 URL to test:",
    default: "http://localhost:3000",
    validate: (v) =>
      v.startsWith("http://") || v.startsWith("https://") || "Must start with http(s)://",
  });

  // 2. Goal
  const goal = await input({
    message: "🎯 What should the user accomplish?",
    default: "Sign up for the product",
  });

  // 3. Model — fetched live from Anthropic API
  console.log("🤖 Fetching available models from Anthropic…");
  const availableModels = await fetchAvailableModels();
  const defaultModel = pickDefaultModel(availableModels);
  const modelChoices = availableModels.map((m) => ({
    name: `${m.displayName} — ${m.description}${m.isKnown ? "" : " ⚠️ new"}`,
    value: m.id,
    description: m.bestFor,
  }));
  const model = await select({
    message: "🤖 Which AI model?",
    default: defaultModel,
    choices: modelChoices,
  });

  // 4. Personas — multi-select with newbie pre-checked + create new option
  const all = await listAllPersonas();
  const personaChoices = [
    ...all.map((p) => ({
      name: `${p.name}  (${p.description}${p.custom ? " — custom" : ""})`,
      value: p.id,
      checked: p.id === "newbie",
    })),
    { name: "✨ + Create a new custom persona", value: "__create__" as const },
  ];
  let personaIds = (await checkbox({
    message: "🎭 Which persona(s)? (Space to toggle, Enter to confirm)",
    choices: personaChoices,
    required: true,
  })) as string[];

  if (personaIds.includes("__create__")) {
    const newP = await promptForNewPersona();
    await addCustomPersona(newP);
    console.log(`✅ Saved custom persona "${newP.name}".\n`);
    personaIds = personaIds.filter((id) => id !== "__create__");
    personaIds.push(newP.id);
  }

  // 5. Browser visibility
  const showBrowser = await confirm({
    message: "👁️  Show browser window?",
    default: true,
  });

  // Cost note (no estimate — real cost shown at end)
  const N = personaIds.length;
  console.log(
    `\n💰 Real cost will be shown after the test (${N} persona${N > 1 ? "s" : ""}, ${model}).`,
  );

  // Criteria status
  const criteria = await loadCriteria();
  if (criteria) {
    console.log(
      `\n📋 Custom criteria found at ${CRITERIA_PATH} — will be applied.`,
    );
  } else {
    console.log(
      `\nℹ️  No custom criteria. Add rules at ${CRITERIA_PATH} (or run \`npm run criteria\`) to extend evaluation.`,
    );
  }

  const ok = await confirm({ message: "Proceed?", default: true });
  if (!ok) {
    console.log("Cancelled.");
    process.exit(0);
  }

  // 7. Run sequentially
  const onStep = (step: AgentStep) => {
    const narration = step.action.narration.replace(/\s+/g, " ").slice(0, 200);
    console.log(
      `  [${step.stepNum}] ${actionEmoji(step.action.type)} ${step.action.type.toUpperCase()} — ${narration}`,
    );
  };

  const results: AgentResult[] = [];
  let totalCost = 0;

  for (const [i, personaId] of personaIds.entries()) {
    console.log(
      `\n🚀 [${i + 1}/${personaIds.length}] Running persona "${personaId}" on ${url}\n`,
    );
    const result = await runAgent({
      url,
      personaId,
      goal,
      headless: !showBrowser,
      model,
      onStep,
    });
    results.push(result);
    totalCost += result.costUsd;
    printResult(result, personaId);
  }

  // Summary across all personas
  if (results.length > 1) {
    console.log("\n" + "▓".repeat(60));
    console.log(`📊 SUMMARY — ${results.length} personas tested`);
    console.log("▓".repeat(60));
    for (const r of results) {
      console.log(
        `${verdictEmoji(r.verdict)} ${r.personaId.padEnd(15)} ${r.verdict.padEnd(10)} ${r.uxBugs.length} UX / ${r.qaBugs.length} QA bugs  ${formatUsd(r.costUsd)}`,
      );
    }
    console.log(`\n💰 Total cost: ${formatUsd(totalCost)}`);
    console.log("");
  }
}

main().catch((e) => {
  if (e?.name === "ExitPromptError") {
    console.log("\nCancelled.");
    process.exit(0);
  }
  console.error("\n❌ Error:", (e as Error).message);
  process.exit(1);
});
