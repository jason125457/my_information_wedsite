import { describe, expect, it, vi } from "vitest";

import type { EditorialJudgement, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor } from "@/lib/ai/story-editor";
import type { NormalizedCandidate } from "@/lib/collectors";
import { compareCandidates } from "@/lib/dedupe";
import {
  DEFAULT_MAX_PER_SOURCE,
  DEFAULT_MAX_STORIES,
  processCandidates,
  type ExistingStory,
} from "@/lib/pipeline/process";

const now = new Date("2026-11-15T12:00:00Z");

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
    publishedAt: "2026-11-15T10:00:00Z",
    topic: "ai",
    isDiscovery: false,
    engagement: {},
    rawMetadata: {},
    ...overrides,
  };
}

/** One distinct candidate per index, each from its own source and site. */
function distinct(index: number, overrides: Partial<NormalizedCandidate> = {}) {
  const titles = [
    "Lalashan dark sky park opens stargazing tours",
    "Nvidia chief faces questions over board conduct",
    "Russia and Ukraine delegations meet in Abu Dhabi",
    "New shoegaze record from a Taipei band",
    "Open source agent framework for browsers",
    "Declarative language for physical machines",
  ];
  return candidate({
    sourceId: `source-${index}`,
    externalId: `item-${index}`,
    url: `https://site${index}.example/post`,
    canonicalUrl: `https://site${index}.example/post`,
    title: titles[index]!,
    topic: (["ai", "technology", "world", "music", "photography", "finance"] as const)[index]!,
    ...overrides,
  });
}

const judgement: EditorialJudgement = {
  topics: ["ai"],
  interest_relevance: 5,
  information_value: 5,
  importance: 4,
  discovery_value: 3,
};

function createEditor(sameEvent = false) {
  const summarized: string[] = [];
  const decideDuplicate = vi.fn(async () => ({
    same_event: sameEvent,
    confidence: 0.9,
    reason: sameEvent ? "same" : "different",
  }));
  const editor = {
    classifyMany: async (batch: NormalizedCandidate[]) =>
      batch.map((item) => ({ ...judgement, topics: [item.topic] })),
    summarizeMany: async (batch: Array<{ candidate: NormalizedCandidate }>) =>
      batch.map(({ candidate: item }): StorySummary => {
        summarized.push(item.externalId ?? "");
        return { title: `中文：${item.title}`, summary: "一。二。", key_points: [], why_recommended: "理由。" };
      }),
    decideDuplicate,
  } as unknown as StoryAIEditor;
  return { editor, summarized, decideDuplicate };
}

function existingStory(storyId: string, overrides: Partial<NormalizedCandidate>): ExistingStory {
  return {
    storyId,
    candidate: candidate({
      sourceId: "earlier-source",
      externalId: `${storyId}-raw`,
      url: `https://earlier.example/${storyId}`,
      canonicalUrl: `https://earlier.example/${storyId}`,
      publishedAt: "2026-11-14T20:00:00Z",
      ...overrides,
    }),
  };
}

describe("cross-run deduplication", () => {
  it("attaches a same-event candidate to the existing story instead of drafting a new one", async () => {
    const { editor, summarized } = createEditor();
    const existing = existingStory("story-lalashan", {
      title: "Lalashan dark sky park opens stargazing tours",
    });

    const result = await processCandidates(
      [distinct(0, { title: "Lalashan dark sky park opens stargazing tours!" })],
      editor,
      { now, minimumScore: 0, existingStories: [existing] },
    );

    expect(result.stories).toHaveLength(0);
    expect(summarized).toHaveLength(0);
    expect(result.attachments).toEqual([
      { storyId: "story-lalashan", candidates: [expect.objectContaining({ externalId: "item-0" })] },
    ]);
  });

  it("uses the AI duplicate check for ambiguous matches against existing stories", async () => {
    const existing = existingStory("story-talks", {
      title: "Russia and Ukraine delegations meet in Abu Dhabi for talks",
    });
    const incoming = distinct(2, { title: "Russia Ukraine delegations hold talks in Abu Dhabi" });
    expect(compareCandidates(existing.candidate, incoming).match).toBe("ambiguous");

    const same = createEditor(true);
    const merged = await processCandidates([incoming], same.editor, {
      now,
      minimumScore: 0,
      existingStories: [existing],
    });
    expect(same.decideDuplicate).toHaveBeenCalledTimes(1);
    expect(merged.stories).toHaveLength(0);
    expect(merged.attachments[0]?.storyId).toBe("story-talks");

    const different = createEditor(false);
    const separate = await processCandidates([incoming], different.editor, {
      now,
      minimumScore: 0,
      existingStories: [existing],
    });
    expect(different.decideDuplicate).toHaveBeenCalledTimes(1);
    expect(separate.stories).toHaveLength(1);
    expect(separate.attachments).toEqual([]);
  });

  it("does not count existing stories against this run's caps", async () => {
    const { editor } = createEditor();
    // Many existing stories from the same sources and topics as the new items.
    const existing = Array.from({ length: 10 }, (_, i) =>
      existingStory(`old-${i}`, {
        sourceId: `source-${i % 3}`,
        topic: "ai",
        title: `Completely unrelated earlier headline number ${i} about gardening`,
      }),
    );

    const result = await processCandidates([0, 1, 2].map((i) => distinct(i)), editor, {
      now,
      minimumScore: 0,
      existingStories: existing,
    });

    expect(result.stories).toHaveLength(3);
    expect(result.attachments).toEqual([]);
  });

  it("does not re-summarize an existing story that receives new sources", async () => {
    const { editor, summarized } = createEditor();
    const existing = existingStory("story-nvidia", {
      title: "Nvidia chief faces questions over board conduct",
    });

    const result = await processCandidates(
      [distinct(1), distinct(3)],
      editor,
      { now, minimumScore: 0, existingStories: [existing] },
    );

    expect(result.attachments.map((a) => a.storyId)).toEqual(["story-nvidia"]);
    expect(result.stories.map((s) => s.candidate.externalId)).toEqual(["item-3"]);
    expect(summarized).toEqual(["item-3"]);
  });
});

describe("per-run defaults", () => {
  it("keeps at most three new stories per run, one per source", async () => {
    expect(DEFAULT_MAX_STORIES).toBe(3);
    expect(DEFAULT_MAX_PER_SOURCE).toBe(1);
    const { editor } = createEditor();

    const manySources = await processCandidates(
      [0, 1, 2, 3, 4, 5].map((i) => distinct(i)),
      editor,
      { now, minimumScore: 0 },
    );
    expect(manySources.stories).toHaveLength(3);

    const oneSource = await processCandidates(
      [0, 1, 2, 3].map((i) => distinct(i, { sourceId: "busy-source" })),
      editor,
      { now, minimumScore: 0 },
    );
    expect(oneSource.stories).toHaveLength(1);
  });

  it("keeps at most two new stories per topic by default", async () => {
    const { editor } = createEditor();
    const result = await processCandidates(
      [0, 1, 2, 3].map((i) => distinct(i, { topic: "ai" })),
      editor,
      { now, minimumScore: 0 },
    );
    expect(result.stories).toHaveLength(2);
  });
});
