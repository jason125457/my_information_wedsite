import { fetchJson, type FetchImplementation } from "@/lib/collectors/http";
import type {
  Collector,
  CollectorContext,
  ContentTopic,
  NormalizedCandidate,
} from "@/lib/collectors/types";
import { asPositiveInteger, cleanText, normalizeUrl, toIsoDate } from "@/lib/collectors/utils";

type HackerNewsList = "topstories" | "beststories" | "newstories";

interface HackerNewsCollectorOptions {
  sourceId: string;
  sourceName?: string;
  list?: HackerNewsList;
  topic?: ContentTopic;
  maxItems?: number;
  fetchImplementation?: FetchImplementation;
}

interface HackerNewsItem {
  id: number;
  deleted?: boolean;
  dead?: boolean;
  type?: string;
  by?: string;
  time?: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
}

const apiBaseUrl = "https://hacker-news.firebaseio.com/v0";

export class HackerNewsCollector implements Collector<HackerNewsItem> {
  readonly sourceType = "hacker_news" as const;
  readonly sourceId: string;
  readonly sourceName: string;

  private readonly list: HackerNewsList;
  private readonly topic: ContentTopic;
  private readonly maxItems: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: HackerNewsCollectorOptions) {
    this.sourceId = options.sourceId;
    this.sourceName = options.sourceName ?? "Hacker News";
    this.list = options.list ?? "topstories";
    this.topic = options.topic ?? "technology";
    this.maxItems = asPositiveInteger(options.maxItems, 30, 100);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async fetch(context?: CollectorContext) {
    const ids = await fetchJson<number[]>(
      this.fetchImplementation,
      `${apiBaseUrl}/${this.list}.json`,
      { signal: context?.signal },
      `Hacker News ${this.list}`,
    );

    const results = await Promise.allSettled(
      ids.slice(0, this.maxItems).map((id) =>
        fetchJson<HackerNewsItem>(
          this.fetchImplementation,
          `${apiBaseUrl}/item/${id}.json`,
          { signal: context?.signal },
          "Hacker News item",
        ),
      ),
    );

    return results
      .filter((result): result is PromiseFulfilledResult<HackerNewsItem> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  normalize(item: HackerNewsItem): NormalizedCandidate | null {
    if (!item.id || !item.title || item.type !== "story" || item.deleted || item.dead) return null;

    const discussionUrl = `https://news.ycombinator.com/item?id=${item.id}`;
    const url = item.url ?? discussionUrl;

    try {
      return {
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        externalId: String(item.id),
        url,
        canonicalUrl: normalizeUrl(url),
        title: cleanText(item.title, 300)!,
        excerpt: cleanText(item.text),
        publishedAt: toIsoDate(item.time),
        topic: this.topic,
        isDiscovery: false,
        engagement: {
          score: item.score,
          commentCount: item.descendants,
        },
        rawMetadata: {
          author: item.by ?? null,
          discussionUrl,
          list: this.list,
        },
      };
    } catch {
      return null;
    }
  }
}
