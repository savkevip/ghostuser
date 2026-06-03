# Changelog

## 0.0.3 — 2026-06-03

### Docs
- Expanded README with full API reference table, persona table, verdict / bug severity / API key tables, and a "which package for which job" comparison. No code changes.

## 0.0.2 — 2026-06-03

### Added
- **`init(apiKey)`** — configure the Anthropic API key once at startup instead of passing it on every call or relying on `ANTHROPIC_API_KEY`.

  ```ts
  import { init, simulate } from "ghostuser-core";

  init(process.env.ANTHROPIC_API_KEY!);
  // or: init({ apiKey: "sk-ant-..." })

  await simulate({ imageBase64, personaId: "newbie", goal: "Sign up" });
  ```

  Precedence (highest → lowest):
  1. Per-call `apiKey` (`simulate({ apiKey, ... })`)
  2. `init(...)`
  3. `process.env.ANTHROPIC_API_KEY`

- Exported `resolveApiKey` helper and `InitOptions` type for advanced use.

### Compatibility
- Fully backward-compatible. Existing code using the per-call `apiKey` option or `ANTHROPIC_API_KEY` env var continues to work unchanged.

## 0.0.1

- Initial release.
