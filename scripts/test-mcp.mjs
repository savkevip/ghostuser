#!/usr/bin/env node
// Smoke test: spawn MCP server, do JSON-RPC handshake, list tools, call list_personas + start_guided_test.
// Does NOT require an Anthropic API key.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "..", "packages", "mcp", "dist", "index.js");

const proc = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const responses = [];

proc.stdout.on("data", (data) => {
  buffer += data.toString();
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      try {
        responses.push(JSON.parse(line));
      } catch {
        console.error("Non-JSON line:", line);
      }
    }
  }
});

function send(message) {
  proc.stdin.write(JSON.stringify(message) + "\n");
}

function waitForId(id, timeoutMs = 3000) {
  return new Promise((resolveP, rejectP) => {
    const start = Date.now();
    const tick = () => {
      const found = responses.find((r) => r.id === id);
      if (found) return resolveP(found);
      if (Date.now() - start > timeoutMs)
        return rejectP(new Error(`Timeout waiting for response ${id}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ghostuser-smoke-test", version: "0.1.0" },
  },
});

const initResp = await waitForId(1);
if (!initResp.result?.serverInfo) {
  console.error("❌ FAIL: bad initialize response");
  proc.kill();
  process.exit(1);
}
console.log(
  `✅ initialize — server ${initResp.result.serverInfo.name}@${initResp.result.serverInfo.version}`,
);

send({ jsonrpc: "2.0", method: "notifications/initialized" });

send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const toolsResp = await waitForId(2);
const toolNames = toolsResp.result?.tools?.map((t) => t.name) ?? [];
const expectedTools = [
  "start_guided_test",
  "list_personas",
  "create_persona",
  "run_agent_test",
  "simulate_screenshot",
  "show_criteria_path",
];
const missingTools = expectedTools.filter((t) => !toolNames.includes(t));
if (missingTools.length > 0) {
  console.error("❌ FAIL: missing tools:", missingTools);
  console.error("Got:", toolNames);
  proc.kill();
  process.exit(1);
}
console.log(`✅ tools/list — exposes ${toolNames.length} tools: ${toolNames.join(", ")}`);

send({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "list_personas", arguments: {} },
});
const callResp = await waitForId(3);
const textContent = callResp.result?.content?.[0]?.text;
if (!textContent) {
  console.error("❌ FAIL: no content in list_personas response");
  proc.kill();
  process.exit(1);
}
let personas;
try {
  personas = JSON.parse(textContent);
} catch {
  console.error("❌ FAIL: could not parse list_personas output:", textContent);
  proc.kill();
  process.exit(1);
}
const personaIds = personas.map((p) => p.id);
const expectedIds = ["newbie", "buyer", "power", "skeptic", "hurried"];
const missing = expectedIds.filter((id) => !personaIds.includes(id));
if (missing.length > 0) {
  console.error("❌ FAIL: missing personas:", missing);
  proc.kill();
  process.exit(1);
}
console.log(`✅ tools/call list_personas — got: ${personaIds.join(", ")}`);

send({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: { name: "start_guided_test", arguments: {} },
});
const guidedResp = await waitForId(4);
const guidedText = guidedResp.result?.content?.[0]?.text;
if (!guidedText || !guidedText.includes("Step 1")) {
  console.error("❌ FAIL: start_guided_test did not return guided flow");
  proc.kill();
  process.exit(1);
}
console.log(
  `✅ tools/call start_guided_test — returned guided flow (${guidedText.length} chars)`,
);

send({
  jsonrpc: "2.0",
  id: 5,
  method: "tools/call",
  params: { name: "show_criteria_path", arguments: {} },
});
const criteriaResp = await waitForId(5);
const criteriaText = criteriaResp.result?.content?.[0]?.text;
if (!criteriaText || !criteriaText.includes(".ghostuser")) {
  console.error("❌ FAIL: show_criteria_path missing path info");
  proc.kill();
  process.exit(1);
}
console.log(`✅ tools/call show_criteria_path — returned criteria info`);

proc.kill();
console.log("\n🎉 All MCP smoke tests passed.");
