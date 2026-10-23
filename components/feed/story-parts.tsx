"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import type { FeedStory } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

/** Topic label with the topic's colour dot. `tone="night"` is for dark sections. */
export function TopicChip({ story, tone = "paper" }: { story: FeedStory; tone?: "paper" | "night" }) {
  return (
    <span
      data-topic={story.topic}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-medium",
        tone === "paper"
          ? "bg-[color-mix(in_srgb,var(--topic)_14%,var(--surface))] text-[var(--topic)]"
          : "bg-[color-mix(in_srgb,var(--topic)_22%,#111)] text-[color-mix(in_srgb,var(--topic)_45%,white)]",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--topic)]" />
      {story.topicLabel}
    </span>
  );
}

/**
 * The story's feed image, or a topic-coloured placeholder when the feed gave
 * none or the publisher refuses to serve it. Images stay on the publisher's
 * host; no-referrer avoids hotlink blocks that key on the Referer header.
 */
export function StoryMedia({
  story,
  className,
  priority = false,
}: {
  story: FeedStory;
  className?: string;
  /** Above-the-fold images load eagerly instead of lazily. */
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = story.imageUrl && !failed;

  return (
    <div
      data-topic={story.topic}
      className={cn(
        "relative overflow-hidden bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--topic)_45%,var(--surface)),color-mix(in_srgb,var(--topic)_60%,#111))]",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote publisher images; no optimizer on the free Workers plan
        <img
          src={story.imageUrl!}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-serif text-3xl font-semibold tracking-wide text-white/90"
        >
          {story.topicLabel}
        </span>
      )}
    </div>
  );
}

export function StoryMeta({ story, tone = "paper" }: { story: FeedStory; tone?: "paper" | "night" }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-5",
        tone === "paper" ? "text-[var(--muted)]" : "text-zinc-400",
      )}
    >
      <span className="font-medium">{story.source}</span>
      {story.sourceCount > 1 ? <span>+{story.sourceCount - 1} 個來源</span> : null}
      <span aria-hidden="true">·</span>
      <time dateTime={story.publishedAt}>{story.publishedLabel}</time>
      {story.contentType === "Discovery" ? (
        <span className="rounded border border-current px-1 text-[11px] leading-4">探索</span>
      ) : null}
      {story.isRead ? <span className="text-[11px]">· 已讀</span> : null}
    </p>
  );
}

export function WhyLine({ story }: { story: FeedStory }) {
  return (
    <p className="flex items-start gap-1.5 text-[13px] leading-[1.6] text-[var(--accent)]">
      <Sparkles aria-hidden="true" size={14} className="mt-[3px] shrink-0" />
      <span>
        <span className="sr-only">推薦理由：</span>
        {story.whyRecommended}
      </span>
    </p>
  );
}
