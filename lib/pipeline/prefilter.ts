import type { NormalizedCandidate } from "@/lib/collectors/types";

export type PrefilterReason =
  | "duplicate_url"
  | "duplicate_external_id"
  | "invalid_title"
  | "stale_current";

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
