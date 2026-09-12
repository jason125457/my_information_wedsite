import { describe, expect, it } from "vitest";

import { getAIModelConfig, getIngestionModelConfig } from "@/lib/ai/config";
import type { StructuredAIProvider, StructuredGenerationRequest } from "@/lib/ai/provider";
import {
  classificationSchema,
  type Classification,
  type StorySummary,
} from "@/lib/ai/schemas";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { choosePrimarySource, compareCandidates, titleSimilarity } from "@/lib/dedupe";
import { prefilterCandidates, processCandidates } from "@/lib/pipeline";
import { calculateFeedbackAdjustment, calculateRanking, getWeightProfile } from "@/lib/ranking";

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
        OPENAI_MODEL_FAST: "fast-model",
        OPENAI_MODEL_REASONING: "reasoning-model",
        OPENAI_MODEL_SEARCH: "search-model",
      }),
    ).toEqual({ fast: "fast-model", reasoning: "reasoning-model", search: "search-model" });
    expect(() => getAIModelConfig({})).toThrow("OPENAI_MODEL_FAST is required.");
    expect(getIngestionModelConfig({
      OPENAI_MODEL_FAST: "fast-model",
      OPENAI_MODEL_REASONING: "reasoning-model",
    })).toEqual({ fast: "fast-model", reasoning: "reasoning-model" });
  });

  it("routes classification and summaries to the fast model and dedupe to reasoning", async () => {
    const calls: Array<{ model: string; schemaName: string }> = [];
    const summary: StorySummary = {
      title: "A grounded summary",
      summary: "這是第一句。這是第二句。",
      why_recommended: "與你的 AI 工具興趣相關。",
    };
    const provider: StructuredAIProvider = {
      async generate<T>(request: StructuredGenerationRequest<T>) {
        calls.push({ model: request.model, schemaName: request.schemaName });
        const outputs: Record<string, unknown> = {
          story_classification: classification,
          story_summary: summary,
          duplicate_decision: {
            same_event: true,
            confidence: 0.91,
            reason: "Both describe the same release.",
          },
        };
        return request.schema.parse(outputs[request.schemaName]);
      },
    };
    const editor = new StoryAIEditor(provider, {
      fast: "fast-model",
      reasoning: "reasoning-model",
    });
    const first = makeCandidate();
    const second = makeCandidate({ sourceId: "other", canonicalUrl: "https://other.example/a" });

    await editor.classify(first);
    await editor.summarize(first, classification);
    await editor.decideDuplicate(first, second);

    expect(calls).toEqual([
      { model: "fast-model", schemaName: "story_classification" },
      { model: "fast-model", schemaName: "story_summary" },
      { model: "reasoning-model", schemaName: "duplicate_decision" },
    ]);
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
    const calls: string[] = [];
    const provider: StructuredAIProvider = {
      async generate<T>(request: StructuredGenerationRequest<T>) {
        calls.push(request.schemaName);
        if (request.schemaName === "story_summary") {
          return request.schema.parse({
            title: "OpenAI 推出新的 coding agent",
            summary: "官方來源公布一項新的開發工具。另一來源報導同一事件。",
            why_recommended: "與你的 AI coding 興趣高度相關。",
          });
        }

        const lowValue = request.input.includes("Routine low-value update");
        return request.schema.parse({
          ...classification,
          interest_relevance: lowValue ? 1 : 5,
          information_value: lowValue ? 1 : 5,
          importance: lowValue ? 1 : 5,
          freshness: lowValue ? 1 : 5,
          discussion_popularity: lowValue ? 1 : 5,
          discovery_value: lowValue ? 1 : 5,
        });
      },
    };
    const editor = new StoryAIEditor(provider, {
      fast: "fast-model",
      reasoning: "reasoning-model",
    });

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
    expect(calls.filter((name) => name === "story_classification")).toHaveLength(3);
    expect(calls.filter((name) => name === "story_summary")).toHaveLength(1);
    expect(calls).not.toContain("duplicate_decision");
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
