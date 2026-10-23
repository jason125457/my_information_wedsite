/**
 * One-off maintenance: fill stories.image_url for stories created before feed
 * images were collected, by re-reading each active source's feed and matching
 * article URLs. Stories whose article has left the feed keep the placeholder.
 * No AI calls. Run with: npm run job:backfill-images
 */
import { createCollectorFromSource } from "@/lib/pipeline/ingest";
import { runCollectors, normalizeUrl, type ContentTopic } from "@/lib/collectors";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const [{ data: sources, error }, { data: topics }] = await Promise.all([
    supabase.from("sources").select("*").eq("is_active", true),
    supabase.from("topics").select("id, slug"),
  ]);
  if (error || !sources) throw new Error(`Failed to load sources: ${error?.message}`);
  const topicById = new Map((topics ?? []).map((topic) => [topic.id, topic.slug as ContentTopic]));

  const collectors = sources.flatMap((source) => {
    try {
      return [createCollectorFromSource(source, topicById.get(source.primary_topic_id ?? "") ?? "technology")];
    } catch {
      return [];
    }
  });
  const results = await runCollectors(collectors);

  const imageByUrl = new Map<string, string>();
  for (const result of results) {
    for (const candidate of result.candidates) {
      if (candidate.imageUrl) imageByUrl.set(candidate.canonicalUrl, candidate.imageUrl);
    }
  }

  const { data: stories, error: storyError } = await supabase
    .from("stories")
    .select("id, primary_url")
    .is("image_url", null);
  if (storyError || !stories) throw new Error(`Failed to load stories: ${storyError?.message}`);

  let updated = 0;
  for (const story of stories) {
    let key: string;
    try {
      key = normalizeUrl(story.primary_url);
    } catch {
      continue;
    }
    const youtubeId = story.primary_url.match(/[?&]v=([\w-]{11})/)?.[1];
    const imageUrl = imageByUrl.get(key) ?? (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined);
    if (!imageUrl) continue;
    const { error: updateError } = await supabase.from("stories").update({ image_url: imageUrl }).eq("id", story.id);
    if (!updateError) updated += 1;
  }

  console.log(JSON.stringify({ storiesWithoutImage: stories.length, feedImages: imageByUrl.size, updated }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
