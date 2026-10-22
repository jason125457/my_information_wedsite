export interface AIModelConfig {
  /** High-volume, low-cost model used for batch classification. */
  fast: string;
  /** Model used for summaries and ambiguous duplicate decisions. */
  quality: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function getAIModelConfig(environment: Environment = process.env): AIModelConfig {
  return {
    fast: requireValue(environment.GEMINI_MODEL_FAST, "GEMINI_MODEL_FAST"),
    quality: requireValue(environment.GEMINI_MODEL_QUALITY, "GEMINI_MODEL_QUALITY"),
  };
}

export function getGeminiApiKey(environment: Environment = process.env) {
  return requireValue(environment.GEMINI_API_KEY, "GEMINI_API_KEY");
}

/**
 * Minimum spacing between Gemini requests. The free tier enforces a low
 * requests-per-minute limit, so requests are serialized and paced.
 */
export function getGeminiMinIntervalMs(environment: Environment = process.env) {
  const parsed = Number(environment.GEMINI_MIN_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 6_000;
}

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
