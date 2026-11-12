/**
 * One-off maintenance: rewrite the summary and add key points for recent
 * stories created before summaries read the original article. Re-fetches each
 * story's page transiently (nothing but the derived text is stored).
 * Run with: npm run job:backfill-key-points            (top 60 of the last 72 h)
 *           npm run job:backfill-key-points -- --limit 30 --hours 48
 * Uses one Gemini request per 8 stories.
 */
import { getAIModelConfig, getGeminiApiKey, getGeminiMinIntervalMs } from "@/lib/ai/config";
import { GeminiProvider } from "@/lib/ai/provider";
import type { Classification } from "@/lib/ai/schemas";
import { StoryAIEditor, type SummaryRequest } from "@/lib/ai/story-editor";
import { fetchArticleText } from "@/lib/article/extract";
import type { ContentTopic, NormalizedCandidate, SourceType } from "@/lib/collectors/types";
import { createAdminClient } from "@/lib/supabase/admin";

function argument(name: string, fallback: number) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const limit = argument("limit", 60);
  const hours = argument("hours", 72);
  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data: stories, error } = await supabase
    .from("stories")
    .select("*")
    .gte("created_at", since)
    .filter("key_points", "eq", "{}")
    .order("final_score", { ascending: false })
    .limit(limit);
  if (error || !stories) throw new Error(`Failed to load stories: ${error?.message}`);
  if (!stories.length) {
    console.log(JSON.stringify({ storiesChecked: 0, updated: 0 }));
    return;
  }

  const ids = stories.map((story) => story.id);
  const [{ data: links }, { data: topics }, { data: sources }] = await Promise.all([
    supabase.from("story_sources").select("story_id, raw_item_id, is_primary").in("story_id", ids),
    supabase.from("topics").select("id, slug"),
    supabase.from("sources").select("id, name, type, is_discovery"),
  ]);
  const primaryRawId = new Map<string, string>();
  for (const link of links ?? []) {
    if (link.is_primary || !primaryRawId.has(link.story_id)) primaryRawId.set(link.story_id, link.raw_item_id);
  }
  const { data: rawItems } = await supabase
    .from("raw_items")
    .select("id, source_id, external_id, url, canonical_url, title, excerpt, published_at")
    .in("id", [...new Set(primaryRawId.values())]);
  const rawById = new Map((rawItems ?? []).map((item) => [item.id, item]));
  const topicById = new Map((topics ?? []).map((topic) => [topic.id, topic.slug as ContentTopic]));
  const sourceById = new Map((sources ?? []).map((source) => [source.id, source]));

  const requests: Array<{ storyId: string; request: SummaryRequest }> = [];
  await Promise.all(
    stories.map(async (story) => {
      const raw = rawById.get(primaryRawId.get(story.id) ?? "");
      const source = raw ? sourceById.get(raw.source_id) : undefined;
      const topic = topicById.get(story.primary_topic_id) ?? "technology";
      const candidate: NormalizedCandidate = {
        sourceId: raw?.source_id ?? "unknown",
        sourceName: source?.name ?? "Original source",
        sourceType: (source?.type ?? "rss") as SourceType,
        externalId: raw?.external_id ?? null,
        url: story.primary_url,
        canonicalUrl: raw?.canonical_url ?? story.primary_url,
        title: raw?.title ?? story.title,
        excerpt: raw?.excerpt ?? story.summary,
        publishedAt: story.published_at,
        topic,
        isDiscovery: story.content_type === "discovery",
        engagement: {},
        rawMetadata: {},
      };
      const classification: Classification = {
        topics: [topic],
        interest_relevance: story.interest_relevance,
        information_value: story.information_value,
        importance: story.importance,
        freshness: story.freshness,
        discussion_popularity: story.discussion_popularity,
        discovery_value: story.discovery_value,
        content_type: story.content_type,
        fact_status: "unknown",
      };
      const articleText = await fetchArticleText(story.primary_url);
      requests.push({ storyId: story.id, request: { candidate, classification, articleText } });
    }),
  );

  const editor = new StoryAIEditor(
    new GeminiProvider(getGeminiApiKey(), { minIntervalMs: getGeminiMinIntervalMs() }),
    getAIModelConfig(),
  );
  let updated = 0;
  let failedBatches = 0;
  for (let index = 0; index < requests.length; index += 8) {
    const batch = requests.slice(index, index + 8);
    try {
      const summaries = await editor.summarizeMany(batch.map((item) => item.request));
      for (const [position, summary] of summaries.entries()) {
        if (!summary) continue;
        const { error: updateError } = await supabase
          .from("stories")
          .update({ summary: summary.summary, key_points: summary.key_points })
          .eq("id", batch[position]!.storyId);
        if (!updateError) updated += 1;
      }
    } catch (batchError) {
      failedBatches += 1;
      console.error("Summary batch failed:", batchError instanceof Error ? batchError.message : batchError);
    }
  }

  console.log(
    JSON.stringify({
      storiesChecked: stories.length,
      withArticleText: requests.filter((item) => item.request.articleText).length,
      updated,
      failedBatches,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
