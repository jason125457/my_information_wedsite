import "server-only";

import { selectDailyDigest, type DigestCandidate } from "@/lib/digest/select";
import { sendLineDigestNotification } from "@/lib/line/push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DailyDigestResult {
  digestId: string;
  date: string;
  itemCount: number;
  status: "created" | "already_exists";
  lineNotified: boolean;
  warning?: string;
}

export async function generateDailyDigest(now = new Date()): Promise<DailyDigestResult> {
  const supabase = createAdminClient();
  const date = taipeiDate(now);
  const { data: existing } = await supabase
    .from("digests")
    .select("id")
    .eq("type", "daily")
    .eq("date", date)
    .maybeSingle();
  if (existing) {
    const { count } = await supabase
      .from("digest_stories")
      .select("story_id", { count: "exact", head: true })
      .eq("digest_id", existing.id);
    return {
      digestId: existing.id,
      date,
      itemCount: count ?? 0,
      status: "already_exists",
      lineNotified: false,
    };
  }

  const { data: job, error: jobError } = await supabase
    .from("job_runs")
    .insert({ job_type: "daily_digest", status: "running", metadata: { date } })
    .select("id")
    .single();
  if (jobError) throw new Error(`Unable to start digest job: ${jobError.message}`);

  try {
    const selection = await selectCandidates(supabase, now);
    const { data: digest, error: digestError } = await supabase
      .from("digests")
      .insert({
        type: "daily",
        date,
        title: `Daily Digest · ${date}`,
        summary: selection.length
          ? `${selection.length} 則真正值得看的內容。`
          : "今天沒有內容通過品質門檻。",
      })
      .select("id")
      .single();

    if (digestError) {
      if (digestError.code === "23505") {
        const { data: raced } = await supabase
          .from("digests")
          .select("id")
          .eq("type", "daily")
          .eq("date", date)
          .single();
        await finishJob(supabase, job.id, "succeeded", selection.length, { raced: true });
        return {
          digestId: raced!.id,
          date,
          itemCount: selection.length,
          status: "already_exists",
          lineNotified: false,
        };
      }
      throw new Error(`Unable to create digest: ${digestError.message}`);
    }

    if (selection.length) {
      const { error: linkError } = await supabase.from("digest_stories").insert(
        selection.map((story, position) => ({
          digest_id: digest.id,
          story_id: story.id,
          position: position + 1,
        })),
      );
      if (linkError) {
        await supabase.from("digests").delete().eq("id", digest.id);
        throw new Error(`Unable to attach digest stories: ${linkError.message}`);
      }
    }

    const topicCounts = await countTopics(supabase, selection);
    let lineNotified = false;
    let warning: string | undefined;
    if (selection.length && hasLineConfiguration()) {
      try {
        await sendLineDigestNotification({
          accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
          targetUserId: process.env.LINE_TARGET_USER_ID!,
          appUrl: process.env.APP_URL!,
          itemCount: selection.length,
          topicCounts,
          retryKey: digest.id,
        });
        lineNotified = true;
      } catch (error) {
        warning = error instanceof Error ? error.message : "LINE notification failed.";
      }
    } else if (selection.length) {
      warning = "LINE notification is not configured.";
    }

    await finishJob(supabase, job.id, warning ? "partial" : "succeeded", selection.length, {
      digestId: digest.id,
      lineNotified,
      warning: warning ?? null,
    });
    return {
      digestId: digest.id,
      date,
      itemCount: selection.length,
      status: "created",
      lineNotified,
      warning,
    };
  } catch (error) {
    await finishJob(supabase, job.id, "failed", 0, {
      error: error instanceof Error ? error.message : "Unknown digest error.",
    });
    throw error;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;
type SelectedStory = DigestCandidate & { primaryTopicId: string };

async function selectCandidates(supabase: AdminClient, now: Date): Promise<SelectedStory[]> {
  const [storyResult, stateResult, digestResult] = await Promise.all([
    supabase
      .from("stories")
      .select("id,final_score,content_type,primary_topic_id,published_at,created_at")
      .order("final_score", { ascending: false })
      .limit(200),
    supabase.from("story_state").select("story_id").eq("is_not_interested", true),
    supabase.from("digests").select("id").eq("type", "daily").order("date", { ascending: false }).limit(30),
  ]);
  if (storyResult.error) throw new Error(`Unable to load digest candidates: ${storyResult.error.message}`);
  if (stateResult.error) throw new Error(`Unable to load feedback: ${stateResult.error.message}`);
  if (digestResult.error) throw new Error(`Unable to load digest history: ${digestResult.error.message}`);

  const priorDigestIds = digestResult.data.map((digest) => digest.id);
  const priorLinks = priorDigestIds.length
    ? await supabase.from("digest_stories").select("story_id").in("digest_id", priorDigestIds)
    : { data: [], error: null };
  if (priorLinks.error) throw new Error(`Unable to load digest history: ${priorLinks.error.message}`);

  const hidden = new Set(stateResult.data.map((state) => state.story_id));
  const previouslyUsed = new Set(priorLinks.data.map((link) => link.story_id));
  const currentCutoff = now.valueOf() - 48 * 60 * 60 * 1000;
  const discoveryCutoff = now.valueOf() - 24 * 60 * 60 * 1000;
  const candidates = storyResult.data
    .filter((story) => !hidden.has(story.id) && !previouslyUsed.has(story.id))
    .filter((story) => {
      const relevantDate = story.content_type === "current" ? story.published_at : story.created_at;
      const cutoff = story.content_type === "current" ? currentCutoff : discoveryCutoff;
      return relevantDate ? new Date(relevantDate).valueOf() >= cutoff : false;
    })
    .map((story) => ({
      id: story.id,
      finalScore: Number(story.final_score),
      contentType: story.content_type,
      primaryTopicId: story.primary_topic_id,
    }));

  return selectDailyDigest(candidates);
}

async function countTopics(supabase: AdminClient, stories: SelectedStory[]) {
  const topicIds = [...new Set(stories.map((story) => story.primaryTopicId))];
  if (!topicIds.length) return {};
  const { data, error } = await supabase.from("topics").select("id,name").in("id", topicIds);
  if (error) throw new Error(`Unable to count digest topics: ${error.message}`);
  const names = new Map(data.map((topic) => [topic.id, topic.name]));
  return stories.reduce<Record<string, number>>((counts, story) => {
    const name = names.get(story.primaryTopicId) ?? "Other";
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}

async function finishJob(
  supabase: AdminClient,
  jobId: string,
  status: "succeeded" | "partial" | "failed",
  itemsProcessed: number,
  metadata: Record<string, string | number | boolean | null>,
) {
  await supabase
    .from("job_runs")
    .update({
      status,
      items_processed: itemsProcessed,
      finished_at: new Date().toISOString(),
      error_message:
        status === "failed"
          ? String(metadata.error ?? "Daily digest job failed.")
          : status === "partial"
            ? String(metadata.warning ?? "Daily digest completed partially.")
            : null,
      metadata,
    })
    .eq("id", jobId);
}

function taipeiDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hasLineConfiguration() {
  return Boolean(
    process.env.LINE_CHANNEL_ACCESS_TOKEN &&
      process.env.LINE_TARGET_USER_ID &&
      process.env.APP_URL,
  );
}
