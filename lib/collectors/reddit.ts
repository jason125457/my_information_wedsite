import { fetchJson, type FetchImplementation } from "@/lib/collectors/http";
import type {
  Collector,
  CollectorContext,
  ContentTopic,
  NormalizedCandidate,
} from "@/lib/collectors/types";
import { asPositiveInteger, cleanText, normalizeUrl, toIsoDate } from "@/lib/collectors/utils";

type RedditListingName = "hot" | "new" | "top";

interface RedditCollectorOptions {
  sourceId: string;
  subreddit: string;
  clientId: string;
  clientSecret: string;
  userAgent: string;
  sourceName?: string;
  listing?: RedditListingName;
  topic: ContentTopic;
  isDiscovery?: boolean;
  maxItems?: number;
  fetchImplementation?: FetchImplementation;
}

interface RedditPost {
  id: string;
  name?: string;
  title?: string;
  permalink?: string;
  selftext?: string;
  author?: string;
  subreddit?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
  domain?: string;
  url_overridden_by_dest?: string;
  over_18?: boolean;
  stickied?: boolean;
}

interface RedditListingResponse {
  data?: {
    children?: Array<{ kind?: string; data?: RedditPost }>;
  };
}

interface RedditTokenResponse {
  access_token?: string;
  expires_in?: number;
}

export class RedditCollector implements Collector<RedditPost> {
  readonly sourceType = "reddit" as const;
  readonly sourceId: string;
  readonly sourceName: string;

  private readonly subreddit: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly userAgent: string;
  private readonly listing: RedditListingName;
  private readonly topic: ContentTopic;
  private readonly isDiscovery: boolean;
  private readonly maxItems: number;
  private readonly fetchImplementation: FetchImplementation;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: RedditCollectorOptions) {
    if (!/^[A-Za-z0-9_]{2,21}$/.test(options.subreddit)) {
      throw new Error("Invalid subreddit name.");
    }
    if (!options.clientId || !options.clientSecret || !options.userAgent) {
      throw new Error("Reddit OAuth credentials and a descriptive user agent are required.");
    }

    this.sourceId = options.sourceId;
    this.sourceName = options.sourceName ?? `r/${options.subreddit}`;
    this.subreddit = options.subreddit;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.userAgent = options.userAgent;
    this.listing = options.listing ?? "hot";
    this.topic = options.topic;
    this.isDiscovery = options.isDiscovery ?? false;
    this.maxItems = asPositiveInteger(options.maxItems, 30, 100);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async fetch(context?: CollectorContext) {
    const token = await this.getAccessToken(context?.signal);
    const url = new URL(`https://oauth.reddit.com/r/${this.subreddit}/${this.listing}`);
    url.searchParams.set("limit", String(this.maxItems));
    url.searchParams.set("raw_json", "1");
    if (this.listing === "top") url.searchParams.set("t", "day");

    const response = await fetchJson<RedditListingResponse>(
      this.fetchImplementation,
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": this.userAgent,
        },
        signal: context?.signal,
      },
      "Reddit listing",
    );

    return (response.data?.children ?? [])
      .filter((child) => child.kind === "t3" && child.data)
      .map((child) => child.data!);
  }

  normalize(post: RedditPost): NormalizedCandidate | null {
    if (!post.id || !post.title || !post.permalink || post.stickied) return null;

    try {
      const url = new URL(post.permalink, "https://www.reddit.com").toString();
      return {
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceType: this.sourceType,
        externalId: post.name ?? post.id,
        url,
        canonicalUrl: normalizeUrl(url),
        title: cleanText(post.title, 300)!,
        excerpt: cleanText(post.selftext),
        publishedAt: toIsoDate(post.created_utc),
        topic: this.topic,
        isDiscovery: this.isDiscovery,
        engagement: {
          score: post.score,
          commentCount: post.num_comments,
        },
        rawMetadata: {
          author: post.author ?? null,
          subreddit: post.subreddit ?? this.subreddit,
          domain: post.domain ?? null,
          outboundUrl: post.url_overridden_by_dest ?? null,
          over18: post.over_18 ?? false,
          listing: this.listing,
        },
      };
    } catch {
      return null;
    }
  }

  private async getAccessToken(signal?: AbortSignal) {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const token = await fetchJson<RedditTokenResponse>(
      this.fetchImplementation,
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.userAgent,
        },
        body: "grant_type=client_credentials",
        signal,
      },
      "Reddit OAuth token",
    );

    if (!token.access_token) throw new Error("Reddit OAuth response did not include an access token.");
    const lifetime = Math.max(60, token.expires_in ?? 3600);
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, lifetime - 60) * 1000;
    return token.access_token;
  }
}
