import type { FeedStory } from "@/lib/feed/types";

export const savedPeriods = [
  { value: "all", label: "全部時間", days: null },
  { value: "7d", label: "近 7 天", days: 7 },
  { value: "30d", label: "近 30 天", days: 30 },
  { value: "365d", label: "近一年", days: 365 },
] as const;

export type SavedPeriod = (typeof savedPeriods)[number]["value"];

export interface SavedSearch {
  query: string;
  source: string;
  period: SavedPeriod;
}

export const emptySavedSearch: SavedSearch = { query: "", source: "all", period: "all" };

/**
 * Keyword, source and saved-date filtering for the saved knowledge base.
 * Every whitespace-separated term must appear in the title, summary,
 * recommendation reason or source name (case-insensitive).
 */
export function searchSaved(stories: FeedStory[], search: SavedSearch, now = new Date()): FeedStory[] {
  const terms = search.query.toLocaleLowerCase("zh-TW").split(/\s+/).filter(Boolean);
  const days = savedPeriods.find((period) => period.value === search.period)?.days ?? null;
  const since = days === null ? null : now.valueOf() - days * 86_400_000;

  return stories.filter((story) => {
    if (search.source !== "all" && story.source !== search.source) return false;
    if (since !== null) {
      const savedAt = story.savedAt ? new Date(story.savedAt).valueOf() : NaN;
      if (Number.isNaN(savedAt) || savedAt < since) return false;
    }
    if (!terms.length) return true;
    const haystack = [story.title, story.summary, story.whyRecommended, story.source]
      .join("\n")
      .toLocaleLowerCase("zh-TW");
    return terms.every((term) => haystack.includes(term));
  });
}

/** Distinct source names, most frequent first, for the source filter. */
export function savedSources(stories: FeedStory[]): string[] {
  const counts = new Map<string, number>();
  for (const story of stories) counts.set(story.source, (counts.get(story.source) ?? 0) + 1);
  return [...counts.entries()].sort((first, second) => second[1] - first[1]).map(([source]) => source);
}
