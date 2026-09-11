import { describe, expect, it } from "vitest";

import { loadFeed } from "@/lib/feed/load-feed";
import { loadDailyDigestStories } from "@/lib/digest/load";
import { mapConcurrent } from "@/lib/pipeline/concurrency";
import { processCandidates } from "@/lib/pipeline/process";
import {
  buildFeedbackProfile,
  calculateRanking,
  createNeutralFeedbackProfile,
  loadFeedbackProfile,
} from "@/lib/ranking";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import type { Classification, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = Parameters<typeof loadFeedbackProfile>[0];

// In-memory mock database for query tests
interface MockDatabase {
  profiles: Array<{ id: string; email: string }>;
  topics: Array<{ id: string; slug: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  raw_items: Array<{ id: string; source_id: string; canonical_url?: string }>;
  stories: Array<{
    id: string;
    title: string;
    summary: string;
    why_recommended: string;
    primary_topic_id: string;
    content_type: "current" | "discovery";
    primary_url: string;
    published_at: string | null;
    final_score: number;
  }>;
  story_sources: Array<{
    story_id: string;
    raw_item_id: string;
    is_primary: boolean;
  }>;
  story_state: Array<{
    profile_id: string;
    story_id: string;
    is_read: boolean;
    is_saved: boolean;
    is_read_later: boolean;
    is_not_interested: boolean;
    feedback_reason: string | null;
    read_at: string | null;
    saved_at: string | null;
    read_later_at: string | null;
    updated_at: string;
  }>;
  digests: Array<{
    id: string;
    type: "daily" | "weekly";
    date: string;
    title: string;
    summary: string;
  }>;
  digest_stories: Array<{
    digest_id: string;
    story_id: string;
    position: number;
  }>;
}

type MockRow = Record<string, unknown>;

function createMockSupabase(db: MockDatabase): SupabaseClient {
  return {
    from: (tableName: keyof MockDatabase) => {
      let filteredRows = [...(db[tableName] || [])] as MockRow[];

      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filteredRows = filteredRows.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          const valSet = new Set(vals);
          filteredRows = filteredRows.filter((r) => valSet.has(r[col]));
          return builder;
        },
        order: (col: string, { ascending = true }: { ascending?: boolean } = {}) => {
          filteredRows.sort((a, b) => {
            const valA = a[col];
            const valB = b[col];
            if (typeof valA === "number" && typeof valB === "number") {
              return ascending ? valA - valB : valB - valA;
            }
            const strA = String(valA ?? "");
            const strB = String(valB ?? "");
            if (strA < strB) return ascending ? -1 : 1;
            if (strA > strB) return ascending ? 1 : -1;
            return 0;
          });
          return builder;
        },
        limit: (n: number) => {
          filteredRows = filteredRows.slice(0, n);
          return builder;
        },
        maybeSingle: async () => {
          return { data: filteredRows[0] ?? null, error: null };
        },
        single: async () => {
          if (!filteredRows[0]) {
            return { data: null, error: { message: "No row found" } };
          }
          return { data: filteredRows[0], error: null };
        },
        then: <TResult1 = { data: MockRow[]; error: null }>(
          onfulfilled?: ((value: { data: MockRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        ) => {
          return Promise.resolve({ data: filteredRows, error: null }).then(onfulfilled);
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient;
}

function createTestCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    sourceId: "src-1",
    sourceName: "Source 1",
    sourceType: "rss",
    externalId: "ext-1",
    url: "https://example.com/item",
    canonicalUrl: "https://example.com/item",
    title: "Test Candidate",
    excerpt: "Excerpt text",
    publishedAt: "2026-09-11T12:00:00Z",
    topic: "technology",
    isDiscovery: false,
    engagement: {},
    rawMetadata: {},
    ...overrides,
  };
}

describe("Feed Query Separation (Story #51+ beyond global Top 50)", () => {
  function seedDatabase(): MockDatabase {
    const topicId = "topic-tech-id";
    const sourceId = "source-hn-id";
    const rawItemId = "raw-1";

    // 60 stories: story-1 (score 100) down to story-60 (score 41)
    const stories = Array.from({ length: 60 }, (_, i) => ({
      id: `story-${i + 1}`,
      title: `Story Number ${i + 1}`,
      summary: `Summary of story ${i + 1}`,
      why_recommended: `Why story ${i + 1}`,
      primary_topic_id: topicId,
      content_type: "current" as const,
      primary_url: `https://example.com/story/${i + 1}`,
      published_at: "2026-09-10T10:00:00Z",
      final_score: 100 - i, // Story 1 = 100, Story 50 = 51, Story 55 = 46
    }));

    const story_sources = stories.map((s) => ({
      story_id: s.id,
      raw_item_id: rawItemId,
      is_primary: true,
    }));

    return {
      profiles: [{ id: "user-1", email: "user@example.com" }],
      topics: [{ id: topicId, slug: "technology", name: "Technology" }],
      sources: [{ id: sourceId, name: "Hacker News" }],
      raw_items: [{ id: rawItemId, source_id: sourceId }],
      stories,
      story_sources,
      story_state: [],
      digests: [],
      digest_stories: [],
    };
  }

  it("/saved returns story #55 (outside top 50) ordered by saved_at desc", async () => {
    const db = seedDatabase();
    db.story_state.push(
      {
        profile_id: "user-1",
        story_id: "story-55", // Not in top 50
        is_read: false,
        is_saved: true,
        is_read_later: false,
        is_not_interested: false,
        feedback_reason: null,
        read_at: null,
        saved_at: "2026-09-11T12:00:00Z",
        read_later_at: null,
        updated_at: "2026-09-11T12:00:00Z",
      },
      {
        profile_id: "user-1",
        story_id: "story-10", // In top 50
        is_read: false,
        is_saved: true,
        is_read_later: false,
        is_not_interested: false,
        feedback_reason: null,
        read_at: null,
        saved_at: "2026-09-11T14:00:00Z", // newer save
        read_later_at: null,
        updated_at: "2026-09-11T14:00:00Z",
      },
    );

    const client = createMockSupabase(db);
    const feed = await loadFeed(client, "user-1", "saved");

    expect(feed).toHaveLength(2);
    // Ordered by saved_at desc: story-10 (14:00) then story-55 (12:00)
    expect(feed[0].id).toBe("story-10");
    expect(feed[1].id).toBe("story-55");
    expect(feed[1].title).toBe("Story Number 55");
    expect(feed[1].isSaved).toBe(true);
  });

  it("/read-later returns story #56 (outside top 50) ordered by read_later_at desc", async () => {
    const db = seedDatabase();
    db.story_state.push(
      {
        profile_id: "user-1",
        story_id: "story-56", // Outside top 50
        is_read: false,
        is_saved: false,
        is_read_later: true,
        is_not_interested: false,
        feedback_reason: null,
        read_at: null,
        saved_at: null,
        read_later_at: "2026-09-11T10:00:00Z",
        updated_at: "2026-09-11T15:00:00Z", // updated later by unrelated action
      },
      {
        profile_id: "user-1",
        story_id: "story-57", // Outside top 50
        is_read: false,
        is_saved: false,
        is_read_later: true,
        is_not_interested: false,
        feedback_reason: null,
        read_at: null,
        saved_at: null,
        read_later_at: "2026-09-11T11:00:00Z", // added to read later after story-56
        updated_at: "2026-09-11T11:00:00Z",
      },
    );

    const client = createMockSupabase(db);
    const feed = await loadFeed(client, "user-1", "read-later");

    expect(feed).toHaveLength(2);
    // Must be ordered by read_later_at desc: story-57 (11:00) then story-56 (10:00)
    // and NOT by updated_at (which was 15:00 for story-56)
    expect(feed[0].id).toBe("story-57");
    expect(feed[1].id).toBe("story-56");
    expect(feed[0].isReadLater).toBe(true);
    expect(feed[1].isReadLater).toBe(true);
  });

  it("/history returns story #58 (outside top 50) ordered by read_at desc", async () => {
    const db = seedDatabase();
    db.story_state.push(
      {
        profile_id: "user-1",
        story_id: "story-58", // Outside top 50
        is_read: true,
        is_saved: false,
        is_read_later: false,
        is_not_interested: false,
        feedback_reason: null,
        read_at: "2026-09-11T09:00:00Z",
        saved_at: null,
        read_later_at: null,
        updated_at: "2026-09-11T09:00:00Z",
      },
      {
        profile_id: "user-1",
        story_id: "story-59", // Outside top 50
        is_read: true,
        is_saved: false,
        is_read_later: false,
        is_not_interested: false,
        feedback_reason: null,
        read_at: "2026-09-11T16:00:00Z", // read more recently
        saved_at: null,
        read_later_at: null,
        updated_at: "2026-09-11T16:00:00Z",
      },
    );

    const client = createMockSupabase(db);
    const feed = await loadFeed(client, "user-1", "history");

    expect(feed).toHaveLength(2);
    expect(feed[0].id).toBe("story-59");
    expect(feed[1].id).toBe("story-58");
    expect(feed[0].isRead).toBe(true);
    expect(feed[1].isRead).toBe(true);
  });

  it("global / (view: all) returns top 50 stories and filters out not_interested", async () => {
    const db = seedDatabase();
    // User marks story-1 (top 1) as not interested
    db.story_state.push({
      profile_id: "user-1",
      story_id: "story-1",
      is_read: false,
      is_saved: false,
      is_read_later: false,
      is_not_interested: true,
      feedback_reason: "topic_not_interesting",
      read_at: null,
      saved_at: null,
      read_later_at: null,
      updated_at: "2026-09-11T08:00:00Z",
    });

    const client = createMockSupabase(db);
    const feed = await loadFeed(client, "user-1", "all");

    // 50 queried, 1 excluded => 49 returned
    expect(feed).toHaveLength(49);
    expect(feed.some((item) => item.id === "story-1")).toBe(false);
    expect(feed[0].id).toBe("story-2");
  });
});

describe("Historical Digest Decoupling", () => {
  it("loads historical digest stories outside top 50 in exact position order", async () => {
    const topicId = "topic-music-id";
    const sourceId = "source-bandcamp";
    const rawItemId = "raw-music-1";

    const db: MockDatabase = {
      profiles: [{ id: "user-1", email: "user@example.com" }],
      topics: [{ id: topicId, slug: "music", name: "Music" }],
      sources: [{ id: sourceId, name: "Bandcamp Daily" }],
      raw_items: [{ id: rawItemId, source_id: sourceId }],
      // Stories from an old digest, low final scores (outside global top 50)
      stories: [
        {
          id: "story-old-c",
          title: "Shoegaze Revival Article",
          summary: "First sentence. Second sentence.",
          why_recommended: "Recommended for shoegaze lovers.",
          primary_topic_id: topicId,
          content_type: "discovery",
          primary_url: "https://example.com/music-c",
          published_at: "2026-08-01T00:00:00Z",
          final_score: 30,
        },
        {
          id: "story-old-a",
          title: "Dream Pop Gems",
          summary: "Dream pop gems of the year. Essential listening.",
          why_recommended: "Discovery recommendation.",
          primary_topic_id: topicId,
          content_type: "discovery",
          primary_url: "https://example.com/music-a",
          published_at: "2026-08-01T00:00:00Z",
          final_score: 45,
        },
        {
          id: "story-old-b",
          title: "Taiwan Indie Scene",
          summary: "Spotlight on Taiwan indie. Great tracks.",
          why_recommended: "Indie rock interest.",
          primary_topic_id: topicId,
          content_type: "current",
          primary_url: "https://example.com/music-b",
          published_at: "2026-08-01T00:00:00Z",
          final_score: 40,
        },
      ],
      story_sources: [
        { story_id: "story-old-a", raw_item_id: rawItemId, is_primary: true },
        { story_id: "story-old-b", raw_item_id: rawItemId, is_primary: true },
        { story_id: "story-old-c", raw_item_id: rawItemId, is_primary: true },
      ],
      story_state: [],
      digests: [
        {
          id: "digest-2026-08-01",
          type: "daily",
          date: "2026-08-01",
          title: "Daily Digest — 2026-08-01",
          summary: "Digest summary from August 1st.",
        },
      ],
      // Position order is specifically C (pos 0), A (pos 1), B (pos 2)
      digest_stories: [
        { digest_id: "digest-2026-08-01", story_id: "story-old-c", position: 0 },
        { digest_id: "digest-2026-08-01", story_id: "story-old-a", position: 1 },
        { digest_id: "digest-2026-08-01", story_id: "story-old-b", position: 2 },
      ],
    };

    const client = createMockSupabase(db);
    const result = await loadDailyDigestStories(client, "user-1", "2026-08-01");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Daily Digest — 2026-08-01");
    expect(result?.stories).toHaveLength(3);

    // Verified immutable position order preserved
    expect(result?.stories[0].id).toBe("story-old-c");
    expect(result?.stories[1].id).toBe("story-old-a");
    expect(result?.stories[2].id).toBe("story-old-b");

    // Verified complete story details populated
    expect(result?.stories[0].topic).toBe("music");
    expect(result?.stories[0].source).toBe("Bandcamp Daily");
  });
});

describe("AI Pipeline Bounded Concurrency", () => {
  it("mapConcurrent limits concurrency and preserves input order", async () => {
    let activeWorkers = 0;
    let peakConcurrency = 0;

    const items = Array.from({ length: 15 }, (_, i) => i);
    const concurrencyLimit = 3;

    const results = await mapConcurrent(items, concurrencyLimit, async (item) => {
      activeWorkers += 1;
      peakConcurrency = Math.max(peakConcurrency, activeWorkers);
      // simulate asynchronous work
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeWorkers -= 1;
      return item * 2;
    });

    expect(peakConcurrency).toBeLessThanOrEqual(concurrencyLimit);
    expect(results).toEqual(items.map((i) => i * 2));
  });

  it("processCandidates bounds classification (<=5) and summary (<=4) concurrency", async () => {
    let activeClassification = 0;
    let peakClassification = 0;
    let activeSummary = 0;
    let peakSummary = 0;

    const distinctTitles = [
      "Quantum Computing Breakthrough in Superconductors",
      "Global Semiconductor Supply Chain Outlook",
      "Autonomous Drone Navigation Algorithms",
      "PostgreSQL 17 Performance Features Announced",
      "Next.js Architecture Patterns for High Traffic",
      "Deep Learning Advances in Protein Folding",
      "Cybersecurity Vulnerability Disclosed in Linux Kernel",
      "Microservices vs Modular Monolith Architectural Debate",
      "WebAssembly Compilation Pipeline Improvements",
      "Rust Memory Safety Verification at Scale",
      "Distributed Systems Consensus Protocols Revisited",
      "Database Indexing Strategies for Read Heavy Workloads",
    ];

    const mockCandidates: NormalizedCandidate[] = distinctTitles.map((title, i) =>
      createTestCandidate({
        sourceId: `source-${i}`,
        externalId: `ext-${i}`,
        url: `https://example.com/item-${i}`,
        canonicalUrl: `https://example.com/item-${i}`,
        title,
        topic: "technology",
      }),
    );

    const mockEditor: StoryAIEditor = {
      classify: async () => {
        activeClassification += 1;
        peakClassification = Math.max(peakClassification, activeClassification);
        await new Promise((r) => setTimeout(r, 15));
        activeClassification -= 1;
        return {
          topics: ["technology"],
          interest_relevance: 4,
          information_value: 4,
          importance: 4,
          freshness: 4,
          discussion_popularity: 3,
          discovery_value: 3,
          content_type: "current",
          fact_status: "official_confirmation",
        } as Classification;
      },
      decideDuplicate: async () => {
        return { same_event: false, confidence: 0.9, reason: "different" };
      },
      summarize: async (candidate: NormalizedCandidate) => {
        activeSummary += 1;
        peakSummary = Math.max(peakSummary, activeSummary);
        await new Promise((r) => setTimeout(r, 15));
        activeSummary -= 1;
        return {
          title: `Summary of ${candidate.title}`,
          summary: "Sentence 1. Sentence 2.",
          why_recommended: "Relevant to technology.",
        } as StorySummary;
      },
    } as unknown as StoryAIEditor;

    const result = await processCandidates(mockCandidates, mockEditor, {
      minimumScore: 40,
    });

    expect(peakClassification).toBeLessThanOrEqual(5);
    expect(peakSummary).toBeLessThanOrEqual(4);
    expect(result.stories).toHaveLength(12);
  });

  it("preserves failure isolation during concurrent execution", async () => {
    const failTitles = [
      "Quantum Computing Breakthrough in Superconductors",
      "Global Semiconductor Supply Chain Outlook",
      "Autonomous Drone Navigation Algorithms",
      "PostgreSQL 17 Performance Features Announced",
      "Next.js Architecture Patterns for High Traffic",
      "Deep Learning Advances in Protein Folding",
    ];

    const mockCandidates: NormalizedCandidate[] = failTitles.map((title, i) =>
      createTestCandidate({
        sourceId: `source-${i}`,
        externalId: `ext-${i}`,
        url: `https://example.com/fail-${i}`,
        canonicalUrl: `https://example.com/fail-${i}`,
        title,
        topic: "technology",
      }),
    );

    const mockEditor: StoryAIEditor = {
      classify: async (candidate: NormalizedCandidate) => {
        if (candidate.externalId === "ext-2") {
          throw new Error("Simulated OpenAI rate limit / parse error");
        }
        return {
          topics: ["technology"],
          interest_relevance: 4,
          information_value: 4,
          importance: 4,
          freshness: 4,
          discussion_popularity: 3,
          discovery_value: 3,
          content_type: "current",
          fact_status: "official_confirmation",
        } as Classification;
      },
      decideDuplicate: async () => ({ same_event: false, confidence: 0.9, reason: "diff" }),
      summarize: async (candidate: NormalizedCandidate) => ({
        title: candidate.title,
        summary: "Sent 1. Sent 2.",
        why_recommended: "Why",
      }),
    } as unknown as StoryAIEditor;

    const result = await processCandidates(mockCandidates, mockEditor, { minimumScore: 40 });

    // 5 succeed, 1 fails
    expect(result.stories).toHaveLength(5);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].externalId).toBe("ext-2");
    expect(result.failures[0].stage).toBe("classification");
    expect(result.failures[0].errorMessage).toContain("Simulated OpenAI rate limit");
  });
});

describe("Feedback Profile & Ranking Score Adjustments", () => {
  const baseClassification: Classification = {
    topics: ["ai"],
    interest_relevance: 4,
    information_value: 4,
    importance: 4,
    freshness: 4,
    discussion_popularity: 3,
    discovery_value: 3,
    content_type: "current",
    fact_status: "official_confirmation",
  };

  it("neutral profile returns empty signals and 0 adjustment", () => {
    const neutral = createNeutralFeedbackProfile();
    const candidate = createTestCandidate({
      sourceId: "src-1",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "Title",
      topic: "ai",
    });

    const signals = neutral.feedbackFor(candidate);
    expect(signals).toEqual({});

    const ranking = calculateRanking({
      classification: baseClassification,
      primaryTopic: "ai",
      topicWeight: 4,
      feedback: signals,
    });

    expect(ranking.feedbackAdjustment).toBe(0);
  });

  it("boosts score when candidate matches user saved/read topics", () => {
    const profile = buildFeedbackProfile([
      {
        is_saved: true,
        is_read: true,
        is_not_interested: false,
        feedback_reason: null,
        topic: "ai",
        sourceIds: ["src-good"],
      },
      {
        is_saved: true,
        is_read: false,
        is_not_interested: false,
        feedback_reason: null,
        topic: "ai",
        sourceIds: ["src-good"],
      },
    ]);

    const candidate = createTestCandidate({
      sourceId: "src-good",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "AI Breakthrough",
      topic: "ai",
    });

    const signals = profile.feedbackFor(candidate);
    expect(signals.savedSimilarCount).toBe(2);
    expect(signals.readSimilarCount).toBe(1);

    const neutralRanking = calculateRanking({
      classification: baseClassification,
      primaryTopic: "ai",
      topicWeight: 4,
    });

    const boostedRanking = calculateRanking({
      classification: baseClassification,
      primaryTopic: "ai",
      topicWeight: 4,
      feedback: signals,
    });

    expect(boostedRanking.feedbackAdjustment).toBeGreaterThan(0);
    expect(boostedRanking.finalScore).toBeGreaterThan(neutralRanking.finalScore);
  });

  it("penalizes score when candidate matches poor_source and topic_not_interesting", () => {
    const profile = buildFeedbackProfile([
      {
        is_saved: false,
        is_read: false,
        is_not_interested: true,
        feedback_reason: "poor_source",
        topic: "finance",
        sourceIds: ["src-bad"],
      },
      {
        is_saved: false,
        is_read: false,
        is_not_interested: true,
        feedback_reason: "topic_not_interesting",
        topic: "finance",
        sourceIds: ["src-bad"],
      },
    ]);

    const candidate = createTestCandidate({
      sourceId: "src-bad",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "Finance Gossip",
      topic: "finance",
    });

    const signals = profile.feedbackFor(candidate);
    expect(signals.poorSourceCount).toBe(1);
    expect(signals.topicNotInterestingCount).toBe(1);

    const penalizedRanking = calculateRanking({
      classification: baseClassification,
      primaryTopic: "finance",
      topicWeight: 3,
      feedback: signals,
    });

    expect(penalizedRanking.feedbackAdjustment).toBeLessThan(0);
  });

  it("caps feedback signals to prevent score blowup", () => {
    // Simulate 20 saved interactions for "ai"
    const interactions = Array.from({ length: 20 }, () => ({
      is_saved: true,
      is_read: true,
      is_not_interested: false,
      feedback_reason: null,
      topic: "ai" as const,
      sourceIds: ["src-ai"],
    }));

    const profile = buildFeedbackProfile(interactions, { cap: 5 });
    const candidate = createTestCandidate({
      sourceId: "src-ai",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "AI News",
      topic: "ai",
    });

    const signals = profile.feedbackFor(candidate);
    expect(signals.savedSimilarCount).toBe(5);
    expect(signals.readSimilarCount).toBe(5);
  });

  it("loadFeedbackProfile loads user profile safely from database", async () => {
    const db: MockDatabase = {
      profiles: [{ id: "profile-single", email: "jason@example.com" }],
      topics: [
        { id: "top-1", slug: "ai", name: "AI" },
        { id: "top-2", slug: "music", name: "Music" },
      ],
      sources: [{ id: "src-1", name: "TechCrunch" }],
      raw_items: [{ id: "raw-1", source_id: "src-1" }],
      stories: [
        {
          id: "st-1",
          title: "Story 1",
          summary: "Summary",
          why_recommended: "Why",
          primary_topic_id: "top-1",
          content_type: "current",
          primary_url: "https://example.com/1",
          published_at: null,
          final_score: 80,
        },
      ],
      story_sources: [{ story_id: "st-1", raw_item_id: "raw-1", is_primary: true }],
      story_state: [
        {
          profile_id: "profile-single",
          story_id: "st-1",
          is_read: true,
          is_saved: true,
          is_read_later: false,
          is_not_interested: false,
          feedback_reason: null,
          read_at: "2026-09-11T12:00:00Z",
          saved_at: "2026-09-11T12:00:00Z",
          read_later_at: null,
          updated_at: "2026-09-11T12:00:00Z",
        },
      ],
      digests: [],
      digest_stories: [],
    };

    const client = createMockSupabase(db);
    const profile = await loadFeedbackProfile(client as unknown as AdminClient);

    const candidate = createTestCandidate({
      sourceId: "src-1",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "AI story",
      topic: "ai",
    });

    const signals = profile.feedbackFor(candidate);
    expect(signals.savedSimilarCount).toBe(1);
    expect(signals.readSimilarCount).toBe(1);
  });

  it("loadFeedbackProfile returns neutral profile when no profile exists in DB", async () => {
    const db: MockDatabase = {
      profiles: [], // No profile yet
      topics: [],
      sources: [],
      raw_items: [],
      stories: [],
      story_sources: [],
      story_state: [],
      digests: [],
      digest_stories: [],
    };

    const client = createMockSupabase(db);
    const profile = await loadFeedbackProfile(client as unknown as AdminClient);

    const candidate = createTestCandidate({
      sourceId: "src-1",
      externalId: "ext-1",
      url: "https://example.com/1",
      canonicalUrl: "https://example.com/1",
      title: "AI story",
      topic: "ai",
    });

    expect(profile.feedbackFor(candidate)).toEqual({});
  });
});
