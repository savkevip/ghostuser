# @ghostuser/figma

> GhostUser Figma plugin — AI personas test your designs inside Figma.

## What it does

1. Select 1+ frames in Figma.
2. Open the plugin, pick persona + goal.
3. Plugin exports the frames as PNGs and sends them straight to Claude (BYOK).
4. See the persona's chain of thought + UX bugs, per frame.

Your Anthropic API key stays in `figma.clientStorage` on your machine — never sent anywhere except Anthropic's API.

## Build

From the monorepo root:

```bash
npm install --workspace @ghostuser/figma
npm run build --workspace @ghostuser/figma
```

This produces `packages/figma/dist/` containing:
- `code.js` (sandbox)
- `ui.html` (UI)
- `manifest.json`

## Install in Figma (local dev)

1. Open Figma Desktop.
2. Menu: **Plugins → Development → Import plugin from manifest…**
3. Pick `packages/figma/dist/manifest.json`.

## Use

1. In Figma, select 1+ frames.
2. **Plugins → Development → GhostUser**.
3. First time: paste your Anthropic API key.
4. Set a goal, pick a persona, hit **Run test**.
5. Watch the persona react to each selected frame, with chain of thought + UX bugs.

## Status

🟢 Alpha. v0.1 features:
- Single-persona test on 1+ selected frames
- 5 built-in personas
- Model selector (Sonnet / Haiku / Opus)
- BYOK (your Anthropic key)

## License

MIT
