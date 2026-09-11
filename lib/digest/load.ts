import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { loadFeed } from "@/lib/feed/load-feed";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface DigestListItem {
  id: string;
  date: string;
  title: string;
  summary: string;
  itemCount: number;
}

export async function loadDailyDigests(supabase: SupabaseClient): Promise<DigestListItem[]> {
  const { data: digests, error } = await supabase
    .from("digests")
    .select("id,date,title,summary")
    .eq("type", "daily")
    .order("date", { ascending: false })
    .limit(30);
  if (error) throw new Error(`Unable to load digests: ${error.message}`);
  if (!digests.length) return [];

  const { data: links, error: linkError } = await supabase
    .from("digest_stories")
    .select("digest_id")
    .in("digest_id", digests.map((digest) => digest.id));
  if (linkError) throw new Error(`Unable to count digest stories: ${linkError.message}`);
  const counts = links.reduce<Map<string, number>>((result, link) => {
    result.set(link.digest_id, (result.get(link.digest_id) ?? 0) + 1);
    return result;
  }, new Map());

  return digests.map((digest) => ({
    ...digest,
    itemCount: counts.get(digest.id) ?? 0,
  }));
}

export async function loadDailyDigestStories(
  supabase: SupabaseClient,
  profileId: string,
  date: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const { data: digest, error } = await supabase
    .from("digests")
    .select("id,title")
    .eq("type", "daily")
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`Unable to load digest: ${error.message}`);
  if (!digest) return null;

  const { data: links, error: linkError } = await supabase
    .from("digest_stories")
    .select("story_id,position")
    .eq("digest_id", digest.id)
    .order("position");
  if (linkError) throw new Error(`Unable to load digest stories: ${linkError.message}`);
  const positions = new Map(links.map((link) => [link.story_id, link.position]));
  const stories = (await loadFeed(supabase, profileId))
    .filter((story) => positions.has(story.id))
    .sort((first, second) => positions.get(first.id)! - positions.get(second.id)!);
  return { title: digest.title, stories };
}
