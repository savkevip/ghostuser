#!/usr/bin/env node
// `npm run criteria` — manage ~/.ghostuser/criteria.md
//
// Usage:
//   npm run criteria              # open in $EDITOR (or default text app on macOS), creating with starter if missing
//   npm run criteria -- show      # print current content
//   npm run criteria -- path      # print just the path

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CRITERIA_PATH = join(homedir(), ".ghostuser", "criteria.md");

const STARTER = `# GhostUser Custom Evaluation Criteria

Write rules here that GhostUser will ALWAYS check on every test, on top of normal UX evaluation. The persona applies these rules and reports violations as bugs.

Edit freely. Delete the examples below and write your own rules. Save the file — your next test will use the new rules immediately.

---

## Example: Accessibility (WCAG AA)
- All images must have meaningful alt text
- Text contrast must meet 4.5:1 ratio
- Focus indicators must be visible on every interactive element
- Form fields must have visible labels (not just placeholders)

## Example: Brand voice
- Never use the word "users" — always "customers" or "members"
- Tone is professional but warm — no slang, no emojis in product copy
- CTAs must use action verbs ("Get started", not "Click here")

## Example: Async UI patience
- After clicking Submit/Send/Save, ALWAYS wait 1-2 seconds and check for a toast notification, modal popup, or success message before concluding success or failure.

## Example: Your industry (e.g. fintech)
- Any field collecting PII must have a privacy note nearby
- Risk warnings must be visible before users commit money
- Account numbers should be masked by default (show last 4 only)
`;

const cmd = process.argv[2] || "edit";

async function ensureExists() {
  try {
    await stat(CRITERIA_PATH);
    return true;
  } catch {
    await mkdir(dirname(CRITERIA_PATH), { recursive: true });
    await writeFile(CRITERIA_PATH, STARTER, "utf8");
    console.log(`✨ Created ${CRITERIA_PATH} with starter template.`);
    return false;
  }
}

if (cmd === "show") {
  try {
    const content = await readFile(CRITERIA_PATH, "utf8");
    console.log(content);
  } catch {
    console.log(
      `(${CRITERIA_PATH} doesn't exist yet — run \`npm run criteria\` to create it)`,
    );
  }
  process.exit(0);
}

if (cmd === "path") {
  console.log(CRITERIA_PATH);
  process.exit(0);
}

if (cmd === "edit" || !cmd) {
  await ensureExists();

  const editorEnv = process.env.VISUAL || process.env.EDITOR;
  const editor =
    editorEnv ||
    (process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "notepad"
        : "nano");

  const args =
    editor === "open" ? ["-Wt", CRITERIA_PATH] : [CRITERIA_PATH];

  console.log(`📝 Opening ${CRITERIA_PATH} (editor: ${editor})\n`);

  const child = spawn(editor, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    if (code === 0) {
      console.log(
        `\n✅ Saved. Next GhostUser test will apply the updated criteria.`,
      );
    }
    process.exit(code ?? 0);
  });
  child.on("error", (err) => {
    console.error(`❌ Could not launch editor "${editor}": ${err.message}`);
    console.error(`Set $EDITOR or open the file manually: ${CRITERIA_PATH}`);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error("Usage: npm run criteria [edit|show|path]");
  process.exit(1);
}
