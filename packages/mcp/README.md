# @ghostuser/mcp

> MCP server. Use GhostUser AI personas to test UX inside Claude Desktop, Claude Code, Cursor, Windsurf.

## What it does

Exposes two tools to your AI client:

- `list_personas` — get available personas
- `simulate_persona` — walk a fake user through a screenshot, return their chain of thought + verdict + bugs

## Quick start

### 1. Build

```bash
git clone https://github.com/savkevip/ghostuser.git
cd ghostuser
npm install
npm run build
```

### 2. Configure Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ghostuser": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ghostuser/packages/mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Restart Claude Desktop.

### 3. Configure Claude Code

`~/.claude/mcp.json` or via `claude mcp add`:

```bash
claude mcp add ghostuser node /ABSOLUTE/PATH/TO/ghostuser/packages/mcp/dist/index.js
```

Set `ANTHROPIC_API_KEY` in your shell env.

### 4. Use

In any conversation:

> "Use ghostuser to simulate a Newbie trying to sign up. Screenshot is at /tmp/landing.png"

The persona walks through the screen and tells you what's confusing.

## License

MIT
