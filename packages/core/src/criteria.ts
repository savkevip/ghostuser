import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CRITERIA_PATH = join(homedir(), ".ghostuser", "criteria.md");

/**
 * Load user's custom evaluation criteria from ~/.ghostuser/criteria.md.
 * Returns null if the file doesn't exist or is empty.
 *
 * Users write things like:
 *   - WCAG accessibility checks (alt text, color contrast)
 *   - Brand voice rules ("never say 'users', always 'customers'")
 *   - Industry-specific concerns (KYC compliance for fintech)
 */
export async function loadCriteria(): Promise<string | null> {
  try {
    const content = await readFile(CRITERIA_PATH, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
