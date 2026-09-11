"use client";

import { useState } from "react";
import { Bookmark, Clock3, ExternalLink, Save, ThumbsDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { feedbackReasons, type FeedbackReason } from "@/lib/feed/state";
import type { FeedStory } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

interface FeedCardProps {
  story: FeedStory;
  feedbackOpen: boolean;
  isPending: boolean;
  onRead: () => void;
  onToggleSaved: () => void;
  onToggleReadLater: () => void;
  onToggleFeedback: () => void;
  onDismiss: (reason: FeedbackReason) => void;
}

export function FeedCard({
  story,
  feedbackOpen,
  isPending,
  onRead,
  onToggleSaved,
  onToggleReadLater,
  onToggleFeedback,
  onDismiss,
}: FeedCardProps) {
  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason>("topic_not_interesting");

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
        {story.sourceCount > 1 ? <span>+{story.sourceCount - 1} sources</span> : null}
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
          variant={story.isReadLater ? "primary" : "secondary"}
          aria-pressed={story.isReadLater}
          disabled={isPending}
          onClick={onToggleReadLater}
        >
          <Bookmark aria-hidden="true" size={15} fill={story.isReadLater ? "currentColor" : "none"} />
          Read later
        </Button>
        <Button
          type="button"
          size="sm"
          variant={story.isSaved ? "primary" : "secondary"}
          aria-pressed={story.isSaved}
          disabled={isPending}
          onClick={onToggleSaved}
        >
          <Save aria-hidden="true" size={15} fill={story.isSaved ? "currentColor" : "none"} />
          Save
        </Button>
        <Button type="button" size="sm" variant="danger" aria-expanded={feedbackOpen} disabled={isPending} onClick={onToggleFeedback}>
          <ThumbsDown aria-hidden="true" size={15} />
          Not interested
        </Button>
      </div>

      {feedbackOpen ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-semibold text-[var(--ink)]">
            Tell the feed why
            <select
              value={feedbackReason}
              onChange={(event) => setFeedbackReason(event.target.value as FeedbackReason)}
              className="mt-2 h-10 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-normal"
            >
              {feedbackReasons.map((reason) => (
                <option key={reason.value} value={reason.value}>{reason.label}</option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="primary" disabled={isPending} onClick={() => onDismiss(feedbackReason)}>
            Hide story
          </Button>
        </div>
      ) : null}
    </article>
  );
}
