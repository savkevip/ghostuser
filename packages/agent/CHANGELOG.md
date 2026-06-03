# Changelog

## 0.0.2 — 2026-06-03

### Added
- **Re-exports `init(apiKey)` from `ghostuser-core`** — configure the Anthropic API key once at startup instead of relying on `ANTHROPIC_API_KEY` env var.

  ```ts
  import { init, runAgent } from "ghostuser-agent";

  init(process.env.ANTHROPIC_API_KEY!);
  // or: init({ apiKey: "sk-ant-..." })

  await runAgent({ url: "http://localhost:3000", personaId: "newbie", goal: "Sign up" });
  ```

  If you already called `init()` on `ghostuser-core` directly, the agent picks it up automatically — single global config for both.

  Precedence (highest → lowest):
  1. Per-call `apiKey` (`runAgent({ apiKey, ... })`)
  2. `init(...)` (from either `ghostuser-core` or `ghostuser-agent`)
  3. `process.env.ANTHROPIC_API_KEY`

### Changed
- Bumped `ghostuser-core` dependency to `^0.0.2`.
- Softer wording when bot protection is detected — frames `localhost` as the natural target (you're testing your own work) instead of saying "we don't bypass bot protection."

### Compatibility
- Fully backward-compatible. Existing code using per-call `apiKey` or `ANTHROPIC_API_KEY` env var continues to work.

## 0.0.1

- Initial release.
