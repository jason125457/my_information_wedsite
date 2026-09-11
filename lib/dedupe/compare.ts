import type { NormalizedCandidate } from "@/lib/collectors/types";

export type DedupeMatch = "exact" | "likely" | "ambiguous" | "distinct";

export interface DedupeComparison {
  match: DedupeMatch;
  similarity: number;
  reason: "canonical_url" | "source_external_id" | "title_similarity" | "different_items";
  requiresAIReview: boolean;
}

export function compareCandidates(
  first: NormalizedCandidate,
  second: NormalizedCandidate,
): DedupeComparison {
  if (first.canonicalUrl === second.canonicalUrl) {
    return result("exact", 1, "canonical_url");
  }

  if (
    first.sourceId === second.sourceId &&
    first.externalId &&
    first.externalId === second.externalId
  ) {
    return result("exact", 1, "source_external_id");
  }

  if (!withinEventWindow(first.publishedAt, second.publishedAt)) {
    return result("distinct", 0, "different_items");
  }

  const similarity = titleSimilarity(first.title, second.title);
  if (similarity >= 0.84) return result("likely", similarity, "title_similarity");
  if (similarity >= 0.58) return result("ambiguous", similarity, "title_similarity", true);
  return result("distinct", similarity, "different_items");
}

export function titleSimilarity(first: string, second: string) {
  const a = normalizeTitle(first);
  const b = normalizeTitle(second);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const wordScore = jaccard(tokens(a), tokens(b));
  const characterScore = dice(ngrams(a.replace(/\s/g, ""), 2), ngrams(b.replace(/\s/g, ""), 2));
  return round(Math.max(wordScore, characterScore));
}

function withinEventWindow(first: string | null, second: string | null) {
  if (!first || !second) return true;
  const firstTime = new Date(first).valueOf();
  const secondTime = new Date(second).valueOf();
  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return true;
  return Math.abs(firstTime - secondTime) <= 72 * 60 * 60 * 1000;
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(value.split(/\s+/).filter((token) => token.length > 1));
}

function ngrams(value: string, size: number) {
  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function jaccard(first: Set<string>, second: Set<string>) {
  if (!first.size || !second.size) return 0;
  const intersection = [...first].filter((item) => second.has(item)).length;
  return intersection / (first.size + second.size - intersection);
}

function dice(first: Set<string>, second: Set<string>) {
  if (!first.size || !second.size) return 0;
  const intersection = [...first].filter((item) => second.has(item)).length;
  return (2 * intersection) / (first.size + second.size);
}

function result(
  match: DedupeMatch,
  similarity: number,
  reason: DedupeComparison["reason"],
  requiresAIReview = false,
): DedupeComparison {
  return { match, similarity: round(similarity), reason, requiresAIReview };
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
