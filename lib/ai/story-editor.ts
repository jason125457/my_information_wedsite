import {
  classificationBatchSchema,
  duplicateDecisionSchema,
  summaryBatchSchema,
  type Classification,
  type DuplicateDecision,
  type StorySummary,
} from "@/lib/ai/schemas";
import type { AIModelConfig } from "@/lib/ai/config";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { classificationInstructions } from "@/prompts/classify";
import { dedupeInstructions } from "@/prompts/dedupe";
import { summaryInstructions } from "@/prompts/summarize";

export interface SummaryRequest {
  candidate: NormalizedCandidate;
  classification: Classification;
}

/**
 * Batch-oriented AI editor. Each batch is one model request, which keeps the
 * pipeline within the Gemini free tier's small daily request budget.
 * Results are aligned with the input order; a missing item is returned as null.
 */
export class StoryAIEditor {
  constructor(
    private readonly provider: StructuredAIProvider,
    private readonly models: AIModelConfig,
  ) {}

  async classifyMany(candidates: NormalizedCandidate[]): Promise<Array<Classification | null>> {
    const output = await this.provider.generate({
      model: this.models.fast,
      schemaName: "story_classification_batch",
      schema: classificationBatchSchema,
      instructions: classificationInstructions,
      input: JSON.stringify({
        items: candidates.map((candidate, index) => ({ index, ...serializeCandidate(candidate) })),
      }),
      maxOutputTokens: 200 * candidates.length + 500,
    });

    return alignByIndex(output.items, candidates.length);
  }

  async summarizeMany(requests: SummaryRequest[]): Promise<Array<StorySummary | null>> {
    const output = await this.provider.generate({
      model: this.models.quality,
      schemaName: "story_summary_batch",
      schema: summaryBatchSchema,
      instructions: summaryInstructions,
      input: JSON.stringify({
        items: requests.map(({ candidate, classification }, index) => ({
          index,
          ...serializeCandidate(candidate),
          classification,
        })),
      }),
      maxOutputTokens: 600 * requests.length + 500,
    });

    return alignByIndex(output.items, requests.length);
  }

  decideDuplicate(
    first: NormalizedCandidate,
    second: NormalizedCandidate,
  ): Promise<DuplicateDecision> {
    return this.provider.generate({
      model: this.models.quality,
      schemaName: "duplicate_decision",
      schema: duplicateDecisionSchema,
      instructions: dedupeInstructions,
      input: JSON.stringify({ item_a: serializeCandidate(first), item_b: serializeCandidate(second) }),
      maxOutputTokens: 400,
    });
  }
}

function alignByIndex<T extends { index: number }>(
  items: T[],
  length: number,
): Array<Omit<T, "index"> | null> {
  const aligned: Array<Omit<T, "index"> | null> = Array.from({ length }, () => null);
  for (const { index, ...item } of items) {
    if (index < length && aligned[index] === null) aligned[index] = item;
  }
  return aligned;
}

function serializeCandidate(candidate: NormalizedCandidate) {
  return {
    source_name: candidate.sourceName,
    source_type: candidate.sourceType,
    url: candidate.url,
    title: candidate.title,
    excerpt: candidate.excerpt?.slice(0, 1_500) ?? null,
    published_at: candidate.publishedAt,
    configured_topic: candidate.topic,
    configured_as_discovery: candidate.isDiscovery,
    engagement: candidate.engagement,
  };
}
