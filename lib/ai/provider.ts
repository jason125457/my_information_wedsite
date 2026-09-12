import type { ZodType } from "zod";

export interface StructuredGenerationRequest<T> {
  model: string;
  schemaName: string;
  schema: ZodType<T>;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}

export interface StructuredAIProvider {
  generate<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}

type JsonSchema = Record<string, unknown>;
const score: JsonSchema = { type: "integer", minimum: 1, maximum: 5 };
const classification: JsonSchema = {
  type: "object",
  properties: {
    topics: { type: "array", items: { type: "string", enum: ["ai", "cybersecurity", "technology", "finance", "world", "music", "photography"] }, minItems: 1, maxItems: 3 },
    interest_relevance: score,
    information_value: score,
    importance: score,
    freshness: score,
    discussion_popularity: score,
    discovery_value: score,
    content_type: { type: "string", enum: ["current", "discovery"] },
    fact_status: { type: "string", enum: ["official_confirmation", "reported", "community_discussion", "unknown"] },
  },
  required: ["topics", "interest_relevance", "information_value", "importance", "freshness", "discussion_popularity", "discovery_value", "content_type", "fact_status"],
};

const schemas: Record<string, JsonSchema> = {
  story_classification: classification,
  story_classification_batch: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: { type: "object", properties: { index: { type: "integer" }, classification }, required: ["index", "classification"] },
      },
    },
    required: ["results"],
  },
  story_summary: {
    type: "object",
    properties: { title: { type: "string" }, summary: { type: "string" }, why_recommended: { type: "string" } },
    required: ["title", "summary", "why_recommended"],
  },
  duplicate_decision: {
    type: "object",
    properties: { same_event: { type: "boolean" }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" } },
    required: ["same_event", "confidence", "reason"],
  },
};

export interface GeminiProviderOptions {
  fetchImplementation?: typeof fetch;
  requestsPerMinute?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

/** Stateless Gemini Interactions API adapter with a per-model start-rate limit. */
export class GeminiInteractionsProvider implements StructuredAIProvider {
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly nextStartByModel = new Map<string, number>();

  constructor(private readonly apiKey: string, options: GeminiProviderOptions = {}) {
    if (!apiKey.trim()) throw new Error("GEMINI_API_KEY is required for AI processing.");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.intervalMs = Math.ceil(60_000 / (options.requestsPerMinute ?? 14));
  }

  async generate<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    const jsonSchema = schemas[request.schemaName];
    if (!jsonSchema) throw new Error(`Unsupported Gemini output schema: ${request.schemaName}`);
    if (!/^[a-zA-Z0-9._-]+$/.test(request.model)) throw new Error("Invalid Gemini model name.");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.waitForModelSlot(request.model);
      const response = await this.fetchImplementation("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          model: request.model,
          store: false,
          system_instruction: request.instructions,
          input: request.input,
          response_format: { type: "text", mime_type: "application/json", schema: jsonSchema },
          generation_config: request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : undefined,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 && attempt === 0) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15_000) : 5_000);
        continue;
      }
      if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
      const body: unknown = await response.json();
      return request.schema.parse(JSON.parse(extractOutputText(body)));
    }
    throw new Error("Gemini request could not be completed.");
  }

  private async waitForModelSlot(model: string) {
    const now = this.now();
    const start = Math.max(now, this.nextStartByModel.get(model) ?? now);
    this.nextStartByModel.set(model, start + this.intervalMs);
    if (start > now) await this.sleep(start - now);
  }
}

export function extractOutputText(body: unknown): string {
  if (!body || typeof body !== "object") throw new Error("Gemini returned an invalid response.");
  const result = body as { status?: unknown; steps?: unknown };
  if (result.status !== "completed" || !Array.isArray(result.steps)) {
    throw new Error("Gemini did not complete the response.");
  }
  const texts: string[] = [];
  for (const step of result.steps) {
    if (!step || typeof step !== "object" || (step as { type?: unknown }).type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string") {
        texts.push((part as { text: string }).text);
      }
    }
  }
  const output = texts.join("").trim();
  if (!output) throw new Error("Gemini returned no text output.");
  return output;
}
