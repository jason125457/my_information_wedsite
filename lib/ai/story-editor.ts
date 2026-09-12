import {
  classificationSchema,
  duplicateDecisionSchema,
  summarySchema,
  type Classification,
  type DuplicateDecision,
  type StorySummary,
} from "@/lib/ai/schemas";
import type { AIModelConfig } from "@/lib/ai/config";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { z } from "zod";
import { classificationInstructions } from "@/prompts/classify";
import { dedupeInstructions } from "@/prompts/dedupe";
import { summaryInstructions } from "@/prompts/summarize";

export class StoryAIEditor {
  constructor(
    private readonly provider: StructuredAIProvider,
    private readonly models: Pick<AIModelConfig, "fast" | "reasoning">,
  ) {}

  classify(candidate: NormalizedCandidate): Promise<Classification> {
    return this.provider.generate({
      model: this.models.fast,
      schemaName: "story_classification",
      schema: classificationSchema,
      instructions: classificationInstructions,
      input: serializeCandidate(candidate),
      maxOutputTokens: 1_024,
    });
  }

  async classifyMany(candidates: NormalizedCandidate[]): Promise<Classification[]> {
    if (candidates.length === 0) return [];
    if (candidates.length === 1) return [await this.classify(candidates[0])];
    const batchSchema = z.object({
      results: z.array(z.object({ index: z.number().int(), classification: classificationSchema })),
    });
    const response = await this.provider.generate({
      model: this.models.fast,
      schemaName: "story_classification_batch",
      schema: batchSchema,
      instructions: `${classificationInstructions}\nClassify each numbered item independently. Return exactly one result for every index.`,
      input: JSON.stringify(candidates.map((candidate, index) => ({ index, item: JSON.parse(serializeCandidate(candidate)) }))),
      maxOutputTokens: 3_000,
    });
    if (response.results.length !== candidates.length) throw new Error("Gemini batch classification count mismatch.");
    const byIndex = new Map<number, Classification>();
    for (const result of response.results) {
      if (result.index < 0 || result.index >= candidates.length || byIndex.has(result.index)) {
        throw new Error("Gemini batch classification indices are invalid.");
      }
      byIndex.set(result.index, result.classification);
    }
    return candidates.map((_, index) => byIndex.get(index)!);
  }

  summarize(
    candidate: NormalizedCandidate,
    classification: Classification,
  ): Promise<StorySummary> {
    return this.provider.generate({
      model: this.models.reasoning,
      schemaName: "story_summary",
      schema: summarySchema,
      instructions: summaryInstructions,
      input: `${serializeCandidate(candidate)}\n\nCLASSIFICATION\n${JSON.stringify(classification)}`,
      maxOutputTokens: 1_024,
    });
  }

  decideDuplicate(
    first: NormalizedCandidate,
    second: NormalizedCandidate,
  ): Promise<DuplicateDecision> {
    return this.provider.generate({
      model: this.models.reasoning,
      schemaName: "duplicate_decision",
      schema: duplicateDecisionSchema,
      instructions: dedupeInstructions,
      input: `ITEM A\n${serializeCandidate(first)}\n\nITEM B\n${serializeCandidate(second)}`,
      maxOutputTokens: 1_024,
    });
  }
}

function serializeCandidate(candidate: NormalizedCandidate) {
  return JSON.stringify({
    source_name: candidate.sourceName,
    source_type: candidate.sourceType,
    url: candidate.url,
    title: candidate.title,
    excerpt: candidate.excerpt?.slice(0, 3_000) ?? null,
    published_at: candidate.publishedAt,
    configured_topic: candidate.topic,
    configured_as_discovery: candidate.isDiscovery,
    engagement: candidate.engagement,
  });
}
