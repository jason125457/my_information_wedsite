import "server-only";

import { loadStoriesByIds } from "@/lib/feed/load-feed";
import type { FeedStory } from "@/lib/feed/types";
import type { createClient } from "@/lib/supabase/server";
import { weekWindow } from "@/lib/weekly/window";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface WeeklyListItem {
  id: string;
  date: string;
  title: string;
  summary: string;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface WeeklyReview {
  title: string;
  summary: string;
  start: string;
  end: string;
  picks: FeedStory[];
  discoveries: FeedStory[];
  /** Only for the signed-in owner. */
  personal: {
    saved: number;
    read: number;
    skipped: number;
    savedTopics: TopicCount[];
    skippedTopics: TopicCount[];
    readLater: FeedStory[];
  } | null;
}

const DISCOVERY_COUNT = 6;
const READ_LATER_COUNT = 6;

export async function loadWeeklyReviews(supabase: SupabaseClient): Promise<WeeklyListItem[]> {
  const { data, error } = await supabase
    .from("digests")
    .select("id,date,title,summary")
    .eq("type", "weekly")
    .order("date", { ascending: false })
    .limit(12);
  if (error) throw new Error(`Unable to load weekly reviews: ${error.message}`);
  return data;
}

export async function loadWeeklyReview(
  supabase: SupabaseClient,
  profileId: string | null,
  date: string,
): Promise<WeeklyReview | null> {
  const { data: digest, error } = await supabase
    .from("digests")
    .select("id,title,summary")
    .eq("type", "weekly")
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`Unable to load weekly review: ${error.message}`);
  if (!digest) return null;

  const { start, end } = weekWindow(date);
  const [linkResult, discoveryResult] = await Promise.all([
    supabase.from("digest_stories").select("story_id,position").eq("digest_id", digest.id).order("position"),
    supabase
      .from("stories")
      .select("id")
      .eq("content_type", "discovery")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("final_score", { ascending: false })
      .limit(DISCOVERY_COUNT * 3),
  ]);
  if (linkResult.error) throw new Error(`Unable to load weekly stories: ${linkResult.error.message}`);

  const pickIds = linkResult.data.map((link) => link.story_id);
  const picks = await loadStoriesByIds(supabase, profileId, pickIds);
  const pickSet = new Set(pickIds);
  const discoveryIds = (discoveryResult.data ?? []).map((row) => row.id).filter((id) => !pickSet.has(id));
  const discoveries = (await loadStoriesByIds(supabase, profileId, discoveryIds))
    .filter((story) => !story.isNotInterested)
    .slice(0, DISCOVERY_COUNT);

  return {
    title: digest.title,
    summary: digest.summary,
    start,
    end,
    picks,
    discoveries,
    personal: profileId ? await loadPersonalWeek(supabase, profileId, start, end) : null,
  };
}

async function loadPersonalWeek(supabase: SupabaseClient, profileId: string, start: string, end: string) {
  const { data: states, error } = await supabase
    .from("story_state")
    .select("story_id,is_read,is_saved,is_read_later,is_not_interested,read_at,saved_at,read_later_at,updated_at")
    .eq("profile_id", profileId)
    .limit(2000);
  if (error) throw new Error(`Unable to load reading history: ${error.message}`);

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const within = (value: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return time >= startMs && time < endMs;
  };
  const saved = states.filter((state) => state.is_saved && within(state.saved_at));
  const read = states.filter((state) => state.is_read && within(state.read_at));
  const skipped = states.filter((state) => state.is_not_interested && within(state.updated_at));
  const readLaterIds = states
    .filter((state) => state.is_read_later && !state.is_read)
    .sort((first, second) => (second.read_later_at ?? "").localeCompare(first.read_later_at ?? ""))
    .slice(0, READ_LATER_COUNT)
    .map((state) => state.story_id);

  const countIds = [...new Set([...saved, ...skipped].map((state) => state.story_id))];
  const topicLabelById = new Map<string, string>();
  if (countIds.length) {
    const stories = await loadStoriesByIds(supabase, profileId, countIds);
    for (const story of stories) topicLabelById.set(story.id, story.topicLabel);
  }
  const tally = (rows: typeof states): TopicCount[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const topic = topicLabelById.get(row.story_id);
      if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    return [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);
  };

  return {
    saved: saved.length,
    read: read.length,
    skipped: skipped.length,
    savedTopics: tally(saved).slice(0, 3),
    skippedTopics: tally(skipped).slice(0, 3),
    readLater: await loadStoriesByIds(supabase, profileId, readLaterIds),
  };
}
