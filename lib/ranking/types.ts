import type { Classification } from "@/lib/ai/schemas";
import type { ContentTopic } from "@/lib/collectors/types";

export interface FeedbackSignals {
  savedSimilarCount?: number;
  readSimilarCount?: number;
  topicNotInterestingCount?: number;
  lowValueCount?: number;
  tooTechnicalCount?: number;
  alreadyKnewCount?: number;
  poorSourceCount?: number;
  blockedTypeCount?: number;
}

export interface RankingInput {
  classification: Classification;
  primaryTopic: ContentTopic;
  topicWeight: number;
  feedback?: FeedbackSignals;
}

export interface RankingResult {
  baseScore: number;
  topicMultiplier: number;
  feedbackAdjustment: number;
  finalScore: number;
}
