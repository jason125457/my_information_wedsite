import "server-only";

import type { FeedStory, TopicSlug } from "@/lib/feed/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const FRONT_PAGE_WINDOW_HOURS = 72;
const FRONT_PAGE_LIMIT = 60;
const FRONT_PAGE_MINIMUM = 12;
const FRONT_PAGE_POOL = 300;
const FRONT_PAGE_TOPIC_SHARE = 0.25;

/** Keeps score order but stops adding a topic once it fills its share. */
function balanceTopics<T extends { id: string; primary_topic_id: string }>(rows: T[]): T[] {
  const cap = Math.ceil(FRONT_PAGE_LIMIT * FRONT_PAGE_TOPIC_SHARE);
  const perTopic = new Map<string, number>();
  const picked: T[] = [];
  for (const row of rows) {
    if (picked.length >= FRONT_PAGE_LIMIT) break;
    const count = perTopic.get(row.primary_topic_id) ?? 0;
    if (count >= cap) continue;
    perTopic.set(row.primary_topic_id, count + 1);
    picked.push(row);
  }
  return picked;
}

const topicLabels: Record<FeedStory["topic"], string> = {
  ai: "AI",
  cybersecurity: "資安",
  technology: "科技",
  finance: "財經",
  world: "國際",
  music: "音樂",
  photography: "攝影",
};
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
    .select("id,title,summary,why_recommended,primary_topic_id,content_type,primary_url,published_at,image_url,final_score")
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
          .select("story_id,is_read,is_saved,is_read_later,is_not_interested,saved_at")
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
      topicLabel: topicLabels[topic.slug as FeedStory["topic"]] ?? topic.name,
      contentType: story.content_type === "current" ? "Current" : "Discovery",
      primaryUrl: story.primary_url,
      imageUrl: story.image_url,
      finalScore: Math.round(Number(story.final_score)),
      isRead: state?.is_read ?? false,
      isSaved: state?.is_saved ?? false,
      savedAt: state?.saved_at ?? null,
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
      // The knowledge base is searched in the browser, so load all of it.
      .limit(500);

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

  // view === "all": the best of the last few days, so the front page turns
  // over instead of being held by old high scorers, with no topic taking more
  // than a quarter of the page. Falls back to the all-time best when the
  // window is thin (e.g. right after setup).
  const since = new Date(Date.now() - FRONT_PAGE_WINDOW_HOURS * 3_600_000).toISOString();
  const recent = await supabase
    .from("stories")
    .select("id,primary_topic_id")
    .gte("created_at", since)
    .order("final_score", { ascending: false })
    .limit(FRONT_PAGE_POOL);
  if (recent.error) throw new Error(`Unable to load stories: ${recent.error.message}`);

  let storyRows = balanceTopics(recent.data ?? []);
  if (storyRows.length < FRONT_PAGE_MINIMUM) {
    const best = await supabase
      .from("stories")
      .select("id,primary_topic_id")
      .order("final_score", { ascending: false })
      .limit(FRONT_PAGE_POOL);
    if (best.error) throw new Error(`Unable to load stories: ${best.error.message}`);
    const seen = new Set(storyRows.map((row) => row.id));
    storyRows = balanceTopics([...storyRows, ...(best.data ?? []).filter((row) => !seen.has(row.id))]);
  }
  if (!storyRows.length) return [];

  const stories = await loadStoriesByIds(
    supabase,
    profileId,
    storyRows.map((story) => story.id),
  );

  return stories.filter((story) => !story.isNotInterested);
}

/** Relative within two days ("3 小時前"), then a Taipei calendar date. */
export function formatPublishedDate(value: string, now = new Date()) {
  if (!value) return "日期不明";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "日期不明";
  const hours = Math.floor((now.valueOf() - date.valueOf()) / 3_600_000);
  if (hours < 1) return "剛剛";
  if (hours < 24) return `${hours} 小時前`;
  if (hours < 48) return "昨天";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
  }).format(date);
}
