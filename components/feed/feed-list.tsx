"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { flushSync } from "react-dom";

import { FeedCard } from "@/components/feed/feed-card";
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
  eyebrow?: string;
  heading?: string;
  canPersonalize?: boolean;
}

export function FeedList({
  initialStories,
  view = "all",
  eyebrow = "For You",
  heading = "Worth your attention",
  canPersonalize = false,
}: FeedListProps) {
  const [selectedTopic, setSelectedTopic] = useState<TopicSlug>("all");
  const [stories, setStories] = useState(initialStories);
  const [feedbackStoryId, setFeedbackStoryId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const visibleStories = useMemo(
    () => {
      const inView = stories.filter((story) => {
        if (story.isNotInterested) return false;
        if (view === "saved") return story.isSaved;
        if (view === "read-later") return story.isReadLater;
        if (view === "history") return story.isRead;
        return true;
      });
      return selectedTopic === "all"
        ? inView
        : inView.filter((story) => story.topic === selectedTopic);
    },
    [selectedTopic, stories, view],
  );

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    const validTopics = new Set<TopicSlug>(topicFilters.map((topic) => topic.slug));

    const registration = modelContext.registerTool(
      {
        name: "select_feed_topic",
        title: "Select feed topic",
        description:
          "Change the visible Personal Feed topic filter to one of the supported topic slugs.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: topicFilters.map((item) => item.slug),
            },
          },
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
          const visibleCount =
            topic === "all" ? stories.length : stories.filter((story) => story.topic === topic).length;

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

  async function persist(
    id: string,
    update: (story: FeedStory) => FeedStory,
    action: () => Promise<StoryActionResult>,
  ) {
    const previous = stories.find((story) => story.id === id);
    if (!previous || pendingIds.has(id)) return;
    setErrorMessage(null);
    setPendingIds((current) => new Set(current).add(id));
    setStories((current) => current.map((story) => (story.id === id ? update(story) : story)));

    const result = await action().catch(() => ({ ok: false, message: "Could not save this change." }));
    if (!result.ok) {
      setStories((current) => current.map((story) => (story.id === id ? previous : story)));
      setErrorMessage(result.message ?? "Could not save this change.");
    }
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  return (
    <section aria-labelledby="feed-heading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">{eyebrow}</p>
          <h1 id="feed-heading" className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {heading}
          </h1>
        </div>
        <p className="hidden text-sm text-[var(--muted)] sm:block">
          {visibleStories.length} worthwhile items
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}

      <div
        className="-mx-5 mb-7 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0"
        role="tablist"
        aria-label="Filter feed by topic"
      >
        {topicFilters.map((topic) => (
          <button
            key={topic.slug}
            type="button"
            role="tab"
            aria-selected={selectedTopic === topic.slug}
            onClick={() => setSelectedTopic(topic.slug)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
              selectedTopic === topic.slug
                ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
            )}
          >
            {topic.label}
          </button>
        ))}
      </div>

      {visibleStories.length ? (
        <div className="space-y-4">
          {visibleStories.map((story) => (
            <FeedCard
              key={story.id}
              story={story}
              feedbackOpen={feedbackStoryId === story.id}
              isPending={pendingIds.has(story.id)}
              canPersonalize={canPersonalize}
              onRead={() => canPersonalize ? void persist(story.id, (item) => ({ ...item, isRead: true }), () => markStoryRead(story.id)) : undefined}
              onToggleSaved={() => void persist(story.id, (item) => ({ ...item, isSaved: !item.isSaved }), () => setStorySaved(story.id, !story.isSaved))}
              onToggleReadLater={() => void persist(story.id, (item) => ({ ...item, isReadLater: !item.isReadLater }), () => setStoryReadLater(story.id, !story.isReadLater))}
              onToggleFeedback={() =>
                setFeedbackStoryId((current) => (current === story.id ? null : story.id))
              }
              onDismiss={(reason: FeedbackReason) => {
                setFeedbackStoryId(null);
                void persist(story.id, (item) => ({ ...item, isNotInterested: true }), () => markStoryNotInterested(story.id, reason));
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-72 place-items-center rounded-[1.6rem] border border-dashed border-[var(--line-strong)] bg-white px-6 text-center">
          <div>
            <Inbox className="mx-auto text-[var(--muted)]" aria-hidden="true" size={30} />
            <h2 className="mt-4 text-xl font-semibold">Nothing worth adding here yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-base leading-7 text-[var(--muted)]">
              Quality wins over quota. Try another topic instead of filling the feed with noise.
            </p>
            <Button className="mt-5" onClick={() => setSelectedTopic("all")}>
              Back to For You
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
