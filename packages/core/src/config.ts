let configuredApiKey: string | undefined;

export interface InitOptions {
  apiKey: string;
}

/**
 * Configure ghostuser-core with your Anthropic API key.
 * Alternative to passing `apiKey` on every call or setting ANTHROPIC_API_KEY.
 *
 * Precedence (highest to lowest):
 *   1. `apiKey` passed in the call (e.g. simulate({ apiKey }))
 *   2. key set via `init(...)`
 *   3. process.env.ANTHROPIC_API_KEY
 */
export function init(apiKeyOrOptions: string | InitOptions): void {
  const key =
    typeof apiKeyOrOptions === "string"
      ? apiKeyOrOptions
      : apiKeyOrOptions.apiKey;
  if (!key) throw new Error("ghostuser-core: init() requires an apiKey");
  configuredApiKey = key;
}

/** Returns the API key resolved from explicit arg → init() → env. */
export function resolveApiKey(explicit?: string): string | undefined {
  return explicit ?? configuredApiKey ?? process.env.ANTHROPIC_API_KEY;
}

/** Test/teardown helper. Not part of the public API contract. */
export function resetConfig(): void {
  configuredApiKey = undefined;
}
