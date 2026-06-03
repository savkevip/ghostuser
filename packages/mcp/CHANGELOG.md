# Changelog

## 0.1.1 — 2026-06-03

### Changed
- Bumped `ghostuser-core` to `^0.0.2` and `ghostuser-agent` to `^0.0.2`. These bring the new `init(apiKey)` API into the dependency tree, though MCP itself reads the API key from the host config's `env` block (Claude Desktop / Cursor / Windsurf), so end-user behavior is unchanged.
- Softer wording in `run_agent_test` URL description and the `start_guided_test` script — frames the dev server as the natural target instead of "we can't bypass bot protection."

## 0.1.0

- Initial release: 7 MCP tools (`start_guided_test`, `list_personas`, `create_persona`, `run_agent_test`, `simulate_screenshot`, `show_criteria_path`, `estimate_cost`).
