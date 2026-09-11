import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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

export class OpenAIResponsesProvider implements StructuredAIProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for AI processing.");
    this.client = new OpenAI({ apiKey });
  }

  async generate<T>(request: StructuredGenerationRequest<T>) {
    const response = await this.client.responses.parse({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      store: false,
      text: {
        format: zodTextFormat(request.schema, request.schemaName),
      },
    });

    if (!response.output_parsed) {
      throw new Error(`OpenAI returned no parsed ${request.schemaName} output.`);
    }

    return request.schema.parse(response.output_parsed);
  }
}
