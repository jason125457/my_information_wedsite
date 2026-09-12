import { describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "@/lib/cron/authorize";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import type { Classification, StorySummary } from "@/lib/ai/schemas";
import type { StructuredAIProvider, StructuredGenerationRequest } from "@/lib/ai/provider";
import {
  createCollectorFromSource,
  ingestSources,
  type IngestOptions,
} from "@/lib/pipeline/ingest";
import type { Database } from "@/lib/supabase/database.types";
import { GET, POST } from "@/app/api/cron/ingest/route";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
type RawItemRow = Database["public"]["Tables"]["raw_items"]["Row"];
type StoryRow = Database["public"]["Tables"]["stories"]["Row"];
type StorySourceRow = Database["public"]["Tables"]["story_sources"]["Row"];
type JobRunRow = Database["public"]["Tables"]["job_runs"]["Row"];

function createMockEditor(): StoryAIEditor {
  const defaultClassification: Classification = {
    topics: ["ai"],
    interest_relevance: 5,
    information_value: 5,
    importance: 4,
    freshness: 5,
    discussion_popularity: 3,
    discovery_value: 3,
    content_type: "current",
    fact_status: "official_confirmation",
  };

  const defaultSummary: StorySummary = {
    title: "AI Breakthrough Announcement",
    summary: "This is the first sentence. This is the second sentence.",
    why_recommended: "Directly relates to your AI interests.",
  };

  const provider: StructuredAIProvider = {
    async generate<T>(request: StructuredGenerationRequest<T>) {
      if (request.schemaName === "story_classification") {
        return request.schema.parse(defaultClassification);
      }
      if (request.schemaName === "story_summary") {
        return request.schema.parse(defaultSummary);
      }
      if (request.schemaName === "duplicate_decision") {
        return request.schema.parse({
          same_event: false,
          confidence: 0.9,
          reason: "Different events.",
        });
      }
      throw new Error(`Unknown schema: ${request.schemaName}`);
    },
  };

  return new StoryAIEditor(provider, { fast: "fast-model", reasoning: "reasoning-model" });
}

interface MockDatabaseState {
  sources: SourceRow[];
  topics: Array<{ id: string; slug: string; name: string }>;
  rawItems: RawItemRow[];
  stories: StoryRow[];
  storySources: StorySourceRow[];
  jobRuns: JobRunRow[];
}

function createMockSupabase(initialState?: Partial<MockDatabaseState>) {
  const state: MockDatabaseState = {
    sources: initialState?.sources ?? [
      {
        id: "source-1",
        name: "Test RSS Feed",
        type: "rss",
        url: "https://example.com/rss.xml",
        reliability_type: "official",
        primary_topic_id: "topic-ai",
        is_discovery: false,
        is_active: true,
        config: {},
        created_at: new Date().toISOString(),
      },
    ],
    topics: initialState?.topics ?? [
      { id: "topic-ai", slug: "ai", name: "AI / LLM" },
      { id: "topic-tech", slug: "technology", name: "Technology" },
    ],
    rawItems: initialState?.rawItems ? [...initialState.rawItems] : [],
    stories: initialState?.stories ? [...initialState.stories] : [],
    storySources: initialState?.storySources ? [...initialState.storySources] : [],
    jobRuns: initialState?.jobRuns ? [...initialState.jobRuns] : [],
  };

  let idCounter = 1;

  const client = {
    state,
    from: (tableName: string) => {
      return {
        select: () => {
          return {
            eq: (col: string, val: unknown) => {
              if (tableName === "sources" && col === "is_active") {
                const data = state.sources.filter((s) => s.is_active === val);
                return Promise.resolve({ data, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
            in: (col: string, values: unknown[]) => {
              if (tableName === "raw_items" && col === "canonical_url") {
                const set = new Set(values);
                const data = state.rawItems.filter((r) => set.has(r.canonical_url));
                return Promise.resolve({ data, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
            then: (onfulfilled: (res: { data: unknown; error: null }) => unknown) => {
              if (tableName === "topics") {
                return Promise.resolve(onfulfilled({ data: state.topics, error: null }));
              }
              if (tableName === "sources") {
                return Promise.resolve(onfulfilled({ data: state.sources, error: null }));
              }
              return Promise.resolve(onfulfilled({ data: [], error: null }));
            },
          };
        },
        insert: (payload: unknown) => {
          return {
            select: () => {
              return {
                single: () => {
                  if (tableName === "job_runs") {
                    const row = {
                      id: `job-${idCounter++}`,
                      job_type: "ingestion",
                      started_at: new Date().toISOString(),
                      finished_at: null,
                      status: "running" as const,
                      items_processed: 0,
                      error_message: null,
                      metadata: (((payload as Record<string, unknown>).metadata ?? {}) as unknown) as Database["public"]["Tables"]["job_runs"]["Row"]["metadata"],
                    };
                    state.jobRuns.push(row);
                    return Promise.resolve({ data: row, error: null });
                  }
                  if (tableName === "stories") {
                    const storyData = payload as Database["public"]["Tables"]["stories"]["Insert"];
                    const row: StoryRow = {
                      id: `story-${idCounter++}`,
                      created_at: new Date().toISOString(),
                      published_at: storyData.published_at ?? null,
                      ...storyData,
                    };
                    state.stories.push(row);
                    return Promise.resolve({ data: row, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        upsert: (payload: unknown) => {
          if (tableName === "raw_items") {
            const items = (Array.isArray(payload) ? payload : [payload]) as Database["public"]["Tables"]["raw_items"]["Insert"][];
            const insertedRows: Array<{ id: string; canonical_url: string }> = [];
            for (const item of items) {
              const existingIndex = state.rawItems.findIndex((r) => r.canonical_url === item.canonical_url);
              if (existingIndex >= 0) {
                state.rawItems[existingIndex] = {
                  ...state.rawItems[existingIndex],
                  ...item,
                };
                insertedRows.push({ id: state.rawItems[existingIndex].id, canonical_url: item.canonical_url });
              } else {
                const row: RawItemRow = {
                  id: `raw-${idCounter++}`,
                  source_id: item.source_id,
                  external_id: item.external_id ?? null,
                  url: item.url,
                  canonical_url: item.canonical_url,
                  title: item.title,
                  excerpt: item.excerpt ?? null,
                  published_at: item.published_at ?? null,
                  fetched_at: item.fetched_at ?? new Date().toISOString(),
                  raw_metadata: item.raw_metadata ?? {},
                };
                state.rawItems.push(row);
                insertedRows.push({ id: row.id, canonical_url: row.canonical_url });
              }
            }
            return {
              select: () => Promise.resolve({ data: insertedRows, error: null }),
            };
          }
          if (tableName === "story_sources") {
            const items = (Array.isArray(payload) ? payload : [payload]) as StorySourceRow[];
            for (const item of items) {
              const existingIndex = state.storySources.findIndex(
                (s) => s.story_id === item.story_id && s.raw_item_id === item.raw_item_id,
              );
              if (existingIndex >= 0) {
                state.storySources[existingIndex] = item;
              } else {
                state.storySources.push(item);
              }
            }
            return Promise.resolve({ data: items, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update: (payload: unknown) => {
          return {
            eq: (col: string, val: unknown) => {
              if (tableName === "job_runs" && col === "id") {
                const target = state.jobRuns.find((j) => j.id === val);
                if (target) {
                  Object.assign(target, payload);
                }
                return Promise.resolve({ data: target, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  return client;
}

const mockRssXml = `
  <rss version="2.0">
    <channel>
      <item>
        <guid>article-101</guid>
        <title>New AI Model Released Today</title>
        <link>https://example.com/posts/article-101</link>
        <description>Exciting new intelligence updates.</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
    </channel>
  </rss>
`;

describe("Cron authentication", () => {
  it("rejects unauthorized GET and POST requests", async () => {
    const unauthReq = new Request("https://example.com/api/cron/ingest", { method: "GET" });
    const getRes = await GET(unauthReq);
    expect(getRes.status).toBe(401);

    const postReq = new Request("https://example.com/api/cron/ingest", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(401);
  });

  it("authenticates valid bearer token for cron", () => {
    const req = new Request("https://example.com/api/cron/ingest", {
      headers: { Authorization: "Bearer test-secret-12345" },
    });
    expect(isAuthorizedCronRequest(req, "test-secret-12345")).toBe(true);
  });
});

describe("Collector failure isolation", () => {
  it("continues ingestion when one source fails and records partial status", async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("broken.example.com")) {
        throw new Error("DNS resolution failed");
      }
      return new Response(mockRssXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    });

    const mockSupabase = createMockSupabase({
      sources: [
        {
          id: "source-ok",
          name: "Working RSS",
          type: "rss",
          url: "https://example.com/rss.xml",
          reliability_type: "official",
          primary_topic_id: "topic-ai",
          is_discovery: false,
          is_active: true,
          config: {},
          created_at: new Date().toISOString(),
        },
        {
          id: "source-broken",
          name: "Broken RSS",
          type: "rss",
          url: "https://broken.example.com/rss.xml",
          reliability_type: "community",
          primary_topic_id: "topic-tech",
          is_discovery: false,
          is_active: true,
          config: {},
          created_at: new Date().toISOString(),
        },
      ],
    });

    const result = await ingestSources({
      supabase: mockSupabase as unknown as IngestOptions["supabase"],
      editor: createMockEditor(),
      fetchImplementation: mockFetch as typeof fetch,
    });

    expect(result.status).toBe("partial");
    expect(result.itemsProcessed).toBe(1);

    const okStat = result.sources.find((s) => s.sourceId === "source-ok");
    const brokenStat = result.sources.find((s) => s.sourceId === "source-broken");

    expect(okStat?.fetchedCount).toBe(1);
    expect(okStat?.insertedCount).toBe(1);
    expect(okStat?.error).toBeNull();

    expect(brokenStat?.fetchedCount).toBe(0);
    expect(brokenStat?.error).toContain("DNS resolution failed");

    // job_runs record
    const jobRun = mockSupabase.state.jobRuns[0];
    expect(jobRun.status).toBe("partial");
    expect(jobRun.items_processed).toBe(1);
  });
});

describe("Ingestion idempotency & raw_item duplicate handling", () => {
  it("does not create duplicate raw_items or duplicate stories on re-run", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(mockRssXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    });

    const mockSupabase = createMockSupabase();
    const editor = createMockEditor();

    // First run
    const firstResult = await ingestSources({
      supabase: mockSupabase as unknown as IngestOptions["supabase"],
      editor,
      fetchImplementation: mockFetch as typeof fetch,
    });

    expect(firstResult.status).toBe("succeeded");
    expect(firstResult.itemsProcessed).toBe(1);
    expect(mockSupabase.state.rawItems).toHaveLength(1);
    expect(mockSupabase.state.stories).toHaveLength(1);
    expect(mockSupabase.state.storySources).toHaveLength(1);
    expect(mockSupabase.state.storySources[0].is_primary).toBe(true);

    // Second run with the exact same feed content
    const secondResult = await ingestSources({
      supabase: mockSupabase as unknown as IngestOptions["supabase"],
      editor,
      fetchImplementation: mockFetch as typeof fetch,
    });

    // Re-run should detect duplicate canonical URL and skip AI processing
    expect(secondResult.status).toBe("succeeded");
    expect(secondResult.itemsProcessed).toBe(0);
    expect(secondResult.totals.duplicates).toBe(1);

    // Stories and raw items counts must NOT increase
    expect(mockSupabase.state.rawItems).toHaveLength(1);
    expect(mockSupabase.state.stories).toHaveLength(1);
    expect(mockSupabase.state.storySources).toHaveLength(1);
  });
});

describe("Ingestion deployment readiness", () => {
  it("records a partial job without fetching when AI is not configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL_FAST", "");
    vi.stubEnv("GEMINI_MODEL_REASONING", "");
    try {
      const mockFetch = vi.fn();
      const mockSupabase = createMockSupabase();
      const result = await ingestSources({
        supabase: mockSupabase as unknown as IngestOptions["supabase"],
        fetchImplementation: mockFetch as typeof fetch,
      });

      expect(result.status).toBe("partial");
      expect(result.itemsProcessed).toBe(0);
      expect(result.warning).toContain("GEMINI_API_KEY");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSupabase.state.jobRuns[0].status).toBe("partial");
      expect(mockSupabase.state.jobRuns[0].error_message).toContain("AI ingestion is not configured");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Story persistence and primary source linking", () => {
  it("persists stories with primary topic and sets is_primary correctly", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(mockRssXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    });

    const mockSupabase = createMockSupabase();
    const editor = createMockEditor();

    const result = await ingestSources({
      supabase: mockSupabase as unknown as IngestOptions["supabase"],
      editor,
      fetchImplementation: mockFetch as typeof fetch,
    });

    expect(result.itemsProcessed).toBe(1);

    const story = mockSupabase.state.stories[0];
    expect(story.title).toBe("AI Breakthrough Announcement");
    expect(story.summary).toContain("This is the first sentence.");
    expect(story.why_recommended).toContain("Directly relates to your AI interests.");
    expect(story.primary_topic_id).toBe("topic-ai");
    expect(story.final_score).toBeGreaterThan(0);

    const sourceLink = mockSupabase.state.storySources[0];
    expect(sourceLink.story_id).toBe(story.id);
    expect(sourceLink.raw_item_id).toBe(mockSupabase.state.rawItems[0].id);
    expect(sourceLink.is_primary).toBe(true);
  });
});

describe("createCollectorFromSource", () => {
  it("instantiates Hacker News collector from source", () => {
    const collector = createCollectorFromSource(
      {
        id: "hn-1",
        name: "Hacker News",
        type: "hacker_news",
        url: "https://news.ycombinator.com",
        reliability_type: "community",
        primary_topic_id: null,
        is_discovery: false,
        is_active: true,
        config: { list: "topstories" },
        created_at: new Date().toISOString(),
      },
      "technology",
    );
    expect(collector.sourceType).toBe("hacker_news");
    expect(collector.sourceId).toBe("hn-1");
  });

  it("handles missing credentials for Reddit gracefully by throwing an error in factory", () => {
    expect(() =>
      createCollectorFromSource(
        {
          id: "reddit-1",
          name: "r/technology",
          type: "reddit",
          url: "https://reddit.com/r/technology",
          reliability_type: "community",
          primary_topic_id: null,
          is_discovery: false,
          is_active: true,
          config: {},
          created_at: new Date().toISOString(),
        },
        "technology",
      ),
    ).toThrow("Reddit OAuth credentials");
  });
});
