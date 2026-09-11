import { describe, expect, it } from "vitest";

import { runCollectors } from "@/lib/collectors/runner";
import type { Collector, NormalizedCandidate } from "@/lib/collectors/types";
import { cleanText, normalizeUrl, toIsoDate } from "@/lib/collectors/utils";

const candidate: NormalizedCandidate = {
  sourceId: "working-source",
  sourceName: "Working source",
  sourceType: "rss",
  externalId: "story-1",
  url: "https://example.com/story",
  canonicalUrl: "https://example.com/story",
  title: "A useful story",
  excerpt: null,
  publishedAt: null,
  topic: "technology",
  isDiscovery: false,
  engagement: {},
  rawMetadata: {},
};

describe("collector utilities", () => {
  it("normalizes URLs for deterministic deduplication", () => {
    expect(
      normalizeUrl(
        "https://EXAMPLE.com/story/?utm_source=newsletter&b=2&fbclid=noise&a=1#comments",
      ),
    ).toBe("https://example.com/story?a=1&b=2");
  });

  it("rejects non-web source URLs", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(
      "Only HTTP and HTTPS source URLs are supported.",
    );
  });

  it("cleans short source excerpts without retaining markup", () => {
    expect(cleanText("<p>AI &amp; people&nbsp;working together.</p>")).toBe(
      "AI & people working together.",
    );
  });

  it("converts Unix timestamps and ignores invalid dates", () => {
    expect(toIsoDate(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
    expect(toIsoDate("not-a-date")).toBeNull();
  });
});

describe("collector runner", () => {
  it("isolates a failed source while retaining successful candidates", async () => {
    const failingCollector: Collector = {
      sourceId: "failed-source",
      sourceName: "Failed source",
      sourceType: "rss",
      fetch: async () => {
        throw new Error("feed unavailable");
      },
      normalize: () => null,
    };
    const workingCollector: Collector = {
      sourceId: "working-source",
      sourceName: "Working source",
      sourceType: "rss",
      fetch: async () => [candidate],
      normalize: (item) => item as NormalizedCandidate,
    };

    const results = await runCollectors([failingCollector, workingCollector]);

    expect(results).toEqual([
      expect.objectContaining({
        sourceId: "failed-source",
        status: "failed",
        candidateCount: 0,
        errorMessage: "feed unavailable",
      }),
      expect.objectContaining({
        sourceId: "working-source",
        status: "succeeded",
        candidateCount: 1,
        candidates: [candidate],
      }),
    ]);
  });
});
