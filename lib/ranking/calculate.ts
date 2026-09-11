import type { ContentTopic } from "@/lib/collectors/types";
import type { FeedbackSignals, RankingInput, RankingResult } from "@/lib/ranking/types";

type ScoreKey =
  | "interest_relevance"
  | "information_value"
  | "importance"
  | "freshness"
  | "discussion_popularity"
  | "discovery_value";

type WeightProfile = Record<ScoreKey, number>;

const profiles: Record<ContentTopic, WeightProfile> = {
  ai: profile(0.3, 0.25, 0.15, 0.15, 0.05, 0.1),
  cybersecurity: profile(0.2, 0.25, 0.25, 0.2, 0.05, 0.05),
  technology: profile(0.25, 0.25, 0.15, 0.15, 0.1, 0.1),
  finance: profile(0.2, 0.3, 0.25, 0.2, 0.03, 0.02),
  world: profile(0.15, 0.2, 0.3, 0.25, 0.05, 0.05),
  music: profile(0.3, 0.15, 0.05, 0.05, 0.1, 0.35),
  photography: profile(0.25, 0.15, 0.05, 0.05, 0.05, 0.45),
};

export function calculateRanking(input: RankingInput): RankingResult {
  const topicWeight = clamp(Math.round(input.topicWeight), 1, 5);
  const weights = profiles[input.primaryTopic];
  const baseScore = scoreKeys.reduce(
    (total, key) => total + input.classification[key] * weights[key] * 20,
    0,
  );
  const topicMultiplier = 0.8 + (topicWeight - 1) * 0.1;
  const feedbackAdjustment = calculateFeedbackAdjustment(input.feedback ?? {});
  const finalScore = clamp(baseScore * topicMultiplier + feedbackAdjustment, 0, 100);

  return {
    baseScore: round(baseScore),
    topicMultiplier: round(topicMultiplier),
    feedbackAdjustment: round(feedbackAdjustment),
    finalScore: round(finalScore),
  };
}

export function calculateFeedbackAdjustment(feedback: FeedbackSignals) {
  const positive =
    clampCount(feedback.savedSimilarCount) * 2 + clampCount(feedback.readSimilarCount) * 0.4;
  const negative =
    clampCount(feedback.topicNotInterestingCount) * 3 +
    clampCount(feedback.lowValueCount) * 2.5 +
    clampCount(feedback.tooTechnicalCount) * 1.5 +
    clampCount(feedback.alreadyKnewCount) * 0.75 +
    clampCount(feedback.poorSourceCount) * 2.5 +
    clampCount(feedback.blockedTypeCount) * 4;

  return clamp(positive - negative, -25, 15);
}

export function getWeightProfile(topic: ContentTopic): Readonly<WeightProfile> {
  return profiles[topic];
}

const scoreKeys: ScoreKey[] = [
  "interest_relevance",
  "information_value",
  "importance",
  "freshness",
  "discussion_popularity",
  "discovery_value",
];

function profile(
  interest_relevance: number,
  information_value: number,
  importance: number,
  freshness: number,
  discussion_popularity: number,
  discovery_value: number,
): WeightProfile {
  return {
    interest_relevance,
    information_value,
    importance,
    freshness,
    discussion_popularity,
    discovery_value,
  };
}

function clampCount(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return 0;
  return clamp(Math.floor(value), 0, 10);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
