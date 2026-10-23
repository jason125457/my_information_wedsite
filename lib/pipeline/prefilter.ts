import type { NormalizedCandidate } from "@/lib/collectors/types";

export type PrefilterReason =
  | "duplicate_url"
  | "duplicate_external_id"
  | "invalid_title"
  | "stale_current"
  | "promotional";

/**
 * Deal posts, giveaways and sponsored content never fit "less, but better",
 * so they are dropped before any AI call. Phrases are specific on purpose:
 * a bare "deal" or "sale" would also match trade deals and asset sales.
 */
const promotionalPatterns = [
  /\bbest (?:\w+ )?deals?\b/i,
  /\bdeal alert\b/i,
  /\b\d{1,3}% off\b/i,
  /\b(?:coupon|promo code|discount code)s?\b/i,
  /\bgiveaway\b/i,
  /\bsponsored\b/i,
  /\b(?:black friday|cyber monday|prime day)\b/i,
  /優惠|折扣碼|特價|限時折扣|抽獎|業配|贊助內容/,
];

export interface PrefilterRejection {
  candidate: NormalizedCandidate;
  reason: PrefilterReason;
}

export interface PrefilterResult {
  accepted: NormalizedCandidate[];
  rejected: PrefilterRejection[];
}

export function prefilterCandidates(
  candidates: NormalizedCandidate[],
  now = new Date(),
): PrefilterResult {
  const accepted: NormalizedCandidate[] = [];
  const rejected: PrefilterRejection[] = [];
  const canonicalUrls = new Set<string>();
  const externalIds = new Set<string>();

  for (const candidate of candidates) {
    const reason = rejectionReason(candidate, canonicalUrls, externalIds, now);
    if (reason) {
      rejected.push({ candidate, reason });
      continue;
    }

    accepted.push(candidate);
    canonicalUrls.add(candidate.canonicalUrl);
    if (candidate.externalId) externalIds.add(externalKey(candidate));
  }

  return { accepted, rejected };
}

function rejectionReason(
  candidate: NormalizedCandidate,
  canonicalUrls: Set<string>,
  externalIds: Set<string>,
  now: Date,
): PrefilterReason | null {
  if (candidate.title.trim().length < 5) return "invalid_title";
  if (promotionalPatterns.some((pattern) => pattern.test(candidate.title))) return "promotional";
  if (canonicalUrls.has(candidate.canonicalUrl)) return "duplicate_url";
  if (candidate.externalId && externalIds.has(externalKey(candidate))) {
    return "duplicate_external_id";
  }

  if (!candidate.isDiscovery && candidate.publishedAt) {
    const publishedAt = new Date(candidate.publishedAt).valueOf();
    if (Number.isNaN(publishedAt) || now.valueOf() - publishedAt > 72 * 60 * 60 * 1000) {
      return "stale_current";
    }
  }

  return null;
}

function externalKey(candidate: NormalizedCandidate) {
  return `${candidate.sourceId}:${candidate.externalId}`;
}
