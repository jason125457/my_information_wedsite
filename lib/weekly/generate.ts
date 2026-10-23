import "server-only";

import { getAIModelConfig, getGeminiApiKey, getGeminiMinIntervalMs } from "@/lib/ai/config";
import { GeminiProvider } from "@/lib/ai/provider";
import { StoryAIEditor } from "@/lib/ai/story-editor";
import { taipeiDate } from "@/lib/digest/generate";
import { selectDailyDigest } from "@/lib/digest/select";
import { createAdminClient } from "@/lib/supabase/admin";
import { weekWindow } from "@/lib/weekly/window";

export interface WeeklyReviewResult {
  digestId: string;
  date: string;
  itemCount: number;
  status: "created" | "already_exists";
  aiSummary: boolean;
}

const topicNames: Record<string, string> = {
  ai: "AI",
  cybersecurity: "資安",
  technology: "科技",
  finance: "財經",
  world: "國際",
  music: "音樂",
  photography: "攝影",
};

/**
 * Sunday-evening review of the past seven Taipei days: the ten stories most
 * worth remembering (topic-balanced, 30% discovery target) plus one AI
 * paragraph. Idempotent per date. Reading statistics are computed when the
 * page is viewed, so they include anything read after generation.
 */
export async function generateWeeklyReview(now = new Date(), editor?: StoryAIEditor): Promise<WeeklyReviewResult> {
  const supabase = createAdminClient();
  const date = taipeiDate(now);

  const { data: existing } = await supabase.from("digests").select("id").eq("type", "weekly").eq("date", date).maybeSingle();
  if (existing) {
    const { count } = await supabase.from("digest_stories").select("story_id", { count: "exact", head: true }).eq("digest_id", existing.id);
    return { digestId: existing.id, date, itemCount: count ?? 0, status: "already_exists", aiSummary: false };
  }

  const { data: job, error: jobError } = await supabase
    .from("job_runs")
    .insert({ job_type: "weekly_review", status: "running", metadata: { date } })
    .select("id")
    .single();
  if (jobError) throw new Error(`Unable to start weekly review job: ${jobError.message}`);

  try {
    const { start, end } = weekWindow(date);
    const [storyResult, hiddenResult, topicResult] = await Promise.all([
      supabase
        .from("stories")
        .select("id,title,final_score,content_type,primary_topic_id")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("final_score", { ascending: false })
        .limit(300),
      supabase.from("story_state").select("story_id").eq("is_not_interested", true),
      supabase.from("topics").select("id,slug"),
    ]);
    if (storyResult.error) throw new Error(`Unable to load the week's stories: ${storyResult.error.message}`);

    const hidden = new Set((hiddenResult.data ?? []).map((row) => row.story_id));
    const slugById = new Map((topicResult.data ?? []).map((topic) => [topic.id, topic.slug]));
    const stories = storyResult.data.filter((story) => !hidden.has(story.id));
    const picks = selectDailyDigest(
      stories.map((story) => ({
        id: story.id,
        finalScore: Number(story.final_score),
        contentType: story.content_type,
        primaryTopicId: story.primary_topic_id,
        title: story.title,
      })),
      { limit: 10, minimumScore: 0, discoveryRatio: 0.3, maxTopicShare: 0.3 },
    );

    let summary = picks.length
      ? `這週有 ${stories.length} 則內容通過品質門檻，以下是最值得記住的 ${picks.length} 則。`
      : "這週沒有內容通過品質門檻。";
    let aiSummary = false;
    if (picks.length) {
      try {
        const writer =
          editor ??
          new StoryAIEditor(new GeminiProvider(getGeminiApiKey(), { minIntervalMs: getGeminiMinIntervalMs() }), getAIModelConfig());
        const result = await writer.summarizeWeek(
          picks.map((pick) => ({
            title: pick.title,
            topic: topicNames[slugById.get(pick.primaryTopicId ?? "") ?? ""] ?? "其他",
            contentType: pick.contentType === "discovery" ? "探索" : "時事",
          })),
        );
        summary = result.summary;
        aiSummary = true;
      } catch (error) {
        console.error("Weekly AI summary failed; using the plain summary.", error instanceof Error ? error.message : error);
      }
    }

    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const { data: digest, error: digestError } = await supabase
      .from("digests")
      .insert({ type: "weekly", date, title: `${month} 月 ${day} 日 · 每週回顧`, summary })
      .select("id")
      .single();
    if (digestError) throw new Error(`Unable to create weekly review: ${digestError.message}`);

    if (picks.length) {
      const { error: linkError } = await supabase
        .from("digest_stories")
        .insert(picks.map((pick, index) => ({ digest_id: digest.id, story_id: pick.id, position: index + 1 })));
      if (linkError) {
        await supabase.from("digests").delete().eq("id", digest.id);
        throw new Error(`Unable to attach weekly stories: ${linkError.message}`);
      }
    }

    await supabase
      .from("job_runs")
      .update({
        status: aiSummary || !picks.length ? "succeeded" : "partial",
        items_processed: picks.length,
        finished_at: new Date().toISOString(),
        error_message: aiSummary || !picks.length ? null : "AI summary unavailable; used the plain summary.",
        metadata: { date, digestId: digest.id, candidates: stories.length, aiSummary },
      })
      .eq("id", job.id);

    return { digestId: digest.id, date, itemCount: picks.length, status: "created", aiSummary };
  } catch (error) {
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Weekly review failed.",
      })
      .eq("id", job.id);
    throw error;
  }
}
