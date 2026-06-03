#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  simulate,
  listAllPersonas,
  addCustomPersona,
  loadCriteria,
  estimateAgentCost,
  estimateScreenshotCost,
  formatUsd,
  CRITERIA_PATH,
  CUSTOM_PERSONAS_PATH,
  DEFAULT_MODEL,
  type ImageMediaType,
  type Persona,
  type SimulationResult,
} from "@ghostuser/core";
import { runAgent, type AgentResult } from "@ghostuser/agent";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const server = new Server(
  {
    name: "ghostuser",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "start_guided_test",
      description:
        "ENTRY POINT. Call this when the user wants to test UX, find UX bugs, run GhostUser, or test a UI with personas. Returns a step-by-step script telling YOU (the assistant) how to gather: URL/screenshot, goal, persona, optional custom criteria. After gathering, call run_agent_test or simulate_screenshot.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_personas",
      description:
        "List all available personas — built-in (5) plus any custom ones the user created. Returns id, name, description, and a 'custom' flag. Use BEFORE asking the user which persona to pick, so you can present options.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "create_persona",
      description:
        "Create a custom persona tailored to the user's product (e.g. 'a fintech compliance officer' or 'a non-technical school principal'). Saved to ~/.ghostuser/personas.json. The user might say 'create a custom persona' or 'add my own user type'.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Unique kebab-case id, e.g. 'fintech-officer'. Cannot collide with built-ins (newbie, buyer, power, skeptic, hurried).",
          },
          name: {
            type: "string",
            description:
              "Friendly name with role, e.g. 'Priya the Compliance Officer'",
          },
          description: {
            type: "string",
            description: "One-sentence persona summary",
          },
          background: {
            type: "string",
            description:
              "Age, role, context — e.g. '38, fintech compliance lead at a Series B startup.'",
          },
          motivation: {
            type: "string",
            description: "What they want from this product",
          },
          frustrations: {
            type: "array",
            items: { type: "string" },
            description: "What pisses them off in software UX",
          },
          techLiteracy: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          patience: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: [
          "id",
          "name",
          "description",
          "background",
          "motivation",
          "frustrations",
          "techLiteracy",
          "patience",
        ],
      },
    },
    {
      name: "run_agent_test",
      description:
        "Run AUTONOMOUS browser test — UX + QA combined. Opens real Chromium, persona navigates (clicks/types/scrolls), and we ALSO catch broken features automatically: console errors, failed requests, HTTP 5xx, JS errors. Returns: journey, UX bugs (persona confusion), QA bugs (technical / broken stuff), and full technical-issue log. PREFER LOCALHOST URLs — bot protection blocks production sites. Browser opens visibly by default so the user can watch.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "URL to test. Strongly prefer localhost (e.g. http://localhost:3000). Production URLs with bot protection will be blocked.",
          },
          personaId: {
            type: "string",
            description:
              "Persona id from list_personas (newbie/buyer/power/skeptic/hurried or a custom one)",
          },
          goal: {
            type: "string",
            description:
              "What the persona should accomplish, e.g. 'Sign up for the product', 'Find the pricing page', 'Complete checkout with 2 items'",
          },
          maxSteps: {
            type: "number",
            description:
              "Optional. Max steps before bailing out. Default 15.",
          },
          headless: {
            type: "boolean",
            description:
              "Optional. Default false (browser window visible so user can watch). Set true to hide.",
          },
        },
        required: ["url", "personaId", "goal"],
      },
    },
    {
      name: "simulate_screenshot",
      description:
        "Simulate a persona looking at a SINGLE static image (no navigation, UX feedback only — we can't test functionality on a static image). Use when the user has a Figma export, a screenshot, or can't run a local server. Returns chain-of-thought + verdict + UX bugs. For functional QA testing, use run_agent_test instead.",
      inputSchema: {
        type: "object",
        properties: {
          imagePath: {
            type: "string",
            description:
              "Absolute path to the image file (PNG, JPEG, WebP, or GIF)",
          },
          personaId: {
            type: "string",
            description: "Persona id from list_personas",
          },
          goal: {
            type: "string",
            description:
              "What the persona is trying to accomplish on this screen",
          },
        },
        required: ["imagePath", "personaId", "goal"],
      },
    },
    {
      name: "show_criteria_path",
      description:
        "Show the user where to put custom evaluation rules (accessibility, brand voice, terminology dictionary, etc.) — a markdown file path. The file is auto-loaded for every test. Use when the user asks 'how do I customize what GhostUser checks for' or wants to add rules.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "estimate_cost",
      description:
        "Estimate Claude API cost for a test BEFORE running it. Call this once the user has confirmed URL/screenshot + persona + goal, but BEFORE calling run_agent_test or simulate_screenshot. Show the estimate to the user and ask them to confirm.",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["agent", "screenshot"],
            description:
              "'agent' for full browser run (5–15 steps + diagnose), 'screenshot' for a single image analysis.",
          },
          model: {
            type: "string",
            description:
              "Optional model name. Defaults to claude-sonnet-4-6.",
          },
        },
        required: ["mode"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "start_guided_test") {
    return handleStartGuidedTest();
  }

  if (name === "list_personas") {
    return handleListPersonas();
  }

  if (name === "create_persona") {
    return handleCreatePersona(args);
  }

  if (name === "run_agent_test") {
    return handleRunAgentTest(args);
  }

  if (name === "simulate_screenshot") {
    return handleSimulateScreenshot(args);
  }

  if (name === "show_criteria_path") {
    return handleShowCriteriaPath();
  }

  if (name === "estimate_cost") {
    return handleEstimateCost(args);
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function handleEstimateCost(args: unknown) {
  if (!args || typeof args !== "object") {
    throw new Error("estimate_cost requires arguments");
  }
  const { mode, model } = args as { mode: string; model?: string };
  const m = model ?? DEFAULT_MODEL;

  const estimate =
    mode === "agent"
      ? estimateAgentCost({ model: m })
      : estimateScreenshotCost({ model: m });

  const text = `💰 **Estimated cost: ${formatUsd(estimate.lowUsd)} – ${formatUsd(estimate.highUsd)}** (~${formatUsd(estimate.centerUsd)} typical)

- Model: \`${estimate.model}\`
- Mode: ${mode}

⚠️ ${estimate.note}
⚠️ Real cost depends on test length (steps for agent mode, image size for screenshot mode).

You'll see the actual cost charged in the final report. Want to proceed?`;

  return {
    content: [{ type: "text", text }],
  };
}

async function handleStartGuidedTest() {
  const criteria = await loadCriteria();
  const personas = await listAllPersonas();

  const personaLines = personas
    .map(
      (p) =>
        `  - **${p.name}** (id: \`${p.id}\`${p.custom ? ", custom" : ""}) — ${p.description}`,
    )
    .join("\n");

  const criteriaStatus = criteria
    ? `✅ Custom criteria detected at \`${CRITERIA_PATH}\` — will be applied automatically. Mention this to the user so they know it's active.`
    : `ℹ️ No custom criteria found yet. Mention to the user: "If you want me to check specific things (accessibility, brand voice, industry compliance, terminology), create \`${CRITERIA_PATH}\` and write your rules in markdown. I'll apply them automatically on every test."`;

  const flow = `# GhostUser — Guided Test Flow

Walk the user through these steps. Ask ONE question at a time. Be friendly and conversational. Do NOT dump all questions at once.

---

## Step 1 — What to test
Ask:
> "What do you want to test? Paste a URL — ideally a localhost dev server like \`http://localhost:3000\` (we can't bypass bot protection on production). OR, if you have a static screenshot/Figma export, give me the absolute file path."

Decision branch:
- If URL → you'll call \`run_agent_test\` at the end
- If image path → you'll call \`simulate_screenshot\` at the end

---

## Step 2 — Goal
Ask:
> "What should the user accomplish on this screen/site? Examples: 'Sign up for the product', 'Find pricing', 'Complete checkout', 'Understand what this does in 30 seconds'."

---

## Step 3 — Persona
Show the user these available personas:

${personaLines}

Ask:
> "Which persona should I simulate? Pick one — or say 'create custom' if you want a persona specific to your product (e.g. a fintech compliance officer)."

If user wants custom → call \`create_persona\` (gather: id, name, description, background, motivation, frustrations array, techLiteracy, patience). Then continue.

---

## Step 4 — Custom criteria status
${criteriaStatus}

---

## Step 5 — Cost preview (do NOT skip)
Call \`estimate_cost\` with the chosen mode ('agent' for URL test, 'screenshot' for image). Show the user the estimate. Ask: "Proceed?"

If user says no → stop. If yes → continue.

---

## Step 6 — Run
Call the right tool:
- URL test → \`run_agent_test({ url, personaId, goal })\` (the browser window will open — tell user to watch)
- Screenshot → \`simulate_screenshot({ imagePath, personaId, goal })\`

---

## Step 7 — Present results
After the tool returns, summarize for the user:
- Verdict (✅ passed / ❌ failed / 🚫 blocked / ⚠️ max steps)
- Chain of thought (in persona's voice) — the most valuable part
- UX bugs found, grouped by severity

Tone: Friendly, conversational, one step at a time. The user might not be a developer.`;

  return {
    content: [{ type: "text", text: flow }],
  };
}

async function handleListPersonas() {
  const personas = await listAllPersonas();
  return {
    content: [{ type: "text", text: JSON.stringify(personas, null, 2) }],
  };
}

async function handleCreatePersona(args: unknown) {
  if (!args || typeof args !== "object") {
    throw new Error("create_persona requires arguments");
  }
  const a = args as Partial<Persona>;
  if (
    !a.id ||
    !a.name ||
    !a.description ||
    !a.background ||
    !a.motivation ||
    !Array.isArray(a.frustrations) ||
    !a.techLiteracy ||
    !a.patience
  ) {
    throw new Error(
      "Missing required persona fields. Need: id, name, description, background, motivation, frustrations (array), techLiteracy, patience",
    );
  }
  const persona: Persona = {
    id: a.id,
    name: a.name,
    description: a.description,
    background: a.background,
    motivation: a.motivation,
    frustrations: a.frustrations,
    techLiteracy: a.techLiteracy,
    patience: a.patience,
  };
  await addCustomPersona(persona);
  return {
    content: [
      {
        type: "text",
        text: `✅ Custom persona "${persona.name}" (id: ${persona.id}) saved to ${CUSTOM_PERSONAS_PATH}. It's now available in list_personas and usable in run_agent_test / simulate_screenshot.`,
      },
    ],
  };
}

async function handleRunAgentTest(args: unknown) {
  if (!args || typeof args !== "object") {
    throw new Error("run_agent_test requires arguments");
  }
  const { url, personaId, goal, maxSteps, headless } = args as {
    url: string;
    personaId: string;
    goal: string;
    maxSteps?: number;
    headless?: boolean;
  };
  if (!url || !personaId || !goal) {
    throw new Error("run_agent_test requires url, personaId, and goal");
  }

  const result = await runAgent({
    url,
    personaId,
    goal,
    maxSteps,
    headless: headless ?? false,
  });

  return {
    content: [{ type: "text", text: formatAgentResult(result) }],
  };
}

async function handleSimulateScreenshot(args: unknown) {
  if (!args || typeof args !== "object") {
    throw new Error("simulate_screenshot requires arguments");
  }
  const { imagePath, personaId, goal } = args as {
    imagePath: string;
    personaId: string;
    goal: string;
  };
  if (!imagePath || !personaId || !goal) {
    throw new Error(
      "simulate_screenshot requires imagePath, personaId, and goal",
    );
  }

  const buffer = await readFile(imagePath);
  const result = await simulate({
    imageBase64: buffer.toString("base64"),
    imageMediaType: inferMediaType(imagePath),
    personaId,
    goal,
  });

  return {
    content: [{ type: "text", text: formatSimulationResult(result) }],
  };
}

async function handleShowCriteriaPath() {
  const criteria = await loadCriteria();
  const status = criteria
    ? `Currently has ${criteria.split("\n").length} lines of content — being applied to every test.`
    : "Currently empty / not created.";

  const text = `# Custom Evaluation Criteria

**File path:** \`${CRITERIA_PATH}\`
**Status:** ${status}

## How to use

Create the file and write markdown describing what you want GhostUser to ALWAYS check, in addition to normal UX evaluation. Examples:

\`\`\`markdown
# Accessibility (WCAG AA)
- All images must have alt text
- Text contrast must meet 4.5:1 ratio
- Focus indicators must be visible on every interactive element
- Form fields must have labels (not just placeholders)

# Brand voice
- Never use the word "users" — always "customers" or "members"
- Tone is professional but warm — no slang, no emojis in product copy
- CTAs must use action verbs ("Get started", not "Click here")

# Fintech-specific
- Any field collecting PII must have a privacy note nearby
- Risk warnings must be visible before users commit money
- Account numbers should be masked by default (show last 4 only)
\`\`\`

GhostUser will inject this into every persona's evaluation. Findings against these rules show up in the BUGS section of every test result.`;

  return {
    content: [{ type: "text", text }],
  };
}

function inferMediaType(path: string): ImageMediaType {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function formatSimulationResult(result: SimulationResult): string {
  const verdictEmoji =
    result.verdict === "passed"
      ? "✅"
      : result.verdict === "warning"
        ? "⚠️"
        : "❌";

  const bugsBlock = result.bugs.length
    ? result.bugs
        .map(
          (b, i) =>
            `${i + 1}. [${b.severity.toUpperCase()}] ${b.description}`,
        )
        .join("\n")
    : "(none reported)";

  return `# ${result.persona.name} — ${verdictEmoji} ${result.verdict.toUpperCase()}

**Goal:** ${result.goal}
**Cost:** 💰 ${formatUsd(result.cost.totalUsd)}  (${result.usage.inputTokens.toLocaleString()} in + ${result.usage.outputTokens.toLocaleString()} out tokens, ${result.cost.model})

## Stream of thought

${result.chainOfThought}

## UX bugs found

${bugsBlock}
`;
}

function formatAgentResult(result: AgentResult): string {
  const verdictEmoji =
    result.verdict === "passed"
      ? "✅"
      : result.verdict === "failed"
        ? "❌"
        : result.verdict === "blocked"
          ? "🚫"
          : "⚠️";

  const actionEmoji = (t: string): string => {
    if (t === "click") return "👆";
    if (t === "type") return "⌨️";
    if (t === "scroll") return "📜";
    if (t === "wait") return "⏳";
    if (t === "done") return "🎉";
    if (t === "give_up") return "🏳️";
    return "•";
  };

  const journey = result.steps
    .map(
      (s) =>
        `**Step ${s.stepNum}** ${actionEmoji(s.action.type)} ${s.action.type.toUpperCase()}\n${s.action.narration}${s.action.selector ? `\n_→ \`${s.action.selector}\`_` : ""}`,
    )
    .join("\n\n");

  const uxSection = result.uxBugs.length
    ? result.uxBugs
        .map(
          (b, i) =>
            `${i + 1}. [${b.severity.toUpperCase()}] ${b.description}`,
        )
        .join("\n")
    : "(none reported)";

  const qaSection = result.qaBugs.length
    ? result.qaBugs
        .map((b, i) => {
          const line = `${i + 1}. [${b.severity.toUpperCase()}] ${b.description}`;
          return b.evidence ? `${line}\n   _evidence: ${b.evidence}_` : line;
        })
        .join("\n")
    : "(none reported)";

  const techSection = result.technicalIssues.length
    ? "<details><summary>Browser-observed technical events (" +
      result.technicalIssues.length +
      ")</summary>\n\n" +
      result.technicalIssues
        .slice(0, 20)
        .map(
          (i) =>
            `- **${i.type}** — ${i.message.slice(0, 200)}${i.url && i.url !== result.url ? ` (${i.url})` : ""}`,
        )
        .join("\n") +
      (result.technicalIssues.length > 20
        ? `\n- _…and ${result.technicalIssues.length - 20} more_`
        : "") +
      "\n</details>\n"
    : "";

  return `# ${verdictEmoji} ${result.verdict.toUpperCase()}

**Persona:** \`${result.personaId}\`
**Goal:** ${result.goal}
**URL:** ${result.url}
**Duration:** ${(result.durationMs / 1000).toFixed(1)}s, ${result.steps.length} steps
**Cost:** 💰 ${formatUsd(result.costUsd)}  (${result.usage.inputTokens.toLocaleString()} in + ${result.usage.outputTokens.toLocaleString()} out tokens, ${result.modelsUsed.join(", ")})
${result.reason ? `**Reason:** ${result.reason}\n` : ""}${result.summary ? `\n**Summary:** ${result.summary}\n` : ""}

## 🎨 UX bugs (persona's experience)

${uxSection}

## 🐛 QA bugs (technical / broken features)

${qaSection}

${techSection}

## Journey

${journey || "(no steps recorded)"}
`;
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[ghostuser-mcp] v0.1.0 running on stdio");
