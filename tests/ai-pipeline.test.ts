import { describe, expect, it } from "vitest";

import { getAIModelConfig } from "@/lib/ai/config";
import {
  classificationSchema,
  editorialJudgementSchema,
  type Classification,
  type StorySummary,
} from "@/lib/ai/schemas";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { choosePrimarySource, compareCandidates, titleSimilarity } from "@/lib/dedupe";
import { prefilterCandidates, processCandidates } from "@/lib/pipeline";
import { calculateFeedbackAdjustment, calculateRanking, getWeightProfile } from "@/lib/ranking";
import { createBatchProvider } from "./helpers/batch-provider";

const classification: Classification = {
  topics: ["ai"],
  interest_relevance: 5,
  information_value: 4,
  importance: 3,
  freshness: 5,
  discussion_popularity: 2,
  discovery_value: 3,
  content_type: "current",
  fact_status: "official_confirmation",
};

describe("AI output contracts", () => {
  it("accepts a complete classification and rejects invalid scores", () => {
    expect(classificationSchema.parse(classification)).toEqual(classification);
    expect(() => classificationSchema.parse({ ...classification, importance: 6 })).toThrow();
    expect(() => classificationSchema.parse({ ...classification, freshness: 3.5 })).toThrow();
  });

  it("requires model IDs from environment configuration", () => {
    expect(
      getAIModelConfig({
        GEMINI_MODEL_FAST: "fast-model",
        GEMINI_MODEL_QUALITY: "quality-model",
      }),
    ).toEqual({ fast: "fast-model", quality: "quality-model" });
    expect(() => getAIModelConfig({})).toThrow("GEMINI_MODEL_FAST is required.");
  });

  it("batches classification on the fast model and summaries/dedupe on the quality model", async () => {
    const calls: Array<{ model: string; schemaName: string; items: number }> = [];
    const summary: StorySummary = {
      title: "A grounded summary",
      summary: "這是第一句。這是第二句。",
      why_recommended: "與你的 AI 工具興趣相關。",
    };
    const provider = createBatchProvider({
      classify: () => classification,
      summarize: () => summary,
      decideDuplicate: () => ({ same_event: true, confidence: 0.91, reason: "Same release." }),
      onRequest: (request, items) => {
        calls.push({ model: request.model, schemaName: request.schemaName, items: items.length });
      },
    });
    const editor = new StoryAIEditor(provider, { fast: "fast-model", quality: "quality-model" });
    const first = makeCandidate();
    const second = makeCandidate({ sourceId: "other", canonicalUrl: "https://other.example/a" });

    const judgement = editorialJudgementSchema.parse(classification);
    expect(await editor.classifyMany([first, second])).toEqual([judgement, judgement]);
    expect(await editor.summarizeMany([{ candidate: first, classification }])).toEqual([summary]);
    await editor.decideDuplicate(first, second);

    expect(calls).toEqual([
      { model: "fast-model", schemaName: "story_classification_batch", items: 2 },
      { model: "quality-model", schemaName: "story_summary_batch", items: 1 },
      { model: "quality-model", schemaName: "duplicate_decision", items: 0 },
    ]);
  });

  it("returns null for items the model left out of a batch", async () => {
    const provider = createBatchProvider({ classify: () => classification });
    const editor = new StoryAIEditor(
      {
        async generate(request) {
          const full = (await provider.generate(request)) as { items: Array<{ index: number }> };
          return { items: full.items.filter((item) => item.index !== 1) } as never;
        },
      },
      { fast: "fast-model", quality: "quality-model" },
    );

    const result = await editor.classifyMany([makeCandidate(), makeCandidate(), makeCandidate()]);
    const judgement = editorialJudgementSchema.parse(classification);
    expect(result).toEqual([judgement, null, judgement]);
  });
});

describe("ranking", () => {
  it("uses topic-specific profiles that sum to one", () => {
    for (const topic of [
      "ai",
      "cybersecurity",
      "technology",
      "finance",
      "world",
      "music",
      "photography",
    ] as const) {
      const total = Object.values(getWeightProfile(topic)).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1);
    }
  });

  it("prioritizes importance and freshness for world news", () => {
    const signals: Classification = {
      ...classification,
      topics: ["world"],
      interest_relevance: 1,
      information_value: 3,
      importance: 5,
      freshness: 5,
      discussion_popularity: 1,
      discovery_value: 1,
    };
    const world = calculateRanking({
      classification: signals,
      primaryTopic: "world",
      topicWeight: 3,
    });
    const music = calculateRanking({
      classification: signals,
      primaryTopic: "music",
      topicWeight: 3,
    });

    expect(world.finalScore).toBeGreaterThan(music.finalScore);
  });

  it("applies bounded explicit-feedback adjustments", () => {
    expect(calculateFeedbackAdjustment({ savedSimilarCount: 3, readSimilarCount: 5 })).toBe(8);
    expect(calculateFeedbackAdjustment({ blockedTypeCount: 99 })).toBe(-25);
    expect(calculateFeedbackAdjustment({ savedSimilarCount: 99 })).toBe(15);
  });

  it("clamps final ranking to a stable 0–100 range", () => {
    expect(
      calculateRanking({
        classification: { ...classification, interest_relevance: 5, information_value: 5 },
        primaryTopic: "ai",
        topicWeight: 99,
        feedback: { savedSimilarCount: 10 },
      }).finalScore,
    ).toBe(100);
  });
});

describe("deterministic deduplication", () => {
  it("matches canonical URLs before title analysis", () => {
    const first = makeCandidate();
    const second = makeCandidate({ sourceId: "other-source", externalId: "other-id" });
    expect(compareCandidates(first, second)).toEqual({
      match: "exact",
      similarity: 1,
      reason: "canonical_url",
      requiresAIReview: false,
    });
  });

  it("scopes external IDs to their source", () => {
    const first = makeCandidate({ externalId: "42" });
    const second = makeCandidate({
      sourceId: "other-source",
      externalId: "42",
      canonicalUrl: "https://other.example/story",
      title: "A completely different subject",
    });
    expect(compareCandidates(first, second).match).toBe("distinct");
  });

  it("finds strongly similar English and CJK titles", () => {
    expect(
      titleSimilarity("OpenAI launches a new coding agent", "OpenAI launches new coding agent"),
    ).toBeGreaterThanOrEqual(0.84);
    expect(titleSimilarity("台灣北部今晚可見英仙座流星雨", "今晚台灣北部可見英仙座流星雨")).toBeGreaterThanOrEqual(
      0.84,
    );
  });

  it("sends only ambiguous title matches to AI review", () => {
    const comparison = compareCandidates(
      makeCandidate({ title: "OpenAI releases a new coding agent for developers" }),
      makeCandidate({
        sourceId: "media",
        canonicalUrl: "https://media.example/openai-agent",
        title: "Developers react as OpenAI releases its coding agent",
      }),
    );
    expect(comparison.match).toBe("ambiguous");
    expect(comparison.requiresAIReview).toBe(true);
  });

  it("prefers official and then earliest sources", () => {
    expect(
      choosePrimarySource([
        { id: "community", reliability: "community", publishedAt: "2024-01-01T00:00:00Z" },
        { id: "official", reliability: "official", publishedAt: "2024-01-02T00:00:00Z" },
      ])?.id,
    ).toBe("official");
  });
});

describe("cheap prefilter", () => {
  it("removes repeated and stale current items but retains old discovery", () => {
    const oldDate = "2020-01-01T00:00:00.000Z";
    const current = makeCandidate();
    const result = prefilterCandidates(
      [
        current,
        makeCandidate({ sourceId: "duplicate", externalId: "duplicate" }),
        makeCandidate({
          sourceId: "stale",
          externalId: "stale",
          canonicalUrl: "https://example.com/stale",
          publishedAt: oldDate,
        }),
        makeCandidate({
          sourceId: "discovery",
          externalId: "discovery",
          canonicalUrl: "https://example.com/discovery",
          publishedAt: oldDate,
          isDiscovery: true,
        }),
      ],
      new Date("2024-01-03T00:00:00.000Z"),
    );

    expect(result.accepted.map((item) => item.sourceId)).toEqual(["source", "discovery"]);
    expect(result.rejected.map((item) => item.reason)).toEqual(["duplicate_url", "stale_current"]);
  });
});

describe("processing orchestration", () => {
  it("summarizes only high-value deduplicated stories", async () => {
    const calls: Array<{ schemaName: string; items: number }> = [];
    const provider = createBatchProvider({
      classify: (item) => {
        const lowValue = item.title.includes("Routine low-value update");
        const score = lowValue ? 1 : 5;
        return {
          ...classification,
          interest_relevance: score,
          information_value: score,
          importance: score,
          freshness: score,
          discussion_popularity: score,
          discovery_value: score,
        };
      },
      summarize: () => ({
        title: "OpenAI 推出新的 coding agent",
        summary: "官方來源公布一項新的開發工具。另一來源報導同一事件。",
        why_recommended: "與你的 AI coding 興趣高度相關。",
      }),
      onRequest: (request, items) => {
        calls.push({ schemaName: request.schemaName, items: items.length });
      },
    });
    const editor = new StoryAIEditor(provider, { fast: "fast-model", quality: "quality-model" });

    const result = await processCandidates(
      [
        makeCandidate(),
        makeCandidate({
          sourceId: "news",
          externalId: "news-1",
          canonicalUrl: "https://news.example/openai-agent",
          url: "https://news.example/openai-agent",
          title: "OpenAI launches new coding agent",
        }),
        makeCandidate({
          sourceId: "low-value",
          externalId: "low-1",
          canonicalUrl: "https://example.com/routine",
          url: "https://example.com/routine",
          title: "Routine low-value update",
        }),
      ],
      editor,
      { minimumScore: 55, now: new Date("2024-01-03T00:00:00.000Z") },
    );

    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].additionalSources).toHaveLength(1);
    expect(result.belowThresholdCount).toBe(1);
    expect(calls).toEqual([
      { schemaName: "story_classification_batch", items: 3 },
      { schemaName: "story_summary_batch", items: 1 },
    ]);
  });
});

function makeCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    sourceId: "source",
    sourceName: "Official source",
    sourceType: "rss",
    externalId: "item-1",
    url: "https://example.com/story",
    canonicalUrl: "https://example.com/story",
    title: "OpenAI launches a new coding agent",
    excerpt: "The official source describes the launch.",
    publishedAt: "2024-01-02T00:00:00.000Z",
    topic: "ai",
    isDiscovery: false,
    engagement: {},
    rawMetadata: {},
    ...overrides,
  };
}
