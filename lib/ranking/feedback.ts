import type { ContentTopic, NormalizedCandidate } from "@/lib/collectors/types";
import type { FeedbackSignals } from "@/lib/ranking/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type FeedbackReason = Database["public"]["Tables"]["story_state"]["Row"]["feedback_reason"];

export interface FeedbackProfile {
  /**
   * `topic` is the story's AI primary topic, the same one interactions are
   * counted under; the candidate's source-configured topic is not used.
   */
  feedbackFor(candidate: NormalizedCandidate, topic: ContentTopic): FeedbackSignals;
}

export interface UserFeedbackInteraction {
  is_saved: boolean;
  is_read: boolean;
  is_not_interested: boolean;
  feedback_reason: FeedbackReason | null;
  topic: ContentTopic;
  sourceIds: string[];
}

export function createNeutralFeedbackProfile(): FeedbackProfile {
  return {
    feedbackFor: () => ({}),
  };
}

export function buildFeedbackProfile(
  interactions: readonly UserFeedbackInteraction[],
  options: { cap?: number } = {},
): FeedbackProfile {
  const cap = Math.max(1, options.cap ?? 5);

  const savedTopicCounts = new Map<ContentTopic, number>();
  const readTopicCounts = new Map<ContentTopic, number>();
  const notInterestedTopicCounts = new Map<ContentTopic, number>();
  const notInterestedSourceCounts = new Map<string, number>();

  const reasonTopicCounts = new Map<string, number>();
  const reasonSourceCounts = new Map<string, number>();

  for (const item of interactions) {
    if (item.is_saved) {
      savedTopicCounts.set(item.topic, (savedTopicCounts.get(item.topic) ?? 0) + 1);
    }
    if (item.is_read) {
      readTopicCounts.set(item.topic, (readTopicCounts.get(item.topic) ?? 0) + 1);
    }
    if (item.is_not_interested) {
      notInterestedTopicCounts.set(
        item.topic,
        (notInterestedTopicCounts.get(item.topic) ?? 0) + 1,
      );

      for (const sourceId of item.sourceIds) {
        notInterestedSourceCounts.set(
          sourceId,
          (notInterestedSourceCounts.get(sourceId) ?? 0) + 1,
        );
      }

      if (item.feedback_reason) {
        const topicKey = `${item.topic}:${item.feedback_reason}`;
        reasonTopicCounts.set(topicKey, (reasonTopicCounts.get(topicKey) ?? 0) + 1);

        for (const sourceId of item.sourceIds) {
          const sourceKey = `${sourceId}:${item.feedback_reason}`;
          reasonSourceCounts.set(sourceKey, (reasonSourceCounts.get(sourceKey) ?? 0) + 1);
        }
      }
    }
  }

  return {
    feedbackFor(candidate: NormalizedCandidate, topic: ContentTopic): FeedbackSignals {
      const signals: FeedbackSignals = {};

      // 1. Positive: saved / read
      const savedCount = savedTopicCounts.get(topic) ?? 0;
      if (savedCount > 0) {
        signals.savedSimilarCount = Math.min(savedCount, cap);
      }

      const readCount = readTopicCounts.get(topic) ?? 0;
      if (readCount > 0) {
        signals.readSimilarCount = Math.min(readCount, cap);
      }

      // 2. Negative: topic_not_interesting
      const topicNotInterested =
        reasonTopicCounts.get(`${topic}:topic_not_interesting`) ??
        (notInterestedTopicCounts.get(topic) ? 1 : 0);
      if (topicNotInterested > 0) {
        signals.topicNotInterestingCount = Math.min(topicNotInterested, cap);
      }

      // 3. Negative: poor_source
      const poorSourceCount =
        reasonSourceCounts.get(`${candidate.sourceId}:poor_source`) ??
        (notInterestedSourceCounts.get(candidate.sourceId) ? 1 : 0);
      if (poorSourceCount > 0) {
        signals.poorSourceCount = Math.min(poorSourceCount, cap);
      }

      // 4. Negative: low_value_or_gossip
      const lowValueCount =
        (reasonSourceCounts.get(`${candidate.sourceId}:low_value_or_gossip`) ?? 0) +
        (reasonTopicCounts.get(`${topic}:low_value_or_gossip`) ?? 0);
      if (lowValueCount > 0) {
        signals.lowValueCount = Math.min(lowValueCount, cap);
      }

      // 5. Negative: too_technical
      const tooTechnicalCount =
        reasonTopicCounts.get(`${topic}:too_technical`) ?? 0;
      if (tooTechnicalCount > 0) {
        signals.tooTechnicalCount = Math.min(tooTechnicalCount, cap);
      }

      // 6. Negative: already_knew
      const alreadyKnewCount =
        reasonTopicCounts.get(`${topic}:already_knew`) ?? 0;
      if (alreadyKnewCount > 0) {
        signals.alreadyKnewCount = Math.min(alreadyKnewCount, cap);
      }

      // 7. Negative: do_not_recommend_type -> blockedTypeCount
      const blockedTypeCount =
        (reasonTopicCounts.get(`${topic}:do_not_recommend_type`) ?? 0) +
        (reasonSourceCounts.get(`${candidate.sourceId}:do_not_recommend_type`) ?? 0);
      if (blockedTypeCount > 0) {
        signals.blockedTypeCount = Math.min(blockedTypeCount, cap);
      }

      return signals;
    },
  };
}

/** Only recent interactions shape ranking, and the query stays bounded. */
export const FEEDBACK_WINDOW_DAYS = 90;

interface FeedbackStateRow {
  is_saved: boolean;
  is_read: boolean;
  is_not_interested: boolean;
  feedback_reason: FeedbackReason | null;
  stories: {
    topics: { slug: string } | null;
    story_sources: Array<{ raw_items: { source_id: string } | null }> | null;
  } | null;
}

export async function loadFeedbackProfile(
  supabase: AdminClient,
  options: { cap?: number; profileId?: string; now?: Date } = {},
): Promise<FeedbackProfile> {
  try {
    let profileId = options.profileId;

    if (!profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .maybeSingle();
      if (profileError || !profile) {
        return createNeutralFeedbackProfile();
      }
      profileId = profile.id;
    }

    const since = new Date(
      (options.now ?? new Date()).getTime() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // One nested select: each interaction with its story's AI topic (the same
    // topic feedbackFor is later queried with) and the sources behind it.
    const { data, error } = await supabase
      .from("story_state")
      .select(
        "is_saved, is_read, is_not_interested, feedback_reason, stories ( topics ( slug ), story_sources ( raw_items ( source_id ) ) )",
      )
      .eq("profile_id", profileId)
      .gte("updated_at", since);
    const states = data as unknown as FeedbackStateRow[] | null;

    if (error || !states || states.length === 0) {
      return createNeutralFeedbackProfile();
    }

    const interactions: UserFeedbackInteraction[] = [];
    for (const state of states) {
      if (!state.is_saved && !state.is_read && !state.is_not_interested) continue;
      const topic = state.stories?.topics?.slug as ContentTopic | undefined;
      if (!topic) continue;
      const sourceIds = [
        ...new Set(
          (state.stories?.story_sources ?? [])
            .map((row) => row.raw_items?.source_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      interactions.push({
        is_saved: state.is_saved,
        is_read: state.is_read,
        is_not_interested: state.is_not_interested,
        feedback_reason: state.feedback_reason,
        topic,
        sourceIds,
      });
    }

    return buildFeedbackProfile(interactions, { cap: options.cap });
  } catch (error) {
    console.warn("Failed to load feedback profile, falling back to neutral profile:", error);
    return createNeutralFeedbackProfile();
  }
}
