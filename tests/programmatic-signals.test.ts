import { describe, expect, it, vi } from "vitest";

import type { EditorialJudgement, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import { RssCollector } from "@/lib/collectors/rss";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { selectDailyDigest } from "@/lib/digest/select";
import { prefilterCandidates } from "@/lib/pipeline/prefilter";
import { processCandidates } from "@/lib/pipeline/process";
import {
  completeClassification,
  factStatusFor,
  freshnessScore,
  popularityScore,
} from "@/lib/pipeline/signals";

const now = new Date("2026-10-23T12:00:00Z");

function candidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    sourceId: "source",
    sourceName: "Source",
    sourceType: "rss",
    externalId: "item",
    url: "https://example.com/item",
    canonicalUrl: "https://example.com/item",
    title: "A distinct and meaningful headline",
    excerpt: null,
    publishedAt: "2026-10-23T10:00:00Z",
    topic: "ai",
    isDiscovery: false,
    engagement: {},
    rawMetadata: {},
    ...overrides,
  };
}

const judgement: EditorialJudgement = {
  topics: ["ai"],
  interest_relevance: 5,
  information_value: 5,
  importance: 4,
  discovery_value: 3,
};

describe("programmatic signals", () => {
  it("maps source reliability to fact status", () => {
    expect(factStatusFor("official")).toBe("official_confirmation");
    expect(factStatusFor("major_media")).toBe("reported");
    expect(factStatusFor("reddit")).toBe("community_discussion");
    expect(factStatusFor("unknown")).toBe("unknown");
  });

  it("decays freshness for current items and keeps discovery neutral", () => {
    expect(freshnessScore(candidate({ publishedAt: "2026-10-23T09:00:00Z" }), now)).toBe(5);
    expect(freshnessScore(candidate({ publishedAt: "2026-10-22T20:00:00Z" }), now)).toBe(3);
    expect(freshnessScore(candidate({ publishedAt: "2026-10-20T12:00:00Z" }), now)).toBe(1);
    expect(freshnessScore(candidate({ isDiscovery: true, publishedAt: "2020-01-01T00:00:00Z" }), now)).toBe(3);
  });

  it("uses engagement when present and stays neutral otherwise", () => {
    expect(popularityScore(candidate())).toBe(3);
    expect(popularityScore(candidate({ engagement: { score: 420 } }))).toBe(5);
    expect(popularityScore(candidate({ engagement: { score: 8, commentCount: 2 } }))).toBe(1);
  });

  it("completes a judgement with content type and fact status from the source", () => {
    const full = completeClassification(
      judgement,
      candidate({ isDiscovery: true, sourceReliability: "reddit" }),
      now,
    );
    expect(full).toMatchObject({
      ...judgement,
      content_type: "discovery",
      fact_status: "community_discussion",
      freshness: 3,
      discussion_popularity: 3,
    });
  });
});

describe("promotional prefilter", () => {
  it("drops deal and giveaway posts but keeps news that mentions a deal", () => {
    const result = prefilterCandidates(
      [
        candidate({ canonicalUrl: "https://a.example/1", externalId: "1", title: "The best laptop deals this week" }),
        candidate({ canonicalUrl: "https://a.example/2", externalId: "2", title: "Camera giveaway for readers" }),
        candidate({ canonicalUrl: "https://a.example/3", externalId: "3", title: "限時特價：耳機下殺五折" }),
        candidate({ canonicalUrl: "https://a.example/4", externalId: "4", title: "EU and US reach a trade deal on chips" }),
      ],
      now,
    );
    expect(result.rejected.map((rejection) => rejection.reason)).toEqual([
      "promotional",
      "promotional",
      "promotional",
    ]);
    expect(result.accepted.map((item) => item.externalId)).toEqual(["4"]);
  });
});

describe("per-run topic caps", () => {
  it("keeps the best stories while limiting each topic", async () => {
    const aiTitles = [
      "Anthropic ships a new coding agent",
      "Gemini adds long video understanding",
      "Open weights model tops reasoning benchmark",
      "GPU shortage eases for inference clusters",
      "Regulators publish AI safety guidance",
      "Startup automates spreadsheet audits",
    ];
    const items = [
      ...aiTitles.map((title, i) =>
        candidate({ sourceId: `ai-${i}`, externalId: `ai-${i}`, canonicalUrl: `https://ai${i}.example/x`, url: `https://ai${i}.example/x`, title }),
      ),
      candidate({ sourceId: "music", externalId: "music", canonicalUrl: "https://music.example/1", url: "https://music.example/1", title: "A new shoegaze record from Taipei", topic: "music" }),
    ];
    const summarized: string[] = [];
    const editor = {
      classifyMany: async (batch: NormalizedCandidate[]) =>
        batch.map((item) => ({ ...judgement, topics: [item.topic] })),
      summarizeMany: async (batch: Array<{ candidate: NormalizedCandidate }>) =>
        batch.map(({ candidate: item }): StorySummary => {
          summarized.push(item.externalId ?? "");
          return { title: item.title, summary: "One. Two.", why_recommended: "Why." };
        }),
      decideDuplicate: vi.fn(async () => ({ same_event: false, confidence: 0.9, reason: "different" })),
    } as unknown as StoryAIEditor;

    const result = await processCandidates(items, editor, {
      now,
      minimumScore: 0,
      maxStories: 3,
      maxPerTopic: 2,
    });

    expect(result.stories.map((story) => story.candidate.topic).sort()).toEqual(["ai", "ai", "music"]);
    expect(summarized).toHaveLength(3);
  });
});

describe("feed images", () => {
  it("reads media, enclosure, YouTube thumbnail and inline images", async () => {
    const xml = `<?xml version="1.0"?>
      <rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
        <item><guid>1</guid><title>Media content item</title><link>https://n.example/1</link>
          <media:content url="https://img.example/1.jpg" medium="image"/></item>
        <item><guid>2</guid><title>Enclosure item here</title><link>https://n.example/2</link>
          <enclosure url="https://img.example/2.png" type="image/png"/></item>
        <item><guid>3</guid><title>Inline image item</title><link>https://n.example/3</link>
          <description>&lt;p&gt;&lt;img src="https://img.example/3.webp" /&gt;Text&lt;/p&gt;</description></item>
        <item><guid>4</guid><title>Item without any image</title><link>https://n.example/4</link></item>
      </channel></rss>`;
    const collector = new RssCollector({
      sourceId: "s",
      sourceName: "S",
      feedUrl: "https://n.example/feed",
      topic: "world",
      fetchImplementation: (async () => new Response(xml)) as typeof fetch,
    });
    const items = await collector.fetch();
    expect(items.map((item) => collector.normalize(item)?.imageUrl)).toEqual([
      "https://img.example/1.jpg",
      "https://img.example/2.png",
      "https://img.example/3.webp",
      null,
    ]);
  });
});

describe("feed image renditions", () => {
  it("picks the widest media rendition and upsizes BBC thumbnails", async () => {
    const xml = `<?xml version="1.0"?>
      <rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
        <item><guid>1</guid><title>Guardian style renditions</title><link>https://n.example/1</link>
          <media:content url="https://i.example/small.jpg" width="140"/>
          <media:content url="https://i.example/large.jpg" width="460"/></item>
        <item><guid>2</guid><title>BBC style thumbnail</title><link>https://n.example/2</link>
          <media:thumbnail url="https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/a/b.jpg"/></item>
      </channel></rss>`;
    const collector = new RssCollector({
      sourceId: "s",
      sourceName: "S",
      feedUrl: "https://n.example/feed",
      topic: "world",
      fetchImplementation: (async () => new Response(xml)) as typeof fetch,
    });
    const items = await collector.fetch();
    expect(items.map((item) => collector.normalize(item)?.imageUrl)).toEqual([
      "https://i.example/large.jpg",
      "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/a/b.jpg",
    ]);
  });
});

describe("daily digest topic share", () => {
  it("limits one topic to a quarter of the digest", () => {
    const picks = selectDailyDigest(
      [
        ...Array.from({ length: 10 }, (_, i) => ({ id: `ai-${i}`, finalScore: 95 - i, contentType: "current" as const, primaryTopicId: "ai" })),
        ...Array.from({ length: 6 }, (_, i) => ({ id: `world-${i}`, finalScore: 70 - i, contentType: "current" as const, primaryTopicId: "world" })),
      ],
      { limit: 8, discoveryRatio: 0 },
    );
    expect(picks.filter((pick) => pick.primaryTopicId === "ai")).toHaveLength(2);
    expect(picks).toHaveLength(4);
  });
});
