import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { loadDailyDigests } from "@/lib/digest/load";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const { supabase, user } = await requireAuthenticatedUser();
  const digests = await loadDailyDigests(supabase);

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold text-[var(--accent)]">Daily Digest</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">A finite daily briefing</h1>
        <div className="mt-8 space-y-3">
          {digests.length ? digests.map((digest) => (
            <Link key={digest.id} href={`/digest/${digest.date}`} className="flex items-center justify-between gap-5 rounded-2xl border border-[var(--line)] bg-white p-5 hover:border-[var(--line-strong)]">
              <span>
                <span className="flex items-center gap-2 font-semibold"><CalendarDays size={16} aria-hidden="true" />{digest.title}</span>
                <span className="mt-1 block text-sm text-[var(--muted)]">{digest.summary}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[var(--accent)]">{digest.itemCount} items</span>
            </Link>
          )) : (
            <p className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-white p-8 text-center text-[var(--muted)]">The first digest will appear after the 22:00 Taipei schedule runs.</p>
          )}
        </div>
      </main>
    </>
  );
}
