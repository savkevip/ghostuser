# ghostuser-core

> Core engine: AI personas walk through your UI screenshots and tell you, in their own words, what's confusing — before real users hit it.

Send a screenshot + a goal. Pick a persona. Get back:
- **Chain of thought** — what they "see" and what they'd do (first person, no consultant-speak)
- **Verdict** — `passed`, `warning`, or `failed`
- **Bugs** — UX issues with severity

It's a single Claude API call wrapped in a structured tool-use schema, so the result is always machine-readable.

---

## Install

```bash
npm install ghostuser-core
```

Requires Node 20+ and an Anthropic API key.

---

## Quick start

```ts
import { init, simulate } from "ghostuser-core";
import { readFile } from "node:fs/promises";

init(process.env.ANTHROPIC_API_KEY!);

const buffer = await readFile("./screen.png");
const result = await simulate({
  imageBase64: buffer.toString("base64"),
  personaId: "newbie",
  goal: "Sign up for the product",
});

console.log(result.verdict);          // "warning"
console.log(result.chainOfThought);   // "I see a big purple button..."
console.log(result.bugs);             // [{ severity: "medium", description: "..." }]
console.log(result.cost.totalUsd);    // 0.0073
```

---

## API reference

### Functions

| Function | What it does | Required args |
|---|---|---|
| `init(apiKey \| { apiKey })` | Sets the Anthropic key globally for this process. Call once at startup. | `apiKey: string` |
| `simulate(options)` | Runs one persona against one screenshot. Returns chain of thought, verdict, bugs, token usage, and cost. | `imageBase64`, `personaId`, `goal` |
| `listPersonas()` | Returns the 5 built-in personas (synchronous). | — |
| `getPersona(id)` | Returns one built-in persona by id (synchronous). Throws if not found. | `id` |
| `getPersonaAsync(id)` | Returns a built-in OR custom persona by id. Reads `~/.ghostuser/personas.json`. | `id` |
| `getAllPersonas()` | Returns built-ins + custom personas (async). | — |
| `listAllPersonas()` | Compact list (id, name, description, `custom` flag) of all personas. | — |
| `loadCustomPersonas()` | Reads custom personas from `~/.ghostuser/personas.json`. | — |
| `addCustomPersona(persona)` | Appends a custom persona to `~/.ghostuser/personas.json`. | `Persona` |
| `loadCriteria()` | Reads extra evaluation rules from `~/.ghostuser/criteria.md`. Auto-applied by `simulate()`. | — |
| `fetchAvailableModels(apiKey?)` | Calls Anthropic `/v1/models`, returns curated info + cost estimates. Falls back to known list if offline. | — |
| `pickDefaultModel(models)` | Picks a sensible default — prefers `claude-sonnet-4-6`, then any Sonnet, then any known. | `ModelInfo[]` |
| `computeCost(usage, model)` | Computes USD cost from token counts. | `TokenUsage`, model id |
| `estimateAgentCost({ model })` | Pre-flight cost estimate for a multi-step agent run. | — |
| `estimateScreenshotCost({ model })` | Pre-flight cost estimate for one screenshot simulation. | — |
| `formatUsd(n)` | Pretty-prints a number as USD (e.g. `$0.0073`). | `number` |
| `getPricing(modelId)` | Returns per-million-token rates for a model. | `modelId` |
| `resolveApiKey(explicit?)` | Resolves the active key (per-call → `init()` → env). Mostly used internally. | — |
| `withRetry(fn)` | Retries a Claude API call on transient errors. Used internally. | callable |
| `extractToolInput(message, toolName)` | Pulls the tool-use input out of a Claude `Message`. Used internally. | — |

### `simulate()` options

| Option | Type | Default | What it does |
|---|---|---|---|
| `imageBase64` | `string` | — | Screenshot encoded as base64 (no `data:` prefix). |
| `personaId` | `string` | — | One of `newbie`, `buyer`, `power`, `skeptic`, `hurried`, or a custom id. |
| `goal` | `string` | — | What the persona is trying to do, e.g. `"Sign up for the product"`. |
| `imageMediaType` | `"image/png" \| "image/jpeg" \| "image/webp" \| "image/gif"` | `"image/png"` | Image format. |
| `model` | `string` | `claude-sonnet-4-6` | Anthropic model id. |
| `apiKey` | `string` | — | Per-call override. See **API key resolution**. |
| `criteria` | `string \| null` | auto from `~/.ghostuser/criteria.md` | Extra rules (accessibility, brand voice, etc.). Pass `null` to disable. |

### `SimulationResult`

```ts
{
  persona: Persona;
  goal: string;
  chainOfThought: string;        // 2–4 short paragraphs in first person
  verdict: "passed" | "warning" | "failed";
  bugs: { severity: "low" | "medium" | "high"; description: string }[];
  usage: { inputTokens: number; outputTokens: number };
  cost: { inputUsd: number; outputUsd: number; totalUsd: number };
}
```

---

## Built-in personas

| id | Name | Tech literacy | Patience | When to use |
|---|---|---|---|---|
| `newbie` | Maya the Newbie | medium | low | First-time visitor. Tests if your value prop is clear without context. |
| `buyer` | Dan the Buyer | high | medium | Evaluating to purchase. Tests pricing pages, trust signals, decision flows. |
| `power` | Riley the Power User | high | low | Already uses similar tools. Tests depth, shortcuts, advanced features. |
| `skeptic` | Sam the Skeptic | high | low | Doesn't trust marketing. Tests proof, social validation, claims. |
| `hurried` | Alex In-A-Hurry | medium | low | 60-second budget. Tests if the core action is immediately obvious. |

Add your own to `~/.ghostuser/personas.json` (see `addCustomPersona`).

---

## Verdicts

| Verdict | Meaning |
|---|---|
| `passed` | Persona completed the goal easily. |
| `warning` | Goal achieved, but with friction worth fixing. |
| `failed` | Persona gave up. Real user would bounce. |

---

## Bug severity

| Severity | Meaning |
|---|---|
| `low` | Cosmetic / nitpick. Doesn't block the goal. |
| `medium` | Causes friction, slowdown, or confusion. |
| `high` | Likely to cause abandonment. |

---

## API key resolution

Provide the Anthropic key any of three ways. Precedence, highest first:

| # | Source | Example |
|---|---|---|
| 1 | Per-call | `simulate({ apiKey, ... })` |
| 2 | Global init | `init("sk-ant-...")` once at startup |
| 3 | Env var | `ANTHROPIC_API_KEY=sk-ant-...` |

---

## Custom evaluation criteria

Put accessibility rules, brand voice guides, terminology dictionaries, etc. in `~/.ghostuser/criteria.md`. They're auto-loaded by `simulate()` and applied as extra checks. Pass `criteria: "..."` to override, or `criteria: null` to disable.

---

## Pricing

`simulate()` returns the exact USD cost per run. Defaults to `claude-sonnet-4-6` (~$0.005–$0.015 per screenshot, depending on screen size). Switch with `model:` — see [`fetchAvailableModels()`](#functions) for a live list.

---

## When to use this vs. siblings

| Use case | Package |
|---|---|
| Single screenshot, no navigation | **`ghostuser-core`** (this) |
| Live website / localhost, full journey | [`ghostuser-agent`](https://www.npmjs.com/package/ghostuser-agent) |
| Inside Claude Desktop / Cursor / Windsurf | [`ghostuser-mcp`](https://www.npmjs.com/package/ghostuser-mcp) |

---

## License

MIT
