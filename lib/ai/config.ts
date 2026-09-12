export interface AIModelConfig {
  fast: string;
  reasoning: string;
  search: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function getAIModelConfig(environment: Environment = process.env): AIModelConfig {
  return {
    fast: requireValue(environment.OPENAI_MODEL_FAST, "OPENAI_MODEL_FAST"),
    reasoning: requireValue(environment.OPENAI_MODEL_REASONING, "OPENAI_MODEL_REASONING"),
    search: requireValue(environment.OPENAI_MODEL_SEARCH, "OPENAI_MODEL_SEARCH"),
  };
}

export function getIngestionModelConfig(environment: Environment = process.env): Pick<AIModelConfig, "fast" | "reasoning"> {
  return {
    fast: requireValue(environment.OPENAI_MODEL_FAST, "OPENAI_MODEL_FAST"),
    reasoning: requireValue(environment.OPENAI_MODEL_REASONING, "OPENAI_MODEL_REASONING"),
  };
}

export function getOpenAIApiKey(environment: Environment = process.env) {
  return requireValue(environment.OPENAI_API_KEY, "OPENAI_API_KEY");
}

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
