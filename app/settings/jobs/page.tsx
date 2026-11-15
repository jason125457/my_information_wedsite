import { AppHeader } from "@/components/app-header";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadRecentJobs, loadSourceHealth } from "@/lib/jobs/load";
import type { SourceHealthIssue } from "@/lib/jobs/source-health";

export const dynamic = "force-dynamic";

const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function JobsPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const [jobs, healthIssues] = await Promise.all([
    loadRecentJobs(supabase),
    // The health panel is secondary: never let it take the job history down.
    loadSourceHealth(supabase).catch(() => [] as SourceHealthIssue[]),
  ]);
  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold text-[var(--accent)]">Operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Job history</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          最近的內容收集與 Daily Digest 執行狀態。只有已登入的個人帳號能查看錯誤細節。
        </p>

        {healthIssues.length ? (
          <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <h2 className="font-semibold">來源健康警示（{healthIssues.length}）</h2>
            <p className="mt-1 text-sm">連續失敗 3 次以上，或 14 天沒有收錄任何 story 的來源。</p>
            <ul className="mt-3 space-y-2 text-sm">
              {healthIssues.map((issue) => (
                <li key={issue.key} className="rounded-xl bg-white/70 p-3">
                  <span className="font-medium">{issue.name}</span>
                  {issue.failing ? <span> · 連續失敗 {issue.consecutiveFailures} 次</span> : null}
                  {issue.stale ? (
                    <span>
                      {" · "}
                      {issue.daysSinceInserted === null
                        ? "近期沒有收錄過 story"
                        : `上次收錄在 ${issue.daysSinceInserted} 天前`}
                    </span>
                  ) : null}
                  {issue.failing && issue.lastError ? (
                    <span className="mt-1 block text-[var(--danger)]">{issue.lastError}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 space-y-4">
          {jobs.length ? jobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{job.type === "ingestion" ? "Feed refresh" : job.type === "daily_digest" ? "Daily Digest" : job.type}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {timeFormatter.format(new Date(job.startedAt))} · {job.itemsProcessed} 則處理完成
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(job.status)}`}>
                  {job.status}
                </span>
              </div>
              {job.error ? <p className="mt-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{job.error}</p> : null}
              {job.sources.length ? (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-semibold text-[var(--ink-soft)]">來源明細（{job.sources.length}）</summary>
                  <ul className="mt-3 space-y-2">
                    {job.sources.map((source, index) => (
                      <li key={`${source.name}-${index}`} className="rounded-xl bg-[var(--surface-subtle)] p-3">
                        <span className="font-medium">{source.name}</span> · 擷取 {source.fetched} · 收錄 {source.inserted}
                        {source.error ? <span className="mt-1 block text-[var(--danger)]">{source.error}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          )) : (
            <p className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
              尚無排程紀錄。第一次執行後會顯示在這裡。
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function statusClass(status: "running" | "succeeded" | "partial" | "failed") {
  if (status === "succeeded") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "failed") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (status === "partial") return "bg-amber-50 text-amber-900";
  return "bg-[var(--accent-soft)] text-[var(--accent)]";
}
