import { AppHeader } from "@/components/app-header";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadRecentJobs } from "@/lib/jobs/load";

export const dynamic = "force-dynamic";

const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function JobsPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const jobs = await loadRecentJobs(supabase);
  const aiConfigured = Boolean(
    process.env.OPENAI_API_KEY &&
      process.env.OPENAI_MODEL_FAST &&
      process.env.OPENAI_MODEL_REASONING,
  );

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold text-[var(--accent)]">Operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Job history</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          最近的內容收集與 Daily Digest 執行狀態。只有已登入的個人帳號能查看錯誤細節。
        </p>

        {!aiConfigured ? (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            AI 收集尚未啟用：請在 Vercel 設定 OpenAI API 金鑰、快速模型與推理模型。排程會略過收集，不會把舊資料當成新內容。
          </p>
        ) : null}

        <div className="mt-8 space-y-4">
          {jobs.length ? jobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-[var(--line)] bg-white p-5">
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
            <p className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-white p-8 text-center text-[var(--muted)]">
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
