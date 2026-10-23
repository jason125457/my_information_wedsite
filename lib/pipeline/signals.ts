import type { Classification, EditorialJudgement } from "@/lib/ai/schemas";
import type { NormalizedCandidate, SourceReliability } from "@/lib/collectors/types";

/**
 * Turns the model's editorial judgement into a full classification by adding
 * the signals that follow from source metadata, so the model is never asked
 * for (and cannot hallucinate) them.
 */
export function completeClassification(
  judgement: EditorialJudgement,
  candidate: NormalizedCandidate,
  now: Date,
): Classification {
  return {
    ...judgement,
    content_type: candidate.isDiscovery ? "discovery" : "current",
    fact_status: factStatusFor(candidate.sourceReliability ?? "unknown"),
    freshness: freshnessScore(candidate, now),
    discussion_popularity: popularityScore(candidate),
  };
}

export function factStatusFor(reliability: SourceReliability): Classification["fact_status"] {
  switch (reliability) {
    case "official":
      return "official_confirmation";
    case "original_reporting":
    case "major_media":
    case "known_blog":
      return "reported";
    case "community":
    case "reddit":
      return "community_discussion";
    default:
      return "unknown";
  }
}

/** Current items decay over two days; evergreen discovery items stay neutral. */
export function freshnessScore(candidate: NormalizedCandidate, now: Date): number {
  if (candidate.isDiscovery || !candidate.publishedAt) return 3;
  const published = new Date(candidate.publishedAt).valueOf();
  if (Number.isNaN(published)) return 3;
  const hours = (now.valueOf() - published) / 3_600_000;
  if (hours <= 6) return 5;
  if (hours <= 12) return 4;
  if (hours <= 24) return 3;
  if (hours <= 48) return 2;
  return 1;
}

/** Uses engagement when the source reports it (Hacker News); neutral otherwise. */
export function popularityScore(candidate: NormalizedCandidate): number {
  const { score, commentCount } = candidate.engagement;
  if (score === undefined && commentCount === undefined) return 3;
  const signal = Math.max(score ?? 0, (commentCount ?? 0) * 2);
  if (signal >= 300) return 5;
  if (signal >= 150) return 4;
  if (signal >= 60) return 3;
  if (signal >= 20) return 2;
  return 1;
}
