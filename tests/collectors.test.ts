import { describe, expect, it, vi } from "vitest";

import { HackerNewsCollector } from "@/lib/collectors/hacker-news";
import { RssCollector } from "@/lib/collectors/rss";
import { runCollector } from "@/lib/collectors/runner";
import { createCollectorFromSource } from "@/lib/pipeline/ingest";
import type { Database } from "@/lib/supabase/database.types";

type FetchImplementation = typeof fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/xml" },
  });
}

describe("RSS and Atom collector", () => {
  it("normalizes RSS items and removes tracking parameters", async () => {
    const fetchMock = vi.fn(async () =>
      xmlResponse(`
        <rss version="2.0">
          <channel>
            <item>
              <guid>rss-1</guid>
              <title>Useful &amp; calm</title>
              <link>https://example.com/posts/one/?utm_source=rss</link>
              <description><![CDATA[<p>A concise source summary.</p>]]></description>
              <pubDate>Tue, 10 Sep 2024 12:00:00 GMT</pubDate>
              <author>Editor</author>
              <category>AI</category>
            </item>
          </channel>
        </rss>
      `),
    ) as FetchImplementation;
    const collector = new RssCollector({
      sourceId: "rss-example",
      sourceName: "Example RSS",
      feedUrl: "https://example.com/feed.xml",
      topic: "ai",
      fetchImplementation: fetchMock,
    });

    const result = await runCollector(collector);

    expect(result.status).toBe("succeeded");
    expect(result.candidates).toEqual([
      expect.objectContaining({
        externalId: "rss-1",
        title: "Useful & calm",
        canonicalUrl: "https://example.com/posts/one",
        excerpt: "A concise source summary.",
        publishedAt: "2024-09-10T12:00:00.000Z",
        topic: "ai",
      }),
    ]);
  });

  it("supports Atom alternate links and relative URLs", async () => {
    const fetchMock = vi.fn(async () =>
      xmlResponse(`
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>tag:example.com,2024:two</id>
            <title>Atom discovery</title>
            <link rel="alternate" href="/posts/two" />
            <summary>Worth finding later.</summary>
            <updated>2024-09-11T01:02:03Z</updated>
          </entry>
        </feed>
      `),
    ) as FetchImplementation;
    const collector = new RssCollector({
      sourceId: "atom-example",
      sourceName: "Example Atom",
      feedUrl: "https://example.com/feed/atom.xml",
      topic: "music",
      isDiscovery: true,
      fetchImplementation: fetchMock,
    });

    const result = await runCollector(collector);

    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        externalId: "tag:example.com,2024:two",
        canonicalUrl: "https://example.com/posts/two",
        isDiscovery: true,
        topic: "music",
      }),
    );
  });
});

describe("Hacker News collector", () => {
  it("uses the official API and tolerates an individual item failure", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) return jsonResponse([101, 102]);
      if (url.endsWith("/item/101.json")) {
        return jsonResponse({
          id: 101,
          type: "story",
          title: "A technical launch",
          url: "https://vendor.example/launch?utm_medium=hn",
          by: "alice",
          time: 1_700_000_000,
          score: 120,
          descendants: 31,
        });
      }
      return jsonResponse({ error: "temporarily unavailable" }, 503);
    }) as FetchImplementation;
    const collector = new HackerNewsCollector({
      sourceId: "hn-top",
      maxItems: 2,
      fetchImplementation: fetchMock,
    });

    const result = await runCollector(collector);

    expect(result.status).toBe("succeeded");
    expect(result.candidateCount).toBe(1);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        externalId: "101",
        canonicalUrl: "https://vendor.example/launch",
        engagement: { score: 120, commentCount: 31 },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

function sourceRow(overrides: Partial<SourceRow>): SourceRow {
  return {
    id: "source-1",
    name: "Source",
    type: "rss",
    url: "https://example.com",
    reliability_type: "community",
    primary_topic_id: null,
    is_discovery: false,
    is_active: true,
    config: {},
    created_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Reddit via RSS", () => {
  it("reads the public subreddit Atom feed without OAuth credentials", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/r/shoegaze/top/.rss");
      expect(url.searchParams.get("t")).toBe("week");
      return xmlResponse(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>t3_abc123</id>
            <title>A band worth hearing</title>
            <link href="https://www.reddit.com/r/shoegaze/comments/abc123/a_band_worth_hearing/" />
            <content type="html">&lt;p&gt;Community members explain why.&lt;/p&gt;</content>
            <published>2024-09-10T11:12:13+00:00</published>
          </entry>
        </feed>`);
    }) as FetchImplementation;

    const collector = createCollectorFromSource(
      sourceRow({
        id: "reddit-shoegaze",
        name: "r/shoegaze",
        type: "reddit",
        url: "https://www.reddit.com/r/shoegaze",
        is_discovery: true,
        config: { listing: "top", period: "week" },
      }),
      "music",
      fetchMock,
    );
    const result = await runCollector(collector);

    expect(result.status).toBe("succeeded");
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        sourceType: "reddit",
        externalId: "t3_abc123",
        url: "https://www.reddit.com/r/shoegaze/comments/abc123/a_band_worth_hearing/",
        excerpt: "Community members explain why.",
        topic: "music",
        isDiscovery: true,
      }),
    );
  });

  it("rejects an invalid subreddit name", () => {
    expect(() =>
      createCollectorFromSource(
        sourceRow({ type: "reddit", url: "https://example.com", config: { subreddit: "x" } }),
        "music",
      ),
    ).toThrow("no valid subreddit");
  });
});

describe("YouTube via RSS", () => {
  it("reads the public channel uploads feed without an API key", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/feeds/videos.xml");
      expect(url.searchParams.get("channel_id")).toBe("channel-1");
      return xmlResponse(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
          <entry>
            <id>yt:video:video-1</id>
            <title>Night photography walk</title>
            <link rel="alternate" href="https://www.youtube.com/watch?v=video-1"/>
            <published>2024-09-10T11:12:13+00:00</published>
            <media:group><media:description>A practical city shoot.</media:description></media:group>
          </entry>
        </feed>`);
    }) as FetchImplementation;

    const collector = createCollectorFromSource(
      sourceRow({
        id: "youtube-photo",
        name: "Photo Channel",
        type: "youtube",
        url: "https://www.youtube.com/channel/channel-1",
      }),
      "photography",
      fetchMock,
    );
    const result = await runCollector(collector);

    expect(result.status).toBe("succeeded");
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        sourceType: "youtube",
        externalId: "yt:video:video-1",
        canonicalUrl: "https://www.youtube.com/watch?v=video-1",
        title: "Night photography walk",
        excerpt: "A practical city shoot.",
        topic: "photography",
      }),
    );
  });
});
