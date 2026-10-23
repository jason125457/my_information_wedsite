"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { flushSync } from "react-dom";

import { FeedCard, StoryActionBar, type StoryActions } from "@/components/feed/feed-card";
import { StoryMedia, StoryMeta, TopicChip, WhyLine } from "@/components/feed/story-parts";
import { Button } from "@/components/ui/button";
import {
  markStoryNotInterested,
  markStoryRead,
  setStoryReadLater,
  setStorySaved,
  type StoryActionResult,
} from "@/app/actions/story-state";
import type { FeedbackReason } from "@/lib/feed/state";
import { topicFilters, type FeedStory, type TopicSlug } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

interface FeedListProps {
  initialStories: FeedStory[];
  view?: "all" | "saved" | "read-later" | "history";
  /** "front" adds the lead story, the side list and the discovery band. */
  layout?: "front" | "list";
  canPersonalize?: boolean;
}

const FIRST_PAGE = 12;
const PAGE_STEP = 9;
const SIDE_COUNT = 4;
const DISCOVERY_COUNT = 3;

export function FeedList({ initialStories, view = "all", layout = "list", canPersonalize = false }: FeedListProps) {
  const [selectedTopic, setSelectedTopic] = useState<TopicSlug>("all");
  const [stories, setStories] = useState(initialStories);
  const [shownCount, setShownCount] = useState(FIRST_PAGE);
  const [feedbackStoryId, setFeedbackStoryId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const visibleStories = useMemo(() => {
    const inView = stories.filter((story) => {
      if (story.isNotInterested) return false;
      if (view === "saved") return story.isSaved;
      if (view === "read-later") return story.isReadLater;
      if (view === "history") return story.isRead;
      return true;
    });
    return selectedTopic === "all" ? inView : inView.filter((story) => story.topic === selectedTopic);
  }, [selectedTopic, stories, view]);

  // The front page splits the stories into a lead, a side list, an evergreen
  // discovery band and the grid; a topic filter shows the plain grid.
  const sections = useMemo(() => {
    if (layout !== "front" || selectedTopic !== "all") {
      return { lead: null, side: [], discovery: [], grid: visibleStories };
    }
    const lead = visibleStories.find((story) => story.imageUrl) ?? visibleStories[0] ?? null;
    const rest = visibleStories.filter((story) => story !== lead);
    const side = rest.slice(0, SIDE_COUNT);
    const afterSide = rest.slice(SIDE_COUNT);
    const discovery = afterSide
      .filter((story) => story.contentType === "Discovery" && (story.topic === "music" || story.topic === "photography"))
      .slice(0, DISCOVERY_COUNT);
    const grid = afterSide.filter((story) => !discovery.includes(story));
    return { lead, side, discovery, grid };
  }, [layout, selectedTopic, visibleStories]);

  const gridShown = sections.grid.slice(0, shownCount);
  const remaining = sections.grid.length - gridShown.length;

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    const validTopics = new Set<TopicSlug>(topicFilters.map((topic) => topic.slug));

    const registration = modelContext.registerTool(
      {
        name: "select_feed_topic",
        title: "Select feed topic",
        description: "Change the visible Personal Feed topic filter to one of the supported topic slugs.",
        inputSchema: {
          type: "object",
          properties: { topic: { type: "string", enum: topicFilters.map((item) => item.slug) } },
          required: ["topic"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (
            !input ||
            typeof input !== "object" ||
            !("topic" in input) ||
            typeof input.topic !== "string" ||
            !validTopics.has(input.topic as TopicSlug)
          ) {
            throw new Error("A supported topic slug is required.");
          }
          const topic = input.topic as TopicSlug;
          flushSync(() => setSelectedTopic(topic));
          const visibleCount = topic === "all" ? stories.length : stories.filter((story) => story.topic === topic).length;
          return { topic, visibleCount };
        },
      },
      { signal: lifecycle.signal },
    );

    void Promise.resolve(registration).catch(() => {
      // WebMCP is progressive enhancement; unsupported registrations stay silent.
    });

    return () => lifecycle.abort();
  }, [stories]);

  async function persist(id: string, update: (story: FeedStory) => FeedStory, action: () => Promise<StoryActionResult>) {
    const previous = stories.find((story) => story.id === id);
    if (!previous || pendingIds.has(id)) return;
    setErrorMessage(null);
    setPendingIds((current) => new Set(current).add(id));
    setStories((current) => current.map((story) => (story.id === id ? update(story) : story)));

    const result = await action().catch(() => ({ ok: false, message: "無法儲存這個變更。" }));
    if (!result.ok) {
      setStories((current) => current.map((story) => (story.id === id ? previous : story)));
      setErrorMessage(result.message ?? "無法儲存這個變更。");
    }
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function actionsFor(story: FeedStory): StoryActions {
    return {
      canPersonalize,
      isPending: pendingIds.has(story.id),
      feedbackOpen: feedbackStoryId === story.id,
      onRead: () => {
        if (canPersonalize) void persist(story.id, (item) => ({ ...item, isRead: true }), () => markStoryRead(story.id));
      },
      onToggleSaved: () =>
        void persist(story.id, (item) => ({ ...item, isSaved: !item.isSaved }), () => setStorySaved(story.id, !story.isSaved)),
      onToggleReadLater: () =>
        void persist(story.id, (item) => ({ ...item, isReadLater: !item.isReadLater }), () => setStoryReadLater(story.id, !story.isReadLater)),
      onToggleFeedback: () => setFeedbackStoryId((current) => (current === story.id ? null : story.id)),
      onDismiss: (reason: FeedbackReason) => {
        setFeedbackStoryId(null);
        void persist(story.id, (item) => ({ ...item, isNotInterested: true }), () => markStoryNotInterested(story.id, reason));
      },
    };
  }

  return (
    <div>
      {errorMessage ? (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}

      {sections.lead ? (
        <section aria-label="今日頭條" className="grid gap-8 border-b border-[var(--line)] py-8 lg:grid-cols-[1.65fr_1fr]">
          <LeadStory story={sections.lead} actions={actionsFor(sections.lead)} />
          {sections.side.length ? (
            <aside aria-labelledby="side-heading">
              <h2 id="side-heading" className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
                同場加映
              </h2>
              <ol className="mt-1">
                {sections.side.map((story, index) => (
                  <li key={story.id} className="grid grid-cols-[28px_1fr] gap-3 border-b border-[var(--line)] py-4 last:border-b-0">
                    <span aria-hidden="true" className="font-serif text-lg leading-7 font-semibold text-stone-400 tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="space-y-1.5">
                      <TopicChip story={story} />
                      <h3 className="font-serif text-[17px] leading-[1.45] font-bold">
                        <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actionsFor(story).onRead} className="hover:underline decoration-[var(--line-strong)] underline-offset-4">
                          {story.title}
                        </a>
                      </h3>
                      <StoryMeta story={story} />
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          ) : null}
        </section>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pt-7 pb-2" role="group" aria-label="依主題篩選">
        {topicFilters.map((topic) => (
          <button
            key={topic.slug}
            type="button"
            aria-pressed={selectedTopic === topic.slug}
            onClick={() => {
              setSelectedTopic(topic.slug);
              setShownCount(FIRST_PAGE);
            }}
            className={cn(
              "h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors",
              selectedTopic === topic.slug
                ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--line-strong)]",
            )}
          >
            {topic.label}
          </button>
        ))}
      </div>

      {sections.grid.length ? (
        <section aria-labelledby="grid-heading">
          <div className="mt-6 mb-5 flex items-baseline justify-between gap-4">
            <h2 id="grid-heading" className="font-serif text-2xl font-semibold">
              {layout === "front" && selectedTopic === "all" ? "為你精選" : `${visibleStories.length} 則`}
            </h2>
            <span className="shrink-0 text-[13px] text-[var(--muted)]">依推薦分數排序</span>
          </div>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {gridShown.map((story) => (
              <FeedCard key={story.id} story={story} actions={actionsFor(story)} />
            ))}
          </div>
        </section>
      ) : visibleStories.length === 0 ? (
        <EmptyState onReset={() => setSelectedTopic("all")} filtered={selectedTopic !== "all"} />
      ) : null}

      {remaining > 0 ? (
        <div className="flex justify-center pt-10">
          <Button type="button" className="h-12 border-[var(--ink)] px-7 text-[15px]" onClick={() => setShownCount((count) => count + PAGE_STEP)}>
            再看 {Math.min(PAGE_STEP, remaining)} 則
          </Button>
        </div>
      ) : null}

      {sections.discovery.length ? <DiscoveryBand stories={sections.discovery} actionsFor={actionsFor} /> : null}
    </div>
  );
}

function LeadStory({ story, actions }: { story: FeedStory; actions: StoryActions }) {
  return (
    <article>
      <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actions.onRead} tabIndex={-1} aria-hidden="true">
        <StoryMedia story={story} className="aspect-video rounded-2xl" />
      </a>
      <div className="mt-5 space-y-3">
        <TopicChip story={story} />
        <h2 className="font-serif text-[clamp(26px,3vw,36px)] leading-[1.28] font-bold tracking-[-0.01em]">
          <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actions.onRead} className="hover:underline decoration-[var(--line-strong)] underline-offset-4">
            {story.title}
          </a>
        </h2>
        <p className="text-[17px] leading-[1.75] text-[var(--ink-soft)]">{story.summary}</p>
        <WhyLine story={story} />
        <StoryMeta story={story} />
        <div className="max-w-md">
          <StoryActionBar story={story} actions={actions} />
        </div>
      </div>
    </article>
  );
}

function DiscoveryBand({ stories, actionsFor }: { stories: FeedStory[]; actionsFor: (story: FeedStory) => StoryActions }) {
  return (
    <section aria-labelledby="discovery-heading" className="relative left-1/2 mt-16 w-screen -translate-x-1/2 bg-[var(--night)] py-14 text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 id="discovery-heading" className="font-serif text-2xl font-semibold text-white">
            探索 · 不限時效的好東西
          </h2>
          <span className="shrink-0 text-[13px] text-zinc-400">音樂與攝影</span>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {stories.map((story) => (
            <article key={story.id} className="flex flex-col overflow-hidden rounded-2xl border border-[var(--night-line)] bg-[var(--night-surface)]">
              <StoryMedia story={story} className="aspect-[4/3]" />
              <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4 pb-3">
                <TopicChip story={story} tone="night" />
                <h3 className="font-serif text-[19px] leading-[1.42] font-bold text-white">
                  <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actionsFor(story).onRead} className="hover:underline underline-offset-4">
                    {story.title}
                  </a>
                </h3>
                <p className="line-clamp-3 text-sm leading-[1.7] text-zinc-300">{story.summary}</p>
                <div className="mt-auto pt-1">
                  <StoryMeta story={story} tone="night" />
                </div>
                <StoryActionBar story={story} actions={actionsFor(story)} tone="night" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ onReset, filtered }: { onReset: () => void; filtered: boolean }) {
  return (
    <div className="mt-8 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center">
      <div>
        <Inbox className="mx-auto text-[var(--muted)]" aria-hidden="true" size={30} />
        <h2 className="mt-4 font-serif text-xl font-semibold">這裡目前沒有值得加入的內容</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-7 text-[var(--muted)]">寧缺勿濫。與其用雜訊填滿，不如看看其他主題。</p>
        {filtered ? (
          <Button className="mt-5" onClick={onReset}>
            回到全部
          </Button>
        ) : null}
      </div>
    </div>
  );
}
