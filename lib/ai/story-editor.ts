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
      maxOutputTokens: 500,
    });
  }

  summarize(
    candidate: NormalizedCandidate,
    classification: Classification,
  ): Promise<StorySummary> {
    return this.provider.generate({
      model: this.models.fast,
      schemaName: "story_summary",
      schema: summarySchema,
      instructions: summaryInstructions,
      input: `${serializeCandidate(candidate)}\n\nCLASSIFICATION\n${JSON.stringify(classification)}`,
      maxOutputTokens: 700,
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
      maxOutputTokens: 400,
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
