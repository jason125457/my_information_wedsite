"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { flushSync } from "react-dom";

import { FeedCard } from "@/components/feed/feed-card";
import { Button } from "@/components/ui/button";
import {
  mockStories,
  topicFilters,
  type TopicSlug,
} from "@/lib/feed/mock-stories";
import { cn } from "@/lib/utils";

export function FeedList() {
  const [selectedTopic, setSelectedTopic] = useState<TopicSlug>("all");
  const [stories, setStories] = useState(mockStories);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [readLaterIds, setReadLaterIds] = useState<Set<string>>(() => new Set());
  const [feedbackStoryId, setFeedbackStoryId] = useState<string | null>(null);

  const visibleStories = useMemo(
    () =>
      selectedTopic === "all"
        ? stories
        : stories.filter((story) => story.topic === selectedTopic),
    [selectedTopic, stories],
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

  function toggleId(setter: typeof setSavedIds, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function markRead(id: string) {
    setStories((current) =>
      current.map((story) => (story.id === id ? { ...story, isRead: true } : story)),
    );
  }

  return (
    <section aria-labelledby="feed-heading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">Sample feed</p>
          <h1 id="feed-heading" className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Worth your attention
          </h1>
        </div>
        <p className="hidden text-sm text-[var(--muted)] sm:block">
          {stories.length} source-verified examples
        </p>
      </div>

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
              isSaved={savedIds.has(story.id)}
              isReadLater={readLaterIds.has(story.id)}
              feedbackOpen={feedbackStoryId === story.id}
              onRead={() => markRead(story.id)}
              onToggleSaved={() => toggleId(setSavedIds, story.id)}
              onToggleReadLater={() => toggleId(setReadLaterIds, story.id)}
              onToggleFeedback={() =>
                setFeedbackStoryId((current) => (current === story.id ? null : story.id))
              }
              onDismiss={() => {
                setStories((current) => current.filter((item) => item.id !== story.id));
                setFeedbackStoryId(null);
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
