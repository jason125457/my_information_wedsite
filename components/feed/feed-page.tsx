import { AppHeader } from "@/components/app-header";
import { FeedList } from "@/components/feed/feed-list";
import type { FeedView } from "@/lib/feed/load-feed";
import type { FeedStory } from "@/lib/feed/types";

interface FeedPageProps {
  email?: string;
  stories: FeedStory[];
  view?: FeedView;
  eyebrow?: string;
  heading?: string;
}

export function FeedPage(props: FeedPageProps) {
  return (
    <>
      <AppHeader email={props.email} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <FeedList
          initialStories={props.stories}
          view={props.view}
          eyebrow={props.eyebrow}
          heading={props.heading}
        />
        <footer className="mt-9 flex items-center justify-between border-t border-[var(--line)] py-6 text-sm text-[var(--muted)]">
          <p>No infinite scroll. You’ve reached the end.</p>
          <a href="#feed-heading" className="font-semibold text-[var(--ink-soft)] hover:text-[var(--accent)]">
            Back to top
          </a>
        </footer>
      </main>
    </>
  );
}
