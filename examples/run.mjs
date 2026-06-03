#!/usr/bin/env node
// Real end-to-end test: call the core engine with a screenshot.
// Usage:
//   node examples/run.mjs <image-path> [personaId] [goal]
// Reads ANTHROPIC_API_KEY from .env or process.env.

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { simulate, listPersonas } from "../packages/core/dist/index.js";

// Tiny .env loader (no deps).
async function loadEnv() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env optional
  }
}

function inferMediaType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

await loadEnv();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not set. Put it in .env or export it.");
  process.exit(1);
}

const [, , imagePath, personaId = "newbie", ...goalParts] = process.argv;
const goal = goalParts.join(" ") || "Understand what this product does and decide whether to sign up";

if (!imagePath) {
  console.error("Usage: node examples/run.mjs <image-path> [personaId] [goal]");
  console.error("\nAvailable personas:");
  for (const p of listPersonas()) {
    console.error(`  ${p.id.padEnd(10)} — ${p.name} (${p.description})`);
  }
  process.exit(1);
}

const buffer = await readFile(resolve(imagePath));
console.log(`📸 Image: ${imagePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
console.log(`🎭 Persona: ${personaId}`);
console.log(`🎯 Goal: ${goal}\n`);
console.log("Calling Claude…\n");

const t0 = Date.now();
const result = await simulate({
  imageBase64: buffer.toString("base64"),
  imageMediaType: inferMediaType(imagePath),
  personaId,
  goal,
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const verdictEmoji =
  result.verdict === "passed" ? "✅" : result.verdict === "warning" ? "⚠️" : "❌";

console.log("=".repeat(60));
console.log(`${verdictEmoji} ${result.persona.name} — ${result.verdict.toUpperCase()}  (${elapsed}s)`);
console.log("=".repeat(60));
console.log("\n📝 Stream of thought:\n");
console.log(result.chainOfThought);
console.log("\n🐛 UX bugs found:\n");
if (result.bugs.length === 0) {
  console.log("  (none reported)");
} else {
  for (const [i, bug] of result.bugs.entries()) {
    console.log(`  ${i + 1}. [${bug.severity.toUpperCase()}] ${bug.description}`);
  }
}
console.log("");
