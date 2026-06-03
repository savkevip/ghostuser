# ghostuser-mcp

> MCP server. Use GhostUser AI personas to test UX inside Claude Desktop, Claude Code, Cursor, Windsurf — any MCP-compatible client.

Drop this into your MCP config and your assistant gets seven new tools that let it run UX tests on your app. Two flavors: full browser journeys against a live URL, or quick checks on a single screenshot.

---

## What you get

| Tool | What it does | Required args |
|---|---|---|
| `start_guided_test` | **Entry point.** Returns a script telling the assistant how to gather URL/screenshot, goal, persona, criteria — then call one of the run tools. | — |
| `list_personas` | Lists 5 built-in personas + any custom ones. Use BEFORE asking the user which to pick. | — |
| `create_persona` | Creates a custom persona (e.g. "fintech compliance officer"). Saved to `~/.ghostuser/personas.json`. | `id`, `name`, `description`, `background`, `motivation`, `frustrations`, `techLiteracy`, `patience` |
| `run_agent_test` | **Autonomous browser test.** Opens Chromium, persona navigates, returns UX bugs + QA bugs + technical-issue log. **Prefer localhost URLs.** | `url`, `personaId`, `goal` |
| `simulate_screenshot` | Persona looks at one static image. UX feedback only — no functional testing. Use for Figma exports or when localhost isn't available. | `imagePath`, `personaId`, `goal` |
| `show_criteria_path` | Tells the user where to put custom evaluation rules (accessibility, brand voice, terminology). | — |
| `estimate_cost` | Pre-flight USD estimate. Call BEFORE `run_agent_test` or `simulate_screenshot` so the user can confirm. | `mode` (`"agent"` or `"screenshot"`) |

---

## Install

```bash
npm install -g ghostuser-mcp
npx playwright install chromium   # one-time, ~170 MB, only needed for run_agent_test
```

Requires Node 20+ and an Anthropic API key.

---

## Quick start

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ghostuser": {
      "command": "npx",
      "args": ["-y", "ghostuser-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart Claude Desktop.

### Claude Code

```bash
claude mcp add ghostuser npx -y ghostuser-mcp
```

Set `ANTHROPIC_API_KEY` in your shell env, or pass `-e ANTHROPIC_API_KEY=sk-ant-...` to `claude mcp add`.

### Cursor / Windsurf

Same shape as Claude Desktop — drop a `ghostuser` entry into your MCP config with `command: "npx"`, `args: ["-y", "ghostuser-mcp"]`, and an `env` block holding `ANTHROPIC_API_KEY`.

---

## Use it

Once configured, just ask in any conversation:

> "Use ghostuser to simulate Maya the Newbie trying to sign up at http://localhost:3000"

> "Run ghostuser against my checkout flow. The screenshot is at /tmp/cart.png and the goal is to buy the blue shirt."

> "Create a ghostuser persona for a 55-year-old non-technical school principal."

The assistant will call `start_guided_test`, walk through the missing pieces, show you a cost estimate, then run the test.

---

## Recommended flow (for assistants)

```
start_guided_test
  → list_personas (so the user can pick)
  → create_persona (optional, if the user wants a custom one)
  → estimate_cost (show user, ask to confirm)
  → run_agent_test   OR   simulate_screenshot
  → show_criteria_path (optional, if user wants to add accessibility/brand rules)
```

---

## Built-in personas

| id | Name | Patience | Tech literacy | Use for |
|---|---|---|---|---|
| `newbie` | Maya the Newbie | low | medium | First-time visitor, value-prop clarity. |
| `buyer` | Dan the Buyer | medium | high | Pricing, trust, purchase decision. |
| `power` | Riley the Power User | low | high | Depth, shortcuts, advanced flows. |
| `skeptic` | Sam the Skeptic | low | high | Proof, social validation, marketing claims. |
| `hurried` | Alex In-A-Hurry | low | medium | 60-second test of the core action. |

---

## Custom evaluation rules

Put accessibility rules, brand voice, terminology dictionaries, etc. in `~/.ghostuser/criteria.md`. They're auto-loaded into every test. Call `show_criteria_path` from your assistant to get the exact path.

---

## API key

The Anthropic key is read from `ANTHROPIC_API_KEY` in the MCP server's environment — set it in the `env` block of your MCP config (Claude Desktop / Cursor / Windsurf) or in your shell (Claude Code). MCP servers are spawned by the host, so there's no programmatic `init()` here — just use the env var.

---

## Cost

- `simulate_screenshot` — single Claude call. ~$0.005–$0.015 with default Sonnet.
- `run_agent_test` — 5–15 steps + diagnosis. ~$0.10–$0.40 with default Sonnet.

Always call `estimate_cost` first and show the user before running. The actual cost is included in the tool result.

---

## When to use this vs. siblings

| Use case | Package |
|---|---|
| Single screenshot from Node code | [`ghostuser-core`](https://www.npmjs.com/package/ghostuser-core) |
| Full browser journey from Node code | [`ghostuser-agent`](https://www.npmjs.com/package/ghostuser-agent) |
| Inside Claude Desktop / Cursor / Windsurf | **`ghostuser-mcp`** (this) |

---

## License

MIT
