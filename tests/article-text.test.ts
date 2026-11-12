import { describe, expect, it, vi } from "vitest";

import type { EditorialJudgement, StorySummary } from "@/lib/ai/schemas";
import type { StoryAIEditor, SummaryRequest } from "@/lib/ai/story-editor";
import { extractArticleText, fetchArticleText } from "@/lib/article/extract";
import type { NormalizedCandidate } from "@/lib/collectors/types";
import { processCandidates } from "@/lib/pipeline/process";

const paragraph = (text: string) => `<p>${text} ${"More detail about the event and its consequences. ".repeat(2)}</p>`;

describe("extractArticleText", () => {
  it("keeps the article's paragraphs and drops scripts, navigation and short fragments", () => {
    const html = `<html><body>
      <nav><p>${"Navigation link text that is long enough to count. ".repeat(3)}</p></nav>
      <script>var tracking = "<p>not text</p>";</script>
      <article>
        ${paragraph("Ring&#8217;s drone will rely on AI autopilot &amp; preset routes.")}
        <p>Share</p>
        ${paragraph("The device launches in January for a limited group of buyers.")}
        ${paragraph("Critics point to an earlier demo where the drone hit a wall.")}
      </article>
      <footer><p>${"Copyright notice that is long enough to count as text. ".repeat(3)}</p></footer>
    </body></html>`;

    const text = extractArticleText(html);
    expect(text).not.toBeNull();
    expect(text).toContain("Ring’s drone will rely on AI autopilot & preset routes.");
    expect(text).toContain("launches in January");
    expect(text).not.toContain("Share");
    expect(text).not.toContain("Navigation");
    expect(text).not.toContain("Copyright");
    expect(text).not.toContain("tracking");
  });

  it("accepts shorter Chinese paragraphs", () => {
    const zh = "經濟部表示，今年國際大廠對台採購金額預估達3258億美元，首度突破3000億美元大關。";
    const html = `<main>${Array.from({ length: 8 }, () => `<p>${zh}</p><p>${zh}再創新高。</p>`).join("")}</main>`;
    expect(extractArticleText(html)).toContain("3258億美元");
  });

  it("returns null when a page has too little readable text, and respects the length cap", () => {
    expect(extractArticleText("<article><p>Subscribe to continue reading.</p></article>")).toBeNull();
    const long = `<article>${Array.from({ length: 200 }, (_, i) => paragraph(`Paragraph ${i}.`)).join("")}</article>`;
    expect(extractArticleText(long, 1_000)!.length).toBeLessThanOrEqual(1_000);
  });
});

describe("fetchArticleText", () => {
  it("skips hosts that never serve the article and tolerates failed requests", async () => {
    const fetchImplementation = vi.fn(async () => new Response("nope", { status: 403 }));
    expect(await fetchArticleText("https://news.google.com/rss/articles/abc", { fetchImplementation })).toBeNull();
    expect(await fetchArticleText("https://www.reddit.com/r/x/comments/1", { fetchImplementation })).toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(await fetchArticleText("https://example.com/story", { fetchImplementation })).toBeNull();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("ignores non-HTML responses", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    expect(await fetchArticleText("https://example.com/file.pdf", { fetchImplementation })).toBeNull();
  });
});

describe("summaries use the original article text", () => {
  const judgement: EditorialJudgement = {
    topics: ["ai"],
    interest_relevance: 5,
    information_value: 5,
    importance: 4,
    discovery_value: 3,
  };
  const candidate = (i: number): NormalizedCandidate => ({
    sourceId: `source-${i}`,
    sourceName: "Source",
    sourceType: "rss",
    externalId: `item-${i}`,
    url: `https://site${i}.example/story`,
    canonicalUrl: `https://site${i}.example/story`,
    title: ["Distinct headline about agents", "Another unrelated chip story", "Third topic on privacy"][i]!,
    excerpt: "Short blurb.",
    publishedAt: "2026-10-23T10:00:00Z",
    topic: "ai",
    isDiscovery: false,
    engagement: {},
    rawMetadata: {},
  });

  it("fetches only selected stories and hands their text to the summarizer", async () => {
    const seen: SummaryRequest[] = [];
    const editor = {
      classifyMany: async (batch: NormalizedCandidate[]) => batch.map(() => judgement),
      summarizeMany: async (batch: SummaryRequest[]) => {
        seen.push(...batch);
        return batch.map((): StorySummary => ({
          title: "中文標題",
          summary: "一。二。三。",
          key_points: ["重點。"],
          why_recommended: "理由。",
        }));
      },
      decideDuplicate: vi.fn(async () => ({ same_event: false, confidence: 0.9, reason: "different" })),
    } as unknown as StoryAIEditor;
    const fetchText = vi.fn(async (url: string) => (url.includes("site1") ? null : `Full text of ${url}`));

    const result = await processCandidates([0, 1, 2].map(candidate), editor, {
      now: new Date("2026-10-23T12:00:00Z"),
      minimumScore: 0,
      maxStories: 2,
      fetchArticleText: fetchText,
    });

    expect(result.stories).toHaveLength(2);
    expect(fetchText).toHaveBeenCalledTimes(2);
    expect(seen.map((request) => request.articleText)).toEqual(
      result.stories.map((story) =>
        story.candidate.url.includes("site1") ? null : `Full text of ${story.candidate.url}`,
      ),
    );
    expect(result.stories[0]!.summary.key_points).toEqual(["重點。"]);
  });
});
