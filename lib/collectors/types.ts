import type { Json } from "@/lib/supabase/database.types";

export type SourceType = "rss" | "hacker_news" | "reddit" | "youtube";
export type ContentTopic =
  | "ai"
  | "cybersecurity"
  | "technology"
  | "finance"
  | "world"
  | "music"
  | "photography";

export interface CollectorContext {
  signal?: AbortSignal;
}

export interface NormalizedCandidate {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  externalId: string | null;
  url: string;
  canonicalUrl: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  topic: ContentTopic;
  isDiscovery: boolean;
  engagement: {
    score?: number;
    commentCount?: number;
  };
  rawMetadata: Json;
}

export interface Collector<CollectedItem = unknown> {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: SourceType;
  fetch(context?: CollectorContext): Promise<CollectedItem[]>;
  normalize(item: CollectedItem): NormalizedCandidate | null;
}

export interface CollectorRunResult {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  status: "succeeded" | "failed";
  candidateCount: number;
  candidates: NormalizedCandidate[];
  errorMessage?: string;
}
