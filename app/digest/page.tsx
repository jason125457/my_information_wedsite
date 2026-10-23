import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { getOptionalAuthenticatedUser } from "@/lib/auth/require-user";
import { loadDailyDigests } from "@/lib/digest/load";
import { loadWeeklyReviews } from "@/lib/weekly/load";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const { supabase, user } = await getOptionalAuthenticatedUser();
  const [digests, weeklies] = await Promise.all([loadDailyDigests(supabase), loadWeeklyReviews(supabase)]);

  return (
    <>
      <AppHeader email={user?.email} />
      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <header className="border-b-2 border-[var(--ink)] pt-10 pb-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">每日精選</p>
          <h1 className="mt-1 font-serif text-[clamp(32px,5vw,50px)] leading-[1.08] font-semibold tracking-[-0.02em]">
            有限的一份日報
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            每晚 22:00 從當天最值得看的內容中挑出 15–20 則；每週日 21:00 另有一份每週回顧。
          </p>
        </header>

        {weeklies.length ? (
          <section aria-labelledby="weekly-heading" className="mt-8">
            <h2 id="weekly-heading" className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
              每週回顧
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {weeklies.slice(0, 4).map((weekly) => (
                <li key={weekly.id}>
                  <Link
                    href={`/weekly/${weekly.date}`}
                    className="group block h-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 hover:border-[var(--line-strong)]"
                  >
                    <span className="flex items-center justify-between gap-3 font-serif text-lg font-bold">
                      {weekly.title}
                      <ArrowRight aria-hidden="true" size={15} className="shrink-0 text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-[var(--muted)]">{weekly.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <h2 className="mt-10 text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">每日精選</h2>
        <ol className="mt-1">
          {digests.length ? (
            digests.map((digest) => (
              <li key={digest.id} className="border-b border-[var(--line)]">
                <Link href={`/digest/${digest.date}`} className="group flex items-center justify-between gap-5 py-5">
                  <span>
                    <span className="block font-serif text-xl font-bold">{digest.title}</span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">{digest.summary}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                    {digest.itemCount} 則
                    <ArrowRight aria-hidden="true" size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))
          ) : (
            <li className="mt-4 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
              第一份每日精選會在今晚 22:00（台北時間）排程執行後出現。
            </li>
          )}
        </ol>
      </main>
    </>
  );
}
