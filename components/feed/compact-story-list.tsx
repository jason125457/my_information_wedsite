import { StoryMeta, TopicChip } from "@/components/feed/story-parts";
import type { FeedStory } from "@/lib/feed/types";

/** Read-only list for summaries such as the weekly review. */
export function CompactStoryList({ stories, numbered = false }: { stories: FeedStory[]; numbered?: boolean }) {
  return (
    <ol className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      {stories.map((story, index) => (
        <li key={story.id} className={numbered ? "grid grid-cols-[32px_1fr] gap-3 px-5 py-4" : "px-5 py-4"}>
          {numbered ? (
            <span aria-hidden="true" className="font-serif text-lg leading-7 font-semibold text-[var(--muted)] tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1.5">
            <TopicChip story={story} />
            <h3 className="font-serif text-[17px] leading-[1.45] font-bold">
              <a href={story.primaryUrl} target="_blank" rel="noreferrer" className="hover:underline decoration-[var(--line-strong)] underline-offset-4">
                {story.title}
              </a>
            </h3>
            <p className="line-clamp-2 text-sm leading-[1.7] text-[var(--ink-soft)]">{story.summary}</p>
            <StoryMeta story={story} />
          </div>
        </li>
      ))}
    </ol>
  );
}
