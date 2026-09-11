import { describe, expect, it, vi } from "vitest";

import { HackerNewsCollector } from "@/lib/collectors/hacker-news";
import { RedditCollector } from "@/lib/collectors/reddit";
import { RssCollector } from "@/lib/collectors/rss";
import { runCollector } from "@/lib/collectors/runner";
import { YouTubeCollector } from "@/lib/collectors/youtube";

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

describe("Reddit collector", () => {
  it("uses OAuth, caches the token, and keeps community claims on Reddit", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/access_token")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe("grant_type=client_credentials");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          `Basic ${Buffer.from("client:secret").toString("base64")}`,
        );
        return jsonResponse({ access_token: "oauth-token", expires_in: 3600 });
      }

      expect(url).toContain("oauth.reddit.com/r/shoegaze/top");
      expect(url).toContain("t=day");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer oauth-token");
      expect(new Headers(init?.headers).get("User-Agent")).toBe("personal-feed:test:v1");
      return jsonResponse({
        data: {
          children: [
            {
              kind: "t3",
              data: {
                id: "abc123",
                name: "t3_abc123",
                title: "A band worth hearing",
                permalink: "/r/shoegaze/comments/abc123/a_band_worth_hearing/",
                selftext: "Community members explain why.",
                author: "listener",
                subreddit: "shoegaze",
                created_utc: 1_700_000_000,
                score: 72,
                num_comments: 14,
                url_overridden_by_dest: "https://band.example/album",
              },
            },
          ],
        },
      });
    });
    const fetchMock = fetchSpy as FetchImplementation;
    const collector = new RedditCollector({
      sourceId: "reddit-shoegaze",
      subreddit: "shoegaze",
      clientId: "client",
      clientSecret: "secret",
      userAgent: "personal-feed:test:v1",
      listing: "top",
      topic: "music",
      isDiscovery: true,
      fetchImplementation: fetchMock,
    });

    const first = await runCollector(collector);
    await collector.fetch();

    expect(first.candidates[0]).toEqual(
      expect.objectContaining({
        url: "https://www.reddit.com/r/shoegaze/comments/abc123/a_band_worth_hearing/",
        topic: "music",
        isDiscovery: true,
        engagement: { score: 72, commentCount: 14 },
      }),
    );
    expect(fetchSpy.mock.calls.filter(([input]) => String(input).includes("access_token"))).toHaveLength(
      1,
    );
  });
});

describe("YouTube collector", () => {
  it("resolves the official uploads playlist and normalizes public videos", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels")) {
        expect(url.searchParams.get("part")).toBe("contentDetails");
        expect(url.searchParams.get("id")).toBe("channel-1");
        return jsonResponse({
          items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-1" } } }],
        });
      }

      expect(url.pathname).toMatch(/\/playlistItems$/);
      expect(url.searchParams.get("playlistId")).toBe("uploads-1");
      return jsonResponse({
        items: [
          {
            id: "playlist-item-1",
            snippet: {
              title: "Night photography walk",
              description: "A practical city shoot.",
              channelId: "channel-1",
              channelTitle: "Photo Channel",
              resourceId: { videoId: "video-1" },
            },
            contentDetails: {
              videoId: "video-1",
              videoPublishedAt: "2024-09-10T11:12:13Z",
            },
            status: { privacyStatus: "public" },
          },
        ],
      });
    }) as FetchImplementation;
    const collector = new YouTubeCollector({
      sourceId: "youtube-photo",
      sourceName: "Photo Channel",
      channelId: "channel-1",
      apiKey: "test-api-key",
      topic: "photography",
      fetchImplementation: fetchMock,
    });

    const result = await runCollector(collector);

    expect(result.status).toBe("succeeded");
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        externalId: "video-1",
        canonicalUrl: "https://www.youtube.com/watch?v=video-1",
        title: "Night photography walk",
        topic: "photography",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
