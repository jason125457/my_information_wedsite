import { ApiError, GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";

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

interface GeminiProviderOptions {
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Thrown when the free-tier daily quota is exhausted; retrying is pointless until reset. */
export class GeminiDailyQuotaError extends Error {
  constructor(message: string) {
    super(`Gemini daily quota exhausted: ${message}`);
    this.name = "GeminiDailyQuotaError";
  }
}

export class GeminiProvider implements StructuredAIProvider {
  private readonly client: GoogleGenAI;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private gate: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(apiKey: string, options: GeminiProviderOptions = {}) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for AI processing.");
    this.client = new GoogleGenAI({ apiKey });
    this.minIntervalMs = options.minIntervalMs ?? 6_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async generate<T>(request: StructuredGenerationRequest<T>) {
    const responseJsonSchema = toGeminiJsonSchema(request.schema);

    for (let attempt = 0; ; attempt += 1) {
      await this.waitForTurn();
      try {
        const response = await this.client.models.generateContent({
          model: request.model,
          contents: request.input,
          config: {
            systemInstruction: request.instructions,
            responseMimeType: "application/json",
            responseJsonSchema,
            maxOutputTokens: request.maxOutputTokens,
            temperature: 0.2,
          },
        });

        const text = response.text;
        if (!text) throw new Error(`Gemini returned no ${request.schemaName} output.`);
        return request.schema.parse(JSON.parse(text));
      } catch (error) {
        const retryDelay = retryDelayFor(error, attempt);
        if (retryDelay === null || attempt >= this.maxRetries) throw error;
        await this.sleep(retryDelay);
      }
    }
  }

  /** Serializes requests and keeps at least `minIntervalMs` between them. */
  private waitForTurn() {
    const turn = this.gate.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = Date.now();
    });
    this.gate = turn.catch(() => undefined);
    return turn;
  }
}

function toGeminiJsonSchema(schema: ZodType) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Returns a delay in ms when the error is worth retrying, otherwise null. */
export function retryDelayFor(error: unknown, attempt: number): number | null {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 429) {
    if (/per\s*day|PerDay/i.test(error.message)) {
      throw new GeminiDailyQuotaError(error.message);
    }
    const suggested = error.message.match(/retry(?:Delay)?["\s:]+(?:in\s+)?"?(\d+(?:\.\d+)?)s/i);
    return suggested ? Math.ceil(Number(suggested[1]) * 1000) + 1_000 : 30_000 * (attempt + 1);
  }

  if (error.status >= 500) return 10_000 * (attempt + 1);
  return null;
}
