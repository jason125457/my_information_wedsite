import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { getOptionalAuthenticatedUser } from "@/lib/auth/require-user";
import { loadDailyDigests } from "@/lib/digest/load";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const { supabase, user } = await getOptionalAuthenticatedUser();
  const digests = await loadDailyDigests(supabase);

  return (
    <>
      <AppHeader email={user?.email} />
      <main className="mx-auto max-w-3xl px-5 sm:px-8">
        <header className="border-b-2 border-[var(--ink)] pt-10 pb-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">每日精選</p>
          <h1 className="mt-1 font-serif text-[clamp(32px,5vw,50px)] leading-[1.08] font-semibold tracking-[-0.02em]">
            有限的一份日報
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">每晚 22:00 從當天最值得看的內容中挑出 15–20 則，寧缺勿濫。</p>
        </header>
        <ol className="mt-2">
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
            <li className="mt-8 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
              第一份每日精選會在今晚 22:00（台北時間）排程執行後出現。
            </li>
          )}
        </ol>
      </main>
    </>
  );
}
