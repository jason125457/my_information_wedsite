import { GeminiDailyQuotaError } from "@/lib/ai/provider";
import type { Classification, EditorialJudgement, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import type { ContentTopic, NormalizedCandidate } from "@/lib/collectors/types";
import { compareCandidates } from "@/lib/dedupe";
import { calculateRanking, type FeedbackSignals, type RankingResult } from "@/lib/ranking";
import { prefilterCandidates, type PrefilterRejection } from "@/lib/pipeline/prefilter";
import { completeClassification } from "@/lib/pipeline/signals";

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
  /** Most stories one run may create; the rest are evaluated but not kept. */
  maxStories?: number;
  /** Most stories per topic in one run, so no single topic floods the feed. */
  maxPerTopic?: number;
  /** Most new stories one source may contribute per run. */
  maxPerSource?: number;
}

export async function processCandidates(
  candidates: NormalizedCandidate[],
  editor: StoryAIEditor,
  options: ProcessingOptions = {},
): Promise<ProcessingResult> {
  const maximum = clampInteger(options.maxCandidates ?? 150, 1, 500);
  const minimumScore = clamp(options.minimumScore ?? 60, 0, 100);
  const classificationBatchSize = clampInteger(options.classificationBatchSize ?? 40, 1, 50);
  const summaryBatchSize = clampInteger(options.summaryBatchSize ?? 8, 1, 20);
  const maxStories = clampInteger(options.maxStories ?? 10, 1, 200);
  const maxPerTopic = clampInteger(options.maxPerTopic ?? 3, 1, 200);
  const maxPerSource = clampInteger(options.maxPerSource ?? 2, 1, 200);
  const now = options.now ?? new Date();

  const prefiltered = prefilterCandidates(candidates.slice(0, maximum), now);
  const failures: ProcessingFailure[] = [];
  const ranked: RankedCandidate[] = [];
  // Once the daily quota is gone every further call fails, so stop calling.
  let quotaError: GeminiDailyQuotaError | null = null;

  for (const batch of chunk(prefiltered.accepted, classificationBatchSize)) {
    let judgements: Array<EditorialJudgement | null>;
    try {
      if (quotaError) throw quotaError;
      judgements = await editor.classifyMany(batch);
    } catch (error) {
      if (error instanceof GeminiDailyQuotaError) quotaError = error;
      failures.push(...batch.map((candidate) => failure(candidate, "classification", error)));
      continue;
    }

    batch.forEach((candidate, index) => {
      const judgement = judgements[index];
      if (!judgement) {
        failures.push(failure(candidate, "classification", new Error("Missing from batch output.")));
        return;
      }
      const classification = completeClassification(judgement, candidate, now);
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
  // Walk candidates best-first. Each either joins an already selected story as
  // another source, or becomes a new story while the run and its topic still
  // have room. Strong candidates beyond the caps are evaluated but not kept.
  const groups: Array<RankedCandidate & { additionalSources: NormalizedCandidate[] }> = [];
  const perTopic = new Map<string, number>();
  const perSource = new Map<string, number>();

  for (const item of aboveThreshold) {
    const topic = item.classification.topics[0] ?? item.candidate.topic;
    const source = item.candidate.sourceId;
    const hasRoom =
      groups.length < maxStories &&
      (perTopic.get(topic) ?? 0) < maxPerTopic &&
      (perSource.get(source) ?? 0) < maxPerSource;
    let matched = false;
    for (const group of groups) {
      const comparison = compareCandidates(group.candidate, item.candidate);
      if (comparison.match === "exact" || comparison.match === "likely") {
        group.additionalSources.push(item.candidate);
        matched = true;
        break;
      }
      // An AI duplicate check only pays off when the item could be selected.
      if (comparison.requiresAIReview && hasRoom && !quotaError) {
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
    if (matched || !hasRoom) continue;
    groups.push({ ...item, additionalSources: [] });
    perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
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

  // The model occasionally copies an English headline instead of translating
  // it. Re-ask once for just those stories; keep the first answer if the retry
  // fails or is still untranslated, since a story beats no story.
  const untranslated = stories.filter((story) => !hasChinese(story.summary.title));
  if (untranslated.length && !quotaError) {
    try {
      const retried = await editor.summarizeMany(untranslated);
      untranslated.forEach((story, index) => {
        const summary = retried[index];
        if (summary && hasChinese(summary.title)) story.summary = summary;
      });
    } catch (error) {
      if (error instanceof GeminiDailyQuotaError) quotaError = error;
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

function hasChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
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
