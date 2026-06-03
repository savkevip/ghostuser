# @ghostuser/agent

> Autonomous agent: AI personas that navigate live websites and find UX bugs.

Give it a URL and a goal. Pick a persona. Watch a real browser open and a fake user navigate your app — clicking, typing, scrolling, getting confused, giving up.

## Install

Part of the [ghostuser](https://github.com/savkevip/ghostuser) monorepo.

```bash
npm install
npm run build
npx playwright install chromium   # one-time, ~170MB
```

## Usage

### CLI (interactive)

From repo root:

```bash
npm run agent
```

You'll be prompted for URL, goal, persona, and whether to show the browser window.

### Library

```ts
import { runAgent } from "@ghostuser/agent";

const result = await runAgent({
  url: "http://localhost:3000",
  personaId: "newbie",
  goal: "Sign up for the product",
  headless: false,
  onStep: (step) => console.log(step.stepNum, step.action.type, step.action.narration),
});

console.log(result.verdict);
for (const step of result.steps) {
  console.log(step.action.narration);
}
```

## Bot protection

If the target site has Cloudflare, reCAPTCHA, hCaptcha, Turnstile, or other anti-bot measures, the agent will stop and tell you:

> 🚫 Cloudflare bot protection detected. Run GhostUser against your localhost dev server (e.g. http://localhost:3000) instead — we don't bypass bot protection.

This is intentional. Test against your dev server.

## License

MIT
