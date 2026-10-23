import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { CompactStoryList } from "@/components/feed/compact-story-list";
import { getOptionalAuthenticatedUser } from "@/lib/auth/require-user";
import { loadWeeklyReview, type TopicCount } from "@/lib/weekly/load";

export const dynamic = "force-dynamic";

const dayFormatter = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });

export default async function WeeklyReviewPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const { supabase, user } = await getOptionalAuthenticatedUser();
  const review = await loadWeeklyReview(supabase, user?.id ?? null, date);
  if (!review) notFound();

  const range = `${dayFormatter.format(new Date(review.start))} – ${dayFormatter.format(new Date(Date.parse(review.end) - 1))}`;

  return (
    <>
      <AppHeader email={user?.email} />
      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <header className="border-b-2 border-[var(--ink)] pt-10 pb-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">每週回顧 · {range}</p>
          <h1 className="mt-1 font-serif text-[clamp(32px,5vw,50px)] leading-[1.08] font-semibold tracking-[-0.02em]">
            這一週，值得記住的
          </h1>
        </header>

        <section aria-label="本週摘要" className="mt-8 rounded-2xl border-l-4 border-[var(--accent)] bg-[var(--surface)] px-6 py-5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]">
            <Sparkles aria-hidden="true" size={14} />
            本週摘要
          </p>
          <p className="mt-2 font-serif text-[19px] leading-[1.8]">{review.summary}</p>
        </section>

        {review.personal ? (
          <section aria-labelledby="you-heading" className="mt-10">
            <h2 id="you-heading" className="font-serif text-2xl font-semibold">
              你的一週
            </h2>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="已讀" value={review.personal.read} />
              <Stat label="收藏" value={review.personal.saved} />
              <Stat label="不感興趣" value={review.personal.skipped} />
            </dl>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TopicLine label="收藏最多的主題" topics={review.personal.savedTopics} empty="這週還沒有收藏" />
              <TopicLine label="最常略過的主題" topics={review.personal.skippedTopics} empty="這週沒有略過任何內容" />
            </div>
          </section>
        ) : null}

        <Section title="本週最值得記住" hint={`${review.picks.length} 則`}>
          {review.picks.length ? <CompactStoryList stories={review.picks} numbered /> : <Empty text="這週沒有內容通過品質門檻。" />}
        </Section>

        {review.discoveries.length ? (
          <Section title="本週新發現" hint="樂團、攝影景點與新工具">
            <CompactStoryList stories={review.discoveries} />
          </Section>
        ) : null}

        {review.personal?.readLater.length ? (
          <Section title="還沒讀的稍後閱讀" hint="週末有空的話">
            <CompactStoryList stories={review.personal.readLater} />
          </Section>
        ) : null}
      </main>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-semibold">{title}</h2>
        <span className="shrink-0 text-[13px] text-[var(--muted)]">{hint}</span>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
      <dd className="font-serif text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function TopicLine({ label, topics, empty }: { label: string; topics: TopicCount[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[13px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-[15px] font-medium">
        {topics.length ? (
          topics.map((item) => `${item.topic} ${item.count}`).join(" · ")
        ) : (
          <span className="font-normal text-[var(--muted)]">{empty}</span>
        )}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
      {text}
    </p>
  );
}
