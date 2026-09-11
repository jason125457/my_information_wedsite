export type SourceReliability =
  | "official"
  | "original_reporting"
  | "major_media"
  | "known_blog"
  | "community"
  | "reddit"
  | "unknown";

export interface SourceChoice {
  id: string;
  reliability: SourceReliability;
  publishedAt: string | null;
}

const priority: Record<SourceReliability, number> = {
  official: 7,
  original_reporting: 6,
  major_media: 5,
  known_blog: 4,
  community: 3,
  reddit: 2,
  unknown: 1,
};

export function choosePrimarySource<T extends SourceChoice>(sources: T[]): T | null {
  return (
    [...sources].sort((first, second) => {
      const reliabilityDifference = priority[second.reliability] - priority[first.reliability];
      if (reliabilityDifference !== 0) return reliabilityDifference;
      return timestamp(first.publishedAt) - timestamp(second.publishedAt);
    })[0] ?? null
  );
}

function timestamp(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const result = new Date(value).valueOf();
  return Number.isNaN(result) ? Number.MAX_SAFE_INTEGER : result;
}
