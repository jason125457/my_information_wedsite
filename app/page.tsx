import { LogOut, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { FeedList } from "@/components/feed/feed-list";
import { Button } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/auth/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=configuration");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not-allowed");
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgb(246_248_251_/_0.9)] backdrop-blur-xl">
        <div className="mx-auto flex h-17 max-w-5xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-white">
              <Sparkles aria-hidden="true" size={17} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-[-0.01em]">Personal Feed</p>
              <p className="hidden text-xs text-[var(--muted)] sm:block">Less, but better.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-56 truncate text-sm text-[var(--muted)] md:block">
              {data.user.email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                <LogOut aria-hidden="true" size={16} />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <FeedList />
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
