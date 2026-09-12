import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { GeminiInteractionsProvider, extractOutputText } from "@/lib/ai/provider";
import { classificationSchema } from "@/lib/ai/schemas";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import type { NormalizedCandidate } from "@/lib/collectors/types";

const classification = {
  topics: ["ai"], interest_relevance: 5, information_value: 4, importance: 4,
  freshness: 4, discussion_popularity: 3, discovery_value: 3,
  content_type: "current", fact_status: "official_confirmation",
};

function interaction(output: unknown) {
  return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(output) }] }] });
}

function candidate(index: number): NormalizedCandidate {
  return {
    sourceId: `source-${index}`, sourceName: "Official", sourceType: "rss",
    externalId: `${index}`, url: `https://example.com/${index}`,
    canonicalUrl: `https://example.com/${index}`, title: `Story ${index}`,
    excerpt: "Official release notes.", publishedAt: "2026-09-12T00:00:00Z",
    topic: "ai", isDiscovery: false, engagement: {}, rawMetadata: {},
  };
}

describe("Gemini Interactions provider", () => {
  it("sends a stateless structured request and validates output", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      expect(options?.headers).toMatchObject({ "x-goog-api-key": "private-key" });
      const body = JSON.parse(String(options?.body));
      expect(body).toMatchObject({ model: "gemini-fast", store: false, system_instruction: "Classify", input: "Story" });
      expect(body.response_format.schema.required).toContain("fact_status");
      return interaction(classification);
    });
    const provider = new GeminiInteractionsProvider("private-key", { fetchImplementation: fetchMock as typeof fetch });
    const result = await provider.generate({
      model: "gemini-fast", schemaName: "story_classification", schema: classificationSchema,
      instructions: "Classify", input: "Story",
    });
    expect(result.topics).toEqual(["ai"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses separate start-rate limits per model and retries a 429 once", async () => {
    let clock = 0;
    const starts: Array<{ model: string; at: number }> = [];
    let call = 0;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      starts.push({ model: body.model, at: clock });
      call += 1;
      return call === 1 ? new Response("rate limited", { status: 429 }) : interaction({ same_event: true, confidence: 0.9, reason: "same" });
    });
    const provider = new GeminiInteractionsProvider("private-key", {
      fetchImplementation: fetchMock as typeof fetch,
      requestsPerMinute: 15,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    const request = {
      model: "gemini-one", schemaName: "duplicate_decision", schema: z.object({ same_event: z.boolean(), confidence: z.number(), reason: z.string() }),
      instructions: "Compare", input: "A and B",
    };
    await provider.generate(request);
    await provider.generate({ ...request, model: "gemini-two" });
    expect(starts).toEqual([
      { model: "gemini-one", at: 0 },
      { model: "gemini-one", at: 5_000 },
      { model: "gemini-two", at: 5_000 },
    ]);
  });

  it("rejects malformed model output and batch index mismatches", async () => {
    expect(() => extractOutputText({ status: "completed", steps: [] })).toThrow("no text");
    const provider = new GeminiInteractionsProvider("private-key", {
      fetchImplementation: (async () => interaction({ results: [{ index: 0, classification }] })) as typeof fetch,
    });
    const editor = new StoryAIEditor(provider, { fast: "gemini-fast", reasoning: "gemini-reasoning" });
    await expect(editor.classifyMany([candidate(0), candidate(1)])).rejects.toThrow("count mismatch");
  });
});
