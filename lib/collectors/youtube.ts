import { fetchJson, type FetchImplementation } from "@/lib/collectors/http";
import type {
  Collector,
  CollectorContext,
  ContentTopic,
  NormalizedCandidate,
} from "@/lib/collectors/types";
import { asPositiveInteger, cleanText, normalizeUrl, toIsoDate } from "@/lib/collectors/utils";

interface YouTubeCollectorOptions {
  sourceId: string;
  sourceName: string;
  channelId: string;
  apiKey: string;
  topic: ContentTopic;
  uploadsPlaylistId?: string;
  isDiscovery?: boolean;
  maxItems?: number;
  fetchImplementation?: FetchImplementation;
}

interface YouTubeChannelResponse {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface YouTubePlaylistItem {
  id?: string;
  snippet?: {
    publishedAt?: string;
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
  status?: { privacyStatus?: string };
}

interface YouTubePlaylistResponse {
  items?: YouTubePlaylistItem[];
}

const apiBaseUrl = "https://www.googleapis.com/youtube/v3";

export class YouTubeCollector implements Collector<YouTubePlaylistItem> {
  readonly sourceType = "youtube" as const;
  readonly sourceId: string;
  readonly sourceName: string;

  private readonly channelId: string;
  private readonly apiKey: string;
  private readonly topic: ContentTopic;
  private readonly isDiscovery: boolean;
  private readonly maxItems: number;
  private readonly fetchImplementation: FetchImplementation;
  private uploadsPlaylistId: string | null;

  constructor(options: YouTubeCollectorOptions) {
    if (!options.channelId || !options.apiKey) {
      throw new Error("YouTube channel ID and API key are required.");
    }

    this.sourceId = options.sourceId;
    this.sourceName = options.sourceName;
    this.channelId = options.channelId;
    this.apiKey = options.apiKey;
    this.topic = options.topic;
    this.uploadsPlaylistId = options.uploadsPlaylistId ?? null;
    this.isDiscovery = options.isDiscovery ?? false;
    this.maxItems = asPositiveInteger(options.maxItems, 25, 50);
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async fetch(context?: CollectorContext) {
    const playlistId = this.uploadsPlaylistId ?? (await this.findUploadsPlaylist(context?.signal));
    const url = new URL(`${apiBaseUrl}/playlistItems`);
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(this.maxItems));
    url.searchParams.set("key", this.apiKey);

    const response = await fetchJson<YouTubePlaylistResponse>(
      this.fetchImplementation,
      url,
      { signal: context?.signal },
      "YouTube playlist items",
    );
    return response.items ?? [];
  }

  normalize(item: YouTubePlaylistItem): NormalizedCandidate | null {
    const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
    const title = cleanText(item.snippet?.title, 300);
    if (!videoId || !title || (item.status?.privacyStatus && item.status.privacyStatus !== "public")) {
      return null;
    }

    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    return {
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceType: this.sourceType,
      externalId: videoId,
      url,
      canonicalUrl: normalizeUrl(url),
      title,
      excerpt: cleanText(item.snippet?.description),
      publishedAt: toIsoDate(item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt),
      topic: this.topic,
      isDiscovery: this.isDiscovery,
      engagement: {},
      rawMetadata: {
        playlistItemId: item.id ?? null,
        channelId: item.snippet?.channelId ?? this.channelId,
        channelTitle: item.snippet?.channelTitle ?? this.sourceName,
        uploadsPlaylistId: this.uploadsPlaylistId,
      },
    };
  }

  private async findUploadsPlaylist(signal?: AbortSignal) {
    const url = new URL(`${apiBaseUrl}/channels`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("id", this.channelId);
    url.searchParams.set("key", this.apiKey);

    const response = await fetchJson<YouTubeChannelResponse>(
      this.fetchImplementation,
      url,
      { signal },
      "YouTube channel details",
    );
    const playlistId = response.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) throw new Error("YouTube channel response did not include an uploads playlist.");
    this.uploadsPlaylistId = playlistId;
    return playlistId;
  }
}
