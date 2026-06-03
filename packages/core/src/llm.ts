/**
 * Helpers around the Anthropic SDK:
 *  - retry with exponential backoff for transient errors
 *  - extractToolInput for getting the structured payload from a tool_use response
 */

import type Anthropic from "@anthropic-ai/sdk";

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Called for each failed attempt before sleeping. */
  onAttemptFailed?: (
    attempt: number,
    error: unknown,
    nextDelayMs: number,
  ) => void;
}

/** Should we retry given this error? Transient = network, 429, 5xx. */
function isRetriable(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  if (e?.code === "ECONNRESET") return true;
  if (e?.code === "ETIMEDOUT") return true;
  if (e?.code === "ENOTFOUND") return true;
  if (typeof e?.status === "number") {
    if (e.status === 429) return true;
    if (e.status >= 500 && e.status < 600) return true;
  }
  return false;
}

/** Wrap an async API call with exponential backoff retries. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 1500;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetriable(err)) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      options.onAttemptFailed?.(attempt, err, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Find the tool_use block in an Anthropic message and return its input as a typed object.
 * Throws if the model didn't emit a tool_use block (which means tool_choice was wrong
 * or the API behavior changed).
 */
export function extractToolInput<T>(
  message: Anthropic.Messages.Message,
  toolName: string,
): T {
  const block = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === toolName,
  );
  if (!block) {
    throw new Error(
      `Model did not call the expected tool "${toolName}". stop_reason=${message.stop_reason}`,
    );
  }
  return block.input as T;
}
