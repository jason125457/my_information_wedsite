import { AppHeader } from "@/components/app-header";
import { FeedList } from "@/components/feed/feed-list";
import type { FeedView } from "@/lib/feed/load-feed";
import type { FeedStory } from "@/lib/feed/types";

interface FeedPageProps {
  email?: string;
  stories: FeedStory[];
  view?: FeedView;
  /** "front" is the home page: lead story, side list and discovery band. */
  layout?: "front" | "list";
  eyebrow?: string;
  heading?: string;
  canPersonalize?: boolean;
}

export function FeedPage(props: FeedPageProps) {
  const today = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <>
      <AppHeader email={props.email} />
      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex flex-col gap-4 border-b-2 border-[var(--ink)] pt-10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {props.eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">{props.eyebrow}</p>
            ) : null}
            <h1 className="mt-1 font-serif text-[clamp(32px,5vw,50px)] leading-[1.08] font-semibold tracking-[-0.02em]">
              {props.heading ?? "今天值得你看的"}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{today}</p>
          </div>
          <p className="text-sm text-[var(--muted)] sm:text-right">
            <span className="block font-serif text-[34px] leading-none font-semibold text-[var(--ink)] tabular-nums">
              {props.stories.length}
            </span>
            則通過品質門檻
          </p>
        </header>

        <FeedList
          initialStories={props.stories}
          view={props.view}
          layout={props.layout}
          canPersonalize={props.canPersonalize ?? Boolean(props.email)}
        />

        <footer className="mt-12 flex items-center justify-between border-t border-[var(--line)] py-8 text-[13px] text-[var(--muted)]">
          <p>沒有無限捲動。今天就到這裡。</p>
          <a href="#top" className="font-medium text-[var(--ink-soft)] hover:text-[var(--accent)]">
            回到頂端
          </a>
        </footer>
      </main>
    </>
  );
}
