export interface AIModelConfig {
  fast: string;
  reasoning: string;
  search: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function getAIModelConfig(environment: Environment = process.env): AIModelConfig {
  return {
    fast: requireValue(environment.GEMINI_MODEL_FAST, "GEMINI_MODEL_FAST"),
    reasoning: requireValue(environment.GEMINI_MODEL_REASONING, "GEMINI_MODEL_REASONING"),
    search: requireValue(environment.GEMINI_MODEL_SEARCH, "GEMINI_MODEL_SEARCH"),
  };
}

export function getIngestionModelConfig(environment: Environment = process.env): Pick<AIModelConfig, "fast" | "reasoning"> {
  return {
    fast: requireValue(environment.GEMINI_MODEL_FAST, "GEMINI_MODEL_FAST"),
    reasoning: requireValue(environment.GEMINI_MODEL_REASONING, "GEMINI_MODEL_REASONING"),
  };
}

export function getGeminiApiKey(environment: Environment = process.env) {
  return requireValue(environment.GEMINI_API_KEY, "GEMINI_API_KEY");
}

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
