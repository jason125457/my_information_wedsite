import type { ContentTopic, NormalizedCandidate } from "@/lib/collectors/types";
import type { FeedbackSignals } from "@/lib/ranking/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type FeedbackReason = Database["public"]["Tables"]["story_state"]["Row"]["feedback_reason"];

export interface FeedbackProfile {
  feedbackFor(candidate: NormalizedCandidate): FeedbackSignals;
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
    feedbackFor(candidate: NormalizedCandidate): FeedbackSignals {
      const signals: FeedbackSignals = {};

      // 1. Positive: saved / read
      const savedCount = savedTopicCounts.get(candidate.topic) ?? 0;
      if (savedCount > 0) {
        signals.savedSimilarCount = Math.min(savedCount, cap);
      }

      const readCount = readTopicCounts.get(candidate.topic) ?? 0;
      if (readCount > 0) {
        signals.readSimilarCount = Math.min(readCount, cap);
      }

      // 2. Negative: topic_not_interesting
      const topicNotInterested =
        reasonTopicCounts.get(`${candidate.topic}:topic_not_interesting`) ??
        (notInterestedTopicCounts.get(candidate.topic) ? 1 : 0);
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
        (reasonTopicCounts.get(`${candidate.topic}:low_value_or_gossip`) ?? 0);
      if (lowValueCount > 0) {
        signals.lowValueCount = Math.min(lowValueCount, cap);
      }

      // 5. Negative: too_technical
      const tooTechnicalCount =
        reasonTopicCounts.get(`${candidate.topic}:too_technical`) ?? 0;
      if (tooTechnicalCount > 0) {
        signals.tooTechnicalCount = Math.min(tooTechnicalCount, cap);
      }

      // 6. Negative: already_knew
      const alreadyKnewCount =
        reasonTopicCounts.get(`${candidate.topic}:already_knew`) ?? 0;
      if (alreadyKnewCount > 0) {
        signals.alreadyKnewCount = Math.min(alreadyKnewCount, cap);
      }

      // 7. Negative: do_not_recommend_type -> blockedTypeCount
      const blockedTypeCount =
        (reasonTopicCounts.get(`${candidate.topic}:do_not_recommend_type`) ?? 0) +
        (reasonSourceCounts.get(`${candidate.sourceId}:do_not_recommend_type`) ?? 0);
      if (blockedTypeCount > 0) {
        signals.blockedTypeCount = Math.min(blockedTypeCount, cap);
      }

      return signals;
    },
  };
}

export async function loadFeedbackProfile(
  supabase: AdminClient,
  options: { cap?: number; profileId?: string } = {},
): Promise<FeedbackProfile> {
  try {
    let profileId = options.profileId;

    if (!profileId) {
      const profilesQuery = supabase.from("profiles").select("id");
      // Resilient check for maybeSingle or basic query
      if (typeof profilesQuery?.maybeSingle === "function") {
        const { data: profile, error: profileError } = await profilesQuery.maybeSingle();
        if (profileError || !profile) {
          return createNeutralFeedbackProfile();
        }
        profileId = profile.id;
      } else {
        return createNeutralFeedbackProfile();
      }
    }

    const { data: states, error: stateError } = await supabase
      .from("story_state")
      .select("story_id, is_saved, is_read, is_not_interested, feedback_reason")
      .eq("profile_id", profileId);

    if (stateError || !states || states.length === 0) {
      return createNeutralFeedbackProfile();
    }

    const activeStates = states.filter(
      (s) => s.is_saved || s.is_read || s.is_not_interested,
    );
    if (activeStates.length === 0) {
      return createNeutralFeedbackProfile();
    }

    const storyIds = [...new Set(activeStates.map((s) => s.story_id))];

    // Load stories to get primary topic IDs
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select("id, primary_topic_id")
      .in("id", storyIds);

    if (storiesError || !stories || stories.length === 0) {
      return createNeutralFeedbackProfile();
    }

    // Load topics to resolve topic slug
    const { data: topics } = await supabase
      .from("topics")
      .select("id, slug");

    const topicSlugMap = new Map<string, ContentTopic>();
    if (topics) {
      for (const t of topics) {
        topicSlugMap.set(t.id, t.slug as ContentTopic);
      }
    }

    const storyTopicMap = new Map<string, ContentTopic>();
    for (const story of stories) {
      const topicSlug = topicSlugMap.get(story.primary_topic_id) ?? "technology";
      storyTopicMap.set(story.id, topicSlug);
    }

    // Load story sources to get source IDs
    const { data: storySources } = await supabase
      .from("story_sources")
      .select("story_id, raw_item_id, raw_items ( source_id )")
      .in("story_id", storyIds);

    const storySourceMap = new Map<string, string[]>();
    if (storySources) {
      for (const row of storySources as Array<{
        story_id: string;
        raw_item_id?: string;
        raw_items?: { source_id?: string } | null;
        source_id?: string;
      }>) {
        const sourceId = row.raw_items?.source_id ?? row.source_id;
        if (sourceId && row.story_id) {
          const list = storySourceMap.get(row.story_id) ?? [];
          if (!list.includes(sourceId)) {
            list.push(sourceId);
          }
          storySourceMap.set(row.story_id, list);
        }
      }
    }

    const interactions: UserFeedbackInteraction[] = [];
    for (const state of activeStates) {
      const topic = storyTopicMap.get(state.story_id);
      if (!topic) continue;
      const sourceIds = storySourceMap.get(state.story_id) ?? [];
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
