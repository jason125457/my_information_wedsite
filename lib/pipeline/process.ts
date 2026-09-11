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
}

export async function processCandidates(
  candidates: NormalizedCandidate[],
  editor: StoryAIEditor,
  options: ProcessingOptions = {},
): Promise<ProcessingResult> {
  const maximum = clampInteger(options.maxCandidates ?? 150, 1, 500);
  const minimumScore = clamp(options.minimumScore ?? 55, 0, 100);
  const prefiltered = prefilterCandidates(candidates.slice(0, maximum), options.now);
  const failures: ProcessingFailure[] = [];
  const ranked: RankedCandidate[] = [];

  for (const candidate of prefiltered.accepted) {
    try {
      const classification = await editor.classify(candidate);
      const primaryTopic = classification.topics[0] ?? candidate.topic;
      const ranking = calculateRanking({
        classification,
        primaryTopic,
        topicWeight: options.topicWeights?.[primaryTopic] ?? defaultTopicWeights[primaryTopic],
        feedback: options.feedbackFor?.(candidate),
      });
      ranked.push({ candidate, classification, ranking });
    } catch (error) {
      failures.push(failure(candidate, "classification", error));
    }
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
      if (comparison.requiresAIReview) {
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
  for (const group of groups) {
    try {
      stories.push({
        ...group,
        summary: await editor.summarize(group.candidate, group.classification),
      });
    } catch (error) {
      failures.push(failure(group.candidate, "summary", error));
    }
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

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.round(clamp(value, minimum, maximum));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
