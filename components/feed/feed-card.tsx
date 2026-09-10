"use client";

import { Bookmark, Clock3, ExternalLink, Save, ThumbsDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { FeedStory } from "@/lib/feed/mock-stories";
import { cn } from "@/lib/utils";

const feedbackReasons = [
  "Topic not interesting",
  "Low value or gossip",
  "Too technical",
  "Already knew this",
  "Poor source",
  "Do not recommend this type",
];

interface FeedCardProps {
  story: FeedStory;
  isSaved: boolean;
  isReadLater: boolean;
  feedbackOpen: boolean;
  onRead: () => void;
  onToggleSaved: () => void;
  onToggleReadLater: () => void;
  onToggleFeedback: () => void;
  onDismiss: () => void;
}

export function FeedCard({
  story,
  isSaved,
  isReadLater,
  feedbackOpen,
  onRead,
  onToggleSaved,
  onToggleReadLater,
  onToggleFeedback,
  onDismiss,
}: FeedCardProps) {
  return (
    <article
      className={cn(
        "rounded-[1.6rem] border bg-[var(--surface)] p-5 transition sm:p-7",
        story.isRead
          ? "border-[var(--line)] opacity-70"
          : "border-[var(--line-strong)] shadow-[0_16px_45px_rgba(31,41,55,0.055)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-blue-100 bg-[var(--accent-soft)] text-[var(--accent)]">
          {story.topicLabel}
        </Badge>
        <Badge>{story.contentType}</Badge>
        {story.isRead ? <span className="text-xs font-semibold text-[var(--muted)]">Read</span> : null}
      </div>

      <h2 className="mt-5 max-w-3xl text-[1.55rem] leading-[1.18] font-semibold tracking-[-0.025em] text-[var(--ink)] sm:text-[1.8rem]">
        {story.title}
      </h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--ink-soft)]">
        {story.summary}
      </p>

      <div className="mt-5 rounded-2xl border-l-2 border-[var(--accent)] bg-[var(--surface-subtle)] px-4 py-3.5">
        <p className="text-xs font-bold tracking-[0.13em] text-[var(--muted)] uppercase">
          Why this is here
        </p>
        <p className="mt-1.5 text-sm leading-6 text-[var(--ink-soft)]">
          {story.whyRecommended}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--muted)]">
        <span className="font-semibold text-[var(--ink-soft)]">{story.source}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 aria-hidden="true" size={14} />
          <time dateTime={story.publishedAt}>{story.publishedLabel}</time>
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
        <a
          href={story.primaryUrl}
          target="_blank"
          rel="noreferrer"
          onClick={onRead}
          className={buttonVariants({ variant: "primary", size: "sm" })}
        >
          View original
          <ExternalLink aria-hidden="true" size={15} />
        </a>
        <Button
          type="button"
          size="sm"
          variant={isReadLater ? "primary" : "secondary"}
          aria-pressed={isReadLater}
          onClick={onToggleReadLater}
        >
          <Bookmark aria-hidden="true" size={15} fill={isReadLater ? "currentColor" : "none"} />
          Read later
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isSaved ? "primary" : "secondary"}
          aria-pressed={isSaved}
          onClick={onToggleSaved}
        >
          <Save aria-hidden="true" size={15} fill={isSaved ? "currentColor" : "none"} />
          Save
        </Button>
        <Button type="button" size="sm" variant="danger" aria-expanded={feedbackOpen} onClick={onToggleFeedback}>
          <ThumbsDown aria-hidden="true" size={15} />
          Not interested
        </Button>
      </div>

      {feedbackOpen ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-semibold text-[var(--ink)]">
            Tell the feed why
            <select className="mt-2 h-10 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-normal">
              {feedbackReasons.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="primary" onClick={onDismiss}>
            Hide story
          </Button>
        </div>
      ) : null}
    </article>
  );
}
