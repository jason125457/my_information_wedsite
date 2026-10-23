import { describe, expect, it } from "vitest";

import { emptySavedSearch, savedSources, searchSaved } from "@/lib/feed/saved-search";
import type { FeedStory } from "@/lib/feed/types";

const now = new Date("2026-10-23T12:00:00Z");

function story(overrides: Partial<FeedStory>): FeedStory {
  return {
    id: "s",
    title: "標題",
    summary: "摘要",
    whyRecommended: "理由",
    source: "Source",
    sourceCount: 1,
    publishedAt: "2026-10-20T00:00:00Z",
    publishedLabel: "",
    topic: "ai",
    topicLabel: "AI",
    contentType: "Current",
    primaryUrl: "https://example.com",
    imageUrl: null,
    finalScore: 80,
    isRead: false,
    isSaved: true,
    savedAt: "2026-10-22T00:00:00Z",
    isReadLater: false,
    isNotInterested: false,
    ...overrides,
  };
}

const stories = [
  story({ id: "milky", title: "拉拉山成為暗空勝地", summary: "銀河 觀星", source: "Google 新聞", savedAt: "2026-10-22T00:00:00Z" }),
  story({ id: "claude", title: "Claude Code 新功能", summary: "AI coding agent", source: "Simon Willison", savedAt: "2026-10-01T00:00:00Z" }),
  story({ id: "old", title: "Shoegaze 經典專輯", summary: "Slowdive", source: "Pitchfork", savedAt: "2025-06-01T00:00:00Z" }),
];

describe("saved knowledge base search", () => {
  it("returns everything with no conditions", () => {
    expect(searchSaved(stories, emptySavedSearch, now)).toHaveLength(3);
  });

  it("matches every keyword case-insensitively across title, summary and source", () => {
    expect(searchSaved(stories, { ...emptySavedSearch, query: "claude AGENT" }, now).map((s) => s.id)).toEqual(["claude"]);
    expect(searchSaved(stories, { ...emptySavedSearch, query: "銀河" }, now).map((s) => s.id)).toEqual(["milky"]);
    expect(searchSaved(stories, { ...emptySavedSearch, query: "pitchfork" }, now).map((s) => s.id)).toEqual(["old"]);
  });

  it("filters by source and by when the story was saved", () => {
    expect(searchSaved(stories, { ...emptySavedSearch, source: "Simon Willison" }, now).map((s) => s.id)).toEqual(["claude"]);
    expect(searchSaved(stories, { ...emptySavedSearch, period: "7d" }, now).map((s) => s.id)).toEqual(["milky"]);
    expect(searchSaved(stories, { ...emptySavedSearch, period: "365d" }, now).map((s) => s.id)).toEqual(["milky", "claude"]);
  });

  it("lists sources by how often they appear", () => {
    expect(savedSources([...stories, story({ id: "x", source: "Pitchfork" })])).toEqual(["Pitchfork", "Google 新聞", "Simon Willison"]);
  });
});
