import "server-only";

import type { FeedStory, TopicSlug } from "@/lib/feed/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
export type FeedView = "all" | "saved" | "read-later" | "history";

const validTopics = new Set<TopicSlug>([
  "ai",
  "cybersecurity",
  "technology",
  "finance",
  "world",
  "music",
  "photography",
]);

export async function loadStoriesByIds(
  supabase: SupabaseClient,
  profileId: string | null,
  storyIds: string[],
): Promise<FeedStory[]> {
  if (!storyIds.length) return [];

  // Deduplicate IDs while preserving caller order
  const orderedUniqueIds = [...new Set(storyIds)];

  const { data: storyRows, error: storyError } = await supabase
    .from("stories")
    .select("id,title,summary,why_recommended,primary_topic_id,content_type,primary_url,published_at")
    .in("id", orderedUniqueIds);

  if (storyError) throw new Error(`Unable to load stories: ${storyError.message}`);
  if (!storyRows || !storyRows.length) return [];

  const foundStoryIds = storyRows.map((story) => story.id);
  const topicIds = [...new Set(storyRows.map((story) => story.primary_topic_id))];

  const [topicResult, stateResult, sourceLinkResult] = await Promise.all([
    supabase.from("topics").select("id,slug,name").in("id", topicIds),
    profileId
      ? supabase
          .from("story_state")
          .select("story_id,is_read,is_saved,is_read_later,is_not_interested")
          .eq("profile_id", profileId)
          .in("story_id", foundStoryIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("story_sources").select("story_id,raw_item_id,is_primary").in("story_id", foundStoryIds),
  ]);

  if (topicResult.error) throw new Error(`Unable to load topics: ${topicResult.error.message}`);
  if (stateResult.error) throw new Error(`Unable to load story state: ${stateResult.error.message}`);
  if (sourceLinkResult.error) {
    throw new Error(`Unable to load story sources: ${sourceLinkResult.error.message}`);
  }

  const rawItemIds = sourceLinkResult.data.map((link) => link.raw_item_id);
  const rawResult = rawItemIds.length
    ? await supabase.from("raw_items").select("id,source_id").in("id", rawItemIds)
    : { data: [], error: null };
  if (rawResult.error) throw new Error(`Unable to load source items: ${rawResult.error.message}`);

  const sourceIds = [...new Set(rawResult.data.map((item) => item.source_id))];
  const sourceResult = sourceIds.length
    ? await supabase.from("sources").select("id,name").in("id", sourceIds)
    : { data: [], error: null };
  if (sourceResult.error) throw new Error(`Unable to load sources: ${sourceResult.error.message}`);

  const topics = new Map(topicResult.data.map((topic) => [topic.id, topic]));
  const states = new Map(stateResult.data.map((state) => [state.story_id, state]));
  const rawItems = new Map(rawResult.data.map((item) => [item.id, item]));
  const sources = new Map(sourceResult.data.map((source) => [source.id, source]));

  const linksByStory = new Map<string, typeof sourceLinkResult.data>();
  for (const link of sourceLinkResult.data) {
    const links = linksByStory.get(link.story_id) ?? [];
    links.push(link);
    linksByStory.set(link.story_id, links);
  }

  const mappedStories = new Map<string, FeedStory>();
  for (const story of storyRows) {
    const topic = topics.get(story.primary_topic_id);
    if (!topic || !validTopics.has(topic.slug as TopicSlug)) continue;

    const state = states.get(story.id);
    const links = linksByStory.get(story.id) ?? [];
    const primaryLink = links.find((link) => link.is_primary) ?? links[0];
    const rawItem = primaryLink ? rawItems.get(primaryLink.raw_item_id) : undefined;
    const source = rawItem ? sources.get(rawItem.source_id) : undefined;
    const publishedAt = story.published_at ?? "";

    mappedStories.set(story.id, {
      id: story.id,
      title: story.title,
      summary: story.summary,
      whyRecommended: story.why_recommended,
      source: source?.name ?? "Original source",
      sourceCount: Math.max(1, links.length),
      publishedAt,
      publishedLabel: formatPublishedDate(publishedAt),
      topic: topic.slug as FeedStory["topic"],
      topicLabel: topic.name,
      contentType: story.content_type === "current" ? "Current" : "Discovery",
      primaryUrl: story.primary_url,
      isRead: state?.is_read ?? false,
      isSaved: state?.is_saved ?? false,
      isReadLater: state?.is_read_later ?? false,
      isNotInterested: state?.is_not_interested ?? false,
    });
  }

  // Preserve the caller's exact ordering
  const orderedResult: FeedStory[] = [];
  for (const id of orderedUniqueIds) {
    const story = mappedStories.get(id);
    if (story) orderedResult.push(story);
  }

  return orderedResult;
}

export async function loadFeed(
  supabase: SupabaseClient,
  profileId: string | null,
  view: FeedView = "all",
): Promise<FeedStory[]> {
  if (view === "saved") {
    if (!profileId) return [];
    const { data: stateRows, error } = await supabase
      .from("story_state")
      .select("story_id")
      .eq("profile_id", profileId)
      .eq("is_saved", true)
      .order("saved_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(`Unable to load saved stories: ${error.message}`);
    if (!stateRows || !stateRows.length) return [];
    return loadStoriesByIds(supabase, profileId, stateRows.map((r) => r.story_id));
  }

  if (view === "read-later") {
    if (!profileId) return [];
    const { data: stateRows, error } = await supabase
      .from("story_state")
      .select("story_id")
      .eq("profile_id", profileId)
      .eq("is_read_later", true)
      .order("read_later_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(`Unable to load read-later stories: ${error.message}`);
    if (!stateRows || !stateRows.length) return [];
    return loadStoriesByIds(supabase, profileId, stateRows.map((r) => r.story_id));
  }

  if (view === "history") {
    if (!profileId) return [];
    const { data: stateRows, error } = await supabase
      .from("story_state")
      .select("story_id")
      .eq("profile_id", profileId)
      .eq("is_read", true)
      .order("read_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(`Unable to load reading history: ${error.message}`);
    if (!stateRows || !stateRows.length) return [];
    return loadStoriesByIds(supabase, profileId, stateRows.map((r) => r.story_id));
  }

  // view === "all"
  const { data: storyRows, error: storyError } = await supabase
    .from("stories")
    .select("id")
    .order("final_score", { ascending: false })
    .limit(50);

  if (storyError) throw new Error(`Unable to load stories: ${storyError.message}`);
  if (!storyRows || !storyRows.length) return [];

  const stories = await loadStoriesByIds(
    supabase,
    profileId,
    storyRows.map((story) => story.id),
  );

  return stories.filter((story) => !story.isNotInterested);
}

function formatPublishedDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
