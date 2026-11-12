"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

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

/**
 * The AI summary plus its key points. Cards start collapsed (summary clamped,
 * points hidden) and expand in place; `open` renders everything, for the lead story.
 */
export function StoryDigest({
  story,
  tone = "paper",
  open = false,
  className,
}: {
  story: FeedStory;
  tone?: "paper" | "night";
  open?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(open);
  const points = story.keyPoints;
  const showAll = open || expanded;

  return (
    <div className="space-y-2.5">
      <p className={cn(className, !showAll && "line-clamp-3")}>{story.summary}</p>
      {showAll && points.length ? (
        <ul
          aria-label="重點"
          data-topic={story.topic}
          className={cn(
            "space-y-1.5 border-l-2 pl-3.5 text-[14.5px] leading-[1.7]",
            tone === "paper"
              ? "border-[color-mix(in_srgb,var(--topic)_55%,var(--surface))] text-[var(--ink)]"
              : "border-[color-mix(in_srgb,var(--topic)_60%,#111)] text-zinc-200",
          )}
        >
          {points.map((point) => (
            <li key={point} className="relative pl-3.5">
              <span
                aria-hidden="true"
                className="absolute top-[0.72em] left-0 size-1.5 rounded-full bg-[var(--topic)]"
              />
              {point}
            </li>
          ))}
        </ul>
      ) : null}
      {!open && (points.length || story.summary.length > 90) ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "inline-flex min-h-8 items-center gap-1 rounded-md text-[13px] font-semibold",
            tone === "paper" ? "text-[var(--accent)] hover:underline" : "text-teal-300 hover:underline",
          )}
        >
          {expanded ? "收起" : points.length ? `展開重點（${points.length}）` : "展開摘要"}
          <ChevronDown aria-hidden="true" size={15} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      ) : null}
    </div>
  );
}
