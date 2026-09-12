import type { Classification, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import type { ContentTopic, NormalizedCandidate } from "@/lib/collectors/types";
import { compareCandidates } from "@/lib/dedupe";
import { calculateRanking, type FeedbackSignals, type RankingResult } from "@/lib/ranking";
import { prefilterCandidates, type PrefilterRejection } from "@/lib/pipeline/prefilter";
import { mapConcurrent } from "@/lib/pipeline/concurrency";

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
  completedCandidates: NormalizedCandidate[];
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
  classificationConcurrency?: number;
  summaryConcurrency?: number;
  classificationBatchSize?: number;
  maxSummaries?: number;
  maxDedupeReviews?: number;
}

export async function processCandidates(
  candidates: NormalizedCandidate[],
  editor: StoryAIEditor,
  options: ProcessingOptions = {},
): Promise<ProcessingResult> {
  const maximum = clampInteger(options.maxCandidates ?? 150, 1, 500);
  const minimumScore = clamp(options.minimumScore ?? 55, 0, 100);
  const classificationConcurrency = Math.max(1, options.classificationConcurrency ?? 5);
  const summaryConcurrency = Math.max(1, options.summaryConcurrency ?? 4);

  const prefiltered = prefilterCandidates(candidates.slice(0, maximum), options.now);
  const failures: ProcessingFailure[] = [];
  const ranked: RankedCandidate[] = [];

  const batchSize = clampInteger(options.classificationBatchSize ?? 1, 1, 8);
  const batches: NormalizedCandidate[][] = [];
  for (let index = 0; index < prefiltered.accepted.length; index += batchSize) {
    batches.push(prefiltered.accepted.slice(index, index + batchSize));
  }
  const classificationBatches = await mapConcurrent(
    batches,
    classificationConcurrency,
    async (batch) => {
      try {
        const classifications = batchSize === 1
          ? [await editor.classify(batch[0])]
          : await editor.classifyMany(batch);
        return batch.map((candidate, index) => {
          const classification = classifications[index];
          const primaryTopic = classification.topics[0] ?? candidate.topic;
          const ranking = calculateRanking({
            classification,
            primaryTopic,
            topicWeight: options.topicWeights?.[primaryTopic] ?? defaultTopicWeights[primaryTopic],
            feedback: options.feedbackFor?.(candidate),
          });
          return { success: true as const, candidate, classification, ranking };
        });
      } catch (error) {
        return batch.map((candidate) => ({
          success: false as const,
          failure: failure(candidate, "classification", error),
        }));
      }
    },
  );

  for (const item of classificationBatches.flat()) {
    if (item.success) {
      ranked.push({
        candidate: item.candidate,
        classification: item.classification,
        ranking: item.ranking,
      });
    } else {
      failures.push(item.failure);
    }
  }

  const aboveThreshold = ranked
    .filter((item) => item.ranking.finalScore >= minimumScore)
    .sort((first, second) => second.ranking.finalScore - first.ranking.finalScore);
  const groups: Array<RankedCandidate & { additionalSources: NormalizedCandidate[] }> = [];
  let aiDedupeReviews = 0;

  for (const item of aboveThreshold) {
    let matched = false;
    for (const group of groups) {
      const comparison = compareCandidates(group.candidate, item.candidate);
      if (comparison.match === "exact" || comparison.match === "likely") {
        group.additionalSources.push(item.candidate);
        matched = true;
        break;
      }
      if (comparison.requiresAIReview && aiDedupeReviews < (options.maxDedupeReviews ?? Infinity)) {
        aiDedupeReviews += 1;
        try {
          const decision = await editor.decideDuplicate(group.candidate, item.candidate);
          if (decision.same_event) {
            group.additionalSources.push(item.candidate);
            matched = true;
            break;
          }
        } catch (error) {
          failures.push(failure(item.candidate, "deduplication", error));
        }
      }
    }
    if (!matched) groups.push({ ...item, additionalSources: [] });
  }

  const stories: StoryDraft[] = [];
  const summaryResults = await mapConcurrent(
    groups.slice(0, options.maxSummaries ?? groups.length),
    summaryConcurrency,
    async (group) => {
      try {
        const summary = await editor.summarize(group.candidate, group.classification);
        return {
          success: true as const,
          story: {
            ...group,
            summary,
          },
        };
      } catch (error) {
        return {
          success: false as const,
          failure: failure(group.candidate, "summary", error),
        };
      }
    },
  );

  for (const item of summaryResults) {
    if (item.success) {
      stories.push(item.story);
    } else {
      failures.push(item.failure);
    }
  }

  return {
    stories,
    completedCandidates: [
      ...ranked.filter((item) => item.ranking.finalScore < minimumScore).map((item) => item.candidate),
      ...stories.flatMap((story) => [story.candidate, ...story.additionalSources]),
    ],
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

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.round(clamp(value, minimum, maximum));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
