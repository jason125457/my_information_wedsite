import { GeminiDailyQuotaError } from "@/lib/ai/provider";
import type { Classification, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import type { ContentTopic, NormalizedCandidate } from "@/lib/collectors/types";
import { compareCandidates } from "@/lib/dedupe";
import { calculateRanking, type FeedbackSignals, type RankingResult } from "@/lib/ranking";
import { prefilterCandidates, type PrefilterRejection } from "@/lib/pipeline/prefilter";

export const defaultTopicWeights: Record<ContentTopic, number> = {
  ai: 5,
  cybersecurity: 2,
  technology: 4,
  finance: 3,
  world: 4,
  music: 5,
  photography: 4,
};

interface RankedCandidate {
  candidate: NormalizedCandidate;
  classification: Classification;
  ranking: RankingResult;
}

export interface StoryDraft extends RankedCandidate {
  additionalSources: NormalizedCandidate[];
  summary: StorySummary;
}

export interface ProcessingFailure {
  sourceId: string;
  externalId: string | null;
  stage: "classification" | "deduplication" | "summary";
  errorMessage: string;
}

export interface ProcessingResult {
  stories: StoryDraft[];
  prefilterRejected: PrefilterRejection[];
  belowThresholdCount: number;
  failures: ProcessingFailure[];
}

export interface ProcessingOptions {
  minimumScore?: number;
  maxCandidates?: number;
  now?: Date;
  topicWeights?: Partial<Record<ContentTopic, number>>;
  feedbackFor?: (candidate: NormalizedCandidate) => FeedbackSignals;
  /** Candidates per classification request (one Gemini call per batch). */
  classificationBatchSize?: number;
  /** Stories per summary request. */
  summaryBatchSize?: number;
}

export async function processCandidates(
  candidates: NormalizedCandidate[],
  editor: StoryAIEditor,
  options: ProcessingOptions = {},
): Promise<ProcessingResult> {
  const maximum = clampInteger(options.maxCandidates ?? 150, 1, 500);
  const minimumScore = clamp(options.minimumScore ?? 55, 0, 100);
  const classificationBatchSize = clampInteger(options.classificationBatchSize ?? 25, 1, 50);
  const summaryBatchSize = clampInteger(options.summaryBatchSize ?? 8, 1, 20);

  const prefiltered = prefilterCandidates(candidates.slice(0, maximum), options.now);
  const failures: ProcessingFailure[] = [];
  const ranked: RankedCandidate[] = [];
  // Once the daily quota is gone every further call fails, so stop calling.
  let quotaError: GeminiDailyQuotaError | null = null;

  for (const batch of chunk(prefiltered.accepted, classificationBatchSize)) {
    let classifications: Array<Classification | null>;
    try {
      if (quotaError) throw quotaError;
      classifications = await editor.classifyMany(batch);
    } catch (error) {
      if (error instanceof GeminiDailyQuotaError) quotaError = error;
      failures.push(...batch.map((candidate) => failure(candidate, "classification", error)));
      continue;
    }

    batch.forEach((candidate, index) => {
      const classification = classifications[index];
      if (!classification) {
        failures.push(failure(candidate, "classification", new Error("Missing from batch output.")));
        return;
      }
      const primaryTopic = classification.topics[0] ?? candidate.topic;
      const ranking = calculateRanking({
        classification,
        primaryTopic,
        topicWeight: options.topicWeights?.[primaryTopic] ?? defaultTopicWeights[primaryTopic],
        feedback: options.feedbackFor?.(candidate),
      });
      ranked.push({ candidate, classification, ranking });
    });
  }

  const aboveThreshold = ranked
    .filter((item) => item.ranking.finalScore >= minimumScore)
    .sort((first, second) => second.ranking.finalScore - first.ranking.finalScore);
  const groups: Array<RankedCandidate & { additionalSources: NormalizedCandidate[] }> = [];

  for (const item of aboveThreshold) {
    let matched = false;
    for (const group of groups) {
      const comparison = compareCandidates(group.candidate, item.candidate);
      if (comparison.match === "exact" || comparison.match === "likely") {
        group.additionalSources.push(item.candidate);
        matched = true;
        break;
      }
      if (comparison.requiresAIReview && !quotaError) {
        try {
          const decision = await editor.decideDuplicate(group.candidate, item.candidate);
          if (decision.same_event) {
            group.additionalSources.push(item.candidate);
            matched = true;
            break;
          }
        } catch (error) {
          if (error instanceof GeminiDailyQuotaError) quotaError = error;
          failures.push(failure(item.candidate, "deduplication", error));
        }
      }
    }
    if (!matched) groups.push({ ...item, additionalSources: [] });
  }

  const stories: StoryDraft[] = [];
  for (const batch of chunk(groups, summaryBatchSize)) {
    let summaries: Array<StorySummary | null>;
    try {
      if (quotaError) throw quotaError;
      summaries = await editor.summarizeMany(batch);
    } catch (error) {
      if (error instanceof GeminiDailyQuotaError) quotaError = error;
      failures.push(...batch.map((group) => failure(group.candidate, "summary", error)));
      continue;
    }

    batch.forEach((group, index) => {
      const summary = summaries[index];
      if (summary) {
        stories.push({ ...group, summary });
      } else {
        failures.push(failure(group.candidate, "summary", new Error("Missing from batch output.")));
      }
    });
  }

  return {
    stories,
    prefilterRejected: prefiltered.rejected,
    belowThresholdCount: ranked.length - aboveThreshold.length,
    failures,
  };
}

function failure(
  candidate: NormalizedCandidate,
  stage: ProcessingFailure["stage"],
  error: unknown,
): ProcessingFailure {
  return {
    sourceId: candidate.sourceId,
    externalId: candidate.externalId,
    stage,
    errorMessage: error instanceof Error ? error.message : "Unknown AI processing error.",
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.round(clamp(value, minimum, maximum));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
