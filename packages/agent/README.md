# ghostuser-agent

> Autonomous agent: AI personas navigate your live site, click around, type, scroll, get confused, and report back UX bugs *and* QA bugs.

![GhostUser agent in action](https://raw.githubusercontent.com/savkevip/ghostuser/main/assets/agent-demo.gif)

Give it a URL and a goal. It opens real Chromium (via Playwright), pretends to be a persona, and walks the screen step by step — narrating what it sees, deciding what to click, and watching for broken stuff in the background (console errors, failed requests, HTTP 5xx).

At the end you get:
- **Journey** — every step the persona took, with their narration
- **UX bugs** — confusion, friction, missing affordances
- **QA bugs** — broken features, errors, dead clicks
- **Technical issues** — raw console / network / HTTP log
- **Cost** — exact USD spent

---

## Install

```bash
npm install ghostuser-agent
npx playwright install chromium   # one-time, ~170 MB
```

Requires Node 20+ and an Anthropic API key.

---

## Quick start

### Library

```ts
import { init, runAgent } from "ghostuser-agent";

init(process.env.ANTHROPIC_API_KEY!);

const result = await runAgent({
  url: "http://localhost:3000",
  personaId: "newbie",
  goal: "Sign up for the product",
  headless: false,
  onStep: (step) =>
    console.log(`Step ${step.stepNum} [${step.action.type}]: ${step.action.narration}`),
});

console.log(result.verdict);            // "passed" | "failed" | "blocked" | "max_steps"
console.log(result.summary);
console.log(result.uxBugs);
console.log(result.qaBugs);
console.log(result.technicalIssues);
console.log(`Spent $${result.costUsd.toFixed(4)} in ${result.durationMs}ms`);
```

### CLI (interactive)

```bash
npx ghostuser-agent
```

Prompts you for URL, goal, persona, headless mode, and model.

---

## API reference

### Functions

| Function | What it does | Required args |
|---|---|---|
| `runAgent(options)` | Runs a full persona journey on a URL. Opens Chromium, takes screenshots each step, asks Claude what to do next, then diagnoses the run at the end. | `url`, `personaId`, `goal` |
| `init(apiKey \| { apiKey })` | Sets the Anthropic key globally for this process. Re-exported from `ghostuser-core` — same global state. | `apiKey: string` |
| `diagnoseRun(input)` | Runs only the post-journey UX + QA diagnosis (without driving a browser). Useful if you record steps yourself. | `steps`, `technicalIssues`, `goal`, `persona`, `verdict` |
| `detectBotProtection(page)` | Inspects a Playwright `Page` for Cloudflare / reCAPTCHA / hCaptcha / Turnstile. Returns `{ detected, type }`. | `Page` |
| `getInteractiveElements(page)` | Snapshots clickable / typable elements on the current page (with `index`, `selector`, `tag`, `role`, `text`, `placeholder`). | `Page` |
| `resolveApiKey(explicit?)` | Resolves the active key (per-call → `init()` → env). Mostly used internally. | — |

### `runAgent()` options

| Option | Type | Default | What it does |
|---|---|---|---|
| `url` | `string` | — | The page to open. **Strongly prefer `localhost`** — production sites with bot protection are blocked. |
| `personaId` | `string` | — | `newbie`, `buyer`, `power`, `skeptic`, `hurried`, or a custom id. |
| `goal` | `string` | — | What the persona should accomplish, e.g. `"Complete checkout with 2 items"`. |
| `maxSteps` | `number` | `15` | Hard cap on steps before forcing `max_steps` verdict. |
| `headless` | `boolean` | `false` | Hide the browser window. Default shows it so you can watch. |
| `apiKey` | `string` | — | Per-call override. See **API key resolution**. |
| `model` | `string` | `claude-sonnet-4-6` | Model for the per-step decisions (the expensive part). |
| `diagnoseModel` | `string` | same as `model` | Optionally use a cheaper model for the final diagnosis. |
| `onStep` | `(step: AgentStep) => void` | — | Callback fired after every step. Use for streaming logs/UI. |

### `AgentResult`

```ts
{
  verdict: "passed" | "failed" | "blocked" | "max_steps";
  reason?: string;
  summary?: string;
  steps: AgentStep[];           // every action taken
  uxBugs: UxBug[];              // confusion / friction / missing affordances
  qaBugs: QaBug[];              // broken features / errors / dead clicks
  technicalIssues: TechnicalIssue[];  // raw console + network log
  durationMs: number;
  personaId: string;
  goal: string;
  url: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  modelsUsed: string[];
}
```

### Action types

| Action | When the persona uses it |
|---|---|
| `click` | Clicks an interactive element by `selector`. |
| `type` | Types into a field. Includes `text`. |
| `scroll` | Scrolls down to see more. |
| `wait` | Waits for async UI (modal, toast, navigation). Forced after state-changing actions. |
| `done` | Goal achieved. Run ends with `passed`. |
| `give_up` | Persona would bounce as a real user. Run ends with `failed`. Includes `reason`. |

### Verdicts

| Verdict | Meaning |
|---|---|
| `passed` | Persona reached the goal. |
| `failed` | Persona gave up. The `reason` field tells you why. |
| `blocked` | Bot protection or hard navigation failure stopped the run. |
| `max_steps` | Hit `maxSteps` without finishing. |

### Technical issue types

| Type | What gets logged |
|---|---|
| `console_error` | `console.error(...)` calls from the page. |
| `page_error` | Uncaught JS exceptions. |
| `failed_request` | Network requests that failed (DNS, abort, CORS). |
| `http_error` | Responses with status 4xx / 5xx. |

---

## API key resolution

Same global state as `ghostuser-core` — call `init()` from either package, both pick it up.

| # | Source | Example |
|---|---|---|
| 1 | Per-call | `runAgent({ apiKey, ... })` |
| 2 | Global init | `init("sk-ant-...")` once at startup |
| 3 | Env var | `ANTHROPIC_API_KEY=sk-ant-...` |

---

## Bot protection

If the target site has Cloudflare, reCAPTCHA, hCaptcha, Turnstile, or similar, the agent **stops** with verdict `blocked`:

> 🚫 GhostUser doesn't support sites behind bot protection — point it at your dev server instead (e.g. `http://localhost:3000`), where you're testing your own work anyway.

This is intentional. We don't try to bypass bot protection — both because it's an arms race we'd lose and because the right target is your own dev environment.

---

## Cost

Each run is 5–15 Claude calls (one per step) plus one diagnosis call. With default Sonnet 4.6, expect **~$0.10–$0.40 per run** depending on goal complexity. The exact USD is returned in `result.costUsd`. Switch to Haiku for ~5× cheaper, or Opus for deeper analysis on critical flows.

Use `estimateAgentCost({ model })` from `ghostuser-core` for pre-flight estimates.

---

## When to use this vs. siblings

| Use case | Package |
|---|---|
| Single screenshot, no navigation | [`ghostuser-core`](https://www.npmjs.com/package/ghostuser-core) |
| Live website / localhost, full journey | **`ghostuser-agent`** (this) |
| Inside Claude Desktop / Cursor / Windsurf | [`ghostuser-mcp`](https://www.npmjs.com/package/ghostuser-mcp) |

---

## License

MIT
