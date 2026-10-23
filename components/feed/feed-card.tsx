"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, Clock3, EyeOff } from "lucide-react";

import { StoryMedia, StoryMeta, TopicChip, WhyLine } from "@/components/feed/story-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { feedbackReasons, type FeedbackReason } from "@/lib/feed/state";
import type { FeedStory } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

export interface StoryActions {
  canPersonalize: boolean;
  isPending: boolean;
  feedbackOpen: boolean;
  onRead: () => void;
  onToggleSaved: () => void;
  onToggleReadLater: () => void;
  onToggleFeedback: () => void;
  onDismiss: (reason: FeedbackReason) => void;
}

export function FeedCard({ story, actions }: { story: FeedStory; actions: StoryActions }) {
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-20px_rgba(24,24,27,0.45)]",
        story.isRead ? "border-[var(--line)] opacity-65" : "border-[var(--line)]",
      )}
    >
      <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actions.onRead} tabIndex={-1} aria-hidden="true">
        <StoryMedia story={story} className="aspect-[16/10]" />
      </a>
      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <TopicChip story={story} />
          <span
            className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-xs leading-4 font-semibold text-[var(--muted)] tabular-nums"
            title="推薦分數"
          >
            <span className="sr-only">推薦分數 </span>
            {story.finalScore}
          </span>
        </div>
        <h3 className="font-serif text-[19px] leading-[1.42] font-bold text-[var(--ink)]">
          <a href={story.primaryUrl} target="_blank" rel="noreferrer" onClick={actions.onRead} className="hover:underline decoration-[var(--line-strong)] underline-offset-4">
            {story.title}
          </a>
        </h3>
        <p className="line-clamp-3 text-[15px] leading-[1.7] text-[var(--ink-soft)]">{story.summary}</p>
        <WhyLine story={story} />
        <div className="mt-auto pt-1">
          <StoryMeta story={story} />
        </div>
        <StoryActionBar story={story} actions={actions} />
      </div>
    </article>
  );
}

/** "Read original" plus the personal actions; shared by cards and the lead story. */
export function StoryActionBar({ story, actions, tone = "paper" }: { story: FeedStory; actions: StoryActions; tone?: "paper" | "night" }) {
  const [reason, setReason] = useState<FeedbackReason>("topic_not_interesting");
  const iconButton = cn(
    "grid size-10 place-items-center rounded-full transition-colors disabled:opacity-45",
    tone === "paper"
      ? "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"
      : "text-zinc-400 hover:bg-white/10 hover:text-white",
  );

  return (
    <div className={cn("border-t pt-3", tone === "paper" ? "border-[var(--line)]" : "border-[var(--night-line)]")}>
      <div className="flex items-center gap-1">
        <a
          href={story.primaryUrl}
          target="_blank"
          rel="noreferrer"
          onClick={actions.onRead}
          className={cn(
            buttonVariants({ variant: "primary", size: "sm" }),
            "mr-auto h-10",
            tone === "night" && "bg-white text-[var(--ink)] hover:bg-zinc-200",
          )}
        >
          閱讀原文
          <ArrowUpRight aria-hidden="true" size={15} />
        </a>
        {actions.canPersonalize ? (
          <>
            <button
              type="button"
              className={iconButton}
              aria-label={story.isReadLater ? "移出稍後閱讀" : "稍後閱讀"}
              aria-pressed={story.isReadLater}
              title="稍後閱讀"
              disabled={actions.isPending}
              onClick={actions.onToggleReadLater}
            >
              <Clock3 aria-hidden="true" size={18} className={story.isReadLater ? "text-[var(--accent)]" : undefined} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={story.isSaved ? "取消收藏" : "收藏"}
              aria-pressed={story.isSaved}
              title="收藏"
              disabled={actions.isPending}
              onClick={actions.onToggleSaved}
            >
              <Bookmark aria-hidden="true" size={18} fill={story.isSaved ? "currentColor" : "none"} className={story.isSaved ? "text-[var(--accent)]" : undefined} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label="不感興趣"
              aria-expanded={actions.feedbackOpen}
              title="不感興趣"
              disabled={actions.isPending}
              onClick={actions.onToggleFeedback}
            >
              <EyeOff aria-hidden="true" size={18} />
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className={cn("rounded-full px-3 py-2 text-[13px] font-medium", tone === "paper" ? "text-[var(--muted)] hover:bg-[var(--surface-subtle)]" : "text-zinc-400 hover:bg-white/10")}
          >
            登入以收藏
          </Link>
        )}
      </div>

      {actions.feedbackOpen ? (
        <div className={cn("mt-3 flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-end", tone === "paper" ? "bg-[var(--surface-subtle)]" : "bg-white/5")}>
          <label className="flex-1 text-[13px] font-medium">
            為什麼不想看？
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as FeedbackReason)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-normal text-[var(--ink)]"
            >
              {feedbackReasons.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="primary" className="h-10" disabled={actions.isPending} onClick={() => actions.onDismiss(reason)}>
            隱藏這則
          </Button>
        </div>
      ) : null}
    </div>
  );
}
