import { XMLParser } from "fast-xml-parser";

import { fetchText, type FetchImplementation } from "@/lib/collectors/http";
import type {
  Collector,
  CollectorContext,
  ContentTopic,
  NormalizedCandidate,
} from "@/lib/collectors/types";
import { asPositiveInteger, cleanText, normalizeUrl, toIsoDate } from "@/lib/collectors/utils";

interface RssCollectorOptions {
  sourceId: string;
  sourceName: string;
  feedUrl: string;
  topic: ContentTopic;
  isDiscovery?: boolean;
  maxItems?: number;
  fetchImplementation?: FetchImplementation;
}

interface RssCollectedItem {
  externalId: string | null;
  title: string | null;
  url: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
}

type XmlRecord = Record<string, unknown>;

export class RssCollector implements Collector<RssCollectedItem> {
  readonly sourceType = "rss" as const;
  readonly sourceId: string;
  readonly sourceName: string;

  private readonly feedUrl: string;
  private readonly topic: ContentTopic;
  private readonly isDiscovery: boolean;
  private readonly maxItems: number;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: RssCollectorOptions) {
    this.sourceId = options.sourceId;
    this.sourceName = options.sourceName;
    this.feedUrl = normalizeUrl(options.feedUrl);
    this.topic = options.topic;
    this.isDiscovery = options.isDiscovery ?? false;
    this.maxItems = asPositiveInteger(options.maxItems, 50, 200);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async fetch(context?: CollectorContext) {
    const xml = await fetchText(
      this.fetchImplementation,
      this.feedUrl,
      {
        headers: { Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" },
        signal: context?.signal,
      },
      "RSS feed",
    );

    const parsed = new XMLParser({
      attributeNamePrefix: "@",
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: true,
    }).parse(xml) as XmlRecord;

    const items = getRssItems(parsed);
    return items.slice(0, this.maxItems).map((item) => this.toCollectedItem(item));
  }

  normalize(item: RssCollectedItem): NormalizedCandidate | null {
    if (!item.title || !item.url) return null;

    try {
      const url = new URL(item.url, this.feedUrl).toString();
      return {
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        externalId: item.externalId ?? url,
        url,
        canonicalUrl: normalizeUrl(url),
        title: item.title,
        excerpt: item.excerpt,
        publishedAt: item.publishedAt,
        topic: this.topic,
        isDiscovery: this.isDiscovery,
        engagement: {},
        rawMetadata: {
          author: item.author,
          categories: item.categories,
          feedUrl: this.feedUrl,
        },
      };
    } catch {
      return null;
    }
  }

  private toCollectedItem(item: XmlRecord): RssCollectedItem {
    return {
      externalId: textValue(item.guid) ?? textValue(item.id),
      title: cleanText(textValue(item.title), 300),
      url: linkValue(item.link),
      excerpt: cleanText(
        textValue(item.description) ?? textValue(item.summary) ?? textValue(item["content:encoded"]),
      ),
      publishedAt: toIsoDate(
        textValue(item.pubDate) ?? textValue(item.published) ?? textValue(item.updated),
      ),
      author: cleanText(textValue(item.author) ?? textValue(item["dc:creator"]), 200),
      categories: asArray(item.category)
        .map((category) => textValue(category))
        .filter((category): category is string => Boolean(category)),
    };
  }
}

function getRssItems(parsed: XmlRecord) {
  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel);
  const feed = asRecord(parsed.feed);
  return asArray(channel?.item ?? feed?.entry)
    .map(asRecord)
    .filter((item): item is XmlRecord => item !== null);
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): XmlRecord | null {
  return typeof value === "object" && value !== null ? (value as XmlRecord) : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return textValue(value[0]);
  const record = asRecord(value);
  if (!record) return null;
  return textValue(record["#text"] ?? record._ ?? record.term ?? record.name);
}

function linkValue(value: unknown): string | null {
  const links = asArray(value);
  const alternate = links.find((link) => {
    const record = asRecord(link);
    return record && (!record["@rel"] || record["@rel"] === "alternate");
  });
  const selected = alternate ?? links[0];
  const record = asRecord(selected);
  return record ? textValue(record["@href"] ?? record["#text"]) : textValue(selected);
}
