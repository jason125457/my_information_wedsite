import { z } from "zod";

export const topicSchema = z.enum([
  "ai",
  "cybersecurity",
  "technology",
  "finance",
  "world",
  "music",
  "photography",
]);

const scoreSchema = z.number().int().min(1).max(5);
const indexSchema = z.number().int().min(0);

export const classificationSchema = z.object({
  topics: z.array(topicSchema).min(1).max(3),
  interest_relevance: scoreSchema,
  information_value: scoreSchema,
  importance: scoreSchema,
  freshness: scoreSchema,
  discussion_popularity: scoreSchema,
  discovery_value: scoreSchema,
  content_type: z.enum(["current", "discovery"]),
  fact_status: z.enum([
    "official_confirmation",
    "reported",
    "community_discussion",
    "unknown",
  ]),
});

export const summarySchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1_200),
  why_recommended: z.string().trim().min(1).max(400),
});

export const duplicateDecisionSchema = z.object({
  same_event: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
});

/**
 * The part of a classification only a language model can judge. Content type,
 * fact status, freshness and discussion popularity are derived in code from
 * source metadata (see lib/pipeline/signals.ts).
 */
export const editorialJudgementSchema = classificationSchema.pick({
  topics: true,
  interest_relevance: true,
  information_value: true,
  importance: true,
  discovery_value: true,
});

export const classificationBatchSchema = z.object({
  items: z.array(editorialJudgementSchema.extend({ index: indexSchema })),
});

export const summaryBatchSchema = z.object({
  items: z.array(summarySchema.extend({ index: indexSchema })),
});

export const weeklySummarySchema = z.object({
  summary: z.string().trim().min(1).max(1_000),
});

export type Classification = z.infer<typeof classificationSchema>;
export type EditorialJudgement = z.infer<typeof editorialJudgementSchema>;
export type StorySummary = z.infer<typeof summarySchema>;
export type DuplicateDecision = z.infer<typeof duplicateDecisionSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
