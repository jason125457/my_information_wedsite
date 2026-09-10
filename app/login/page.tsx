import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { requestMagicLink } from "@/app/login/actions";
import { buttonVariants } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/auth/authorization";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  "not-allowed": "This feed is private. Use the email configured for this installation.",
  configuration: "Authentication is not configured yet. Check the local setup values.",
  callback: "That sign-in link is invalid or has expired. Request a fresh link.",
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const errorKey = typeof parameters.error === "string" ? parameters.error : "";
  const wasSent = parameters.sent === "1";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (isAllowedEmail(data.user?.email)) {
      redirect("/");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-white p-7 shadow-[0_24px_70px_rgba(31,41,55,0.08)] sm:p-10">
        <div className="mb-9 flex size-12 items-center justify-center rounded-2xl bg-[var(--ink)] text-white">
          <LockKeyhole aria-hidden="true" size={21} />
        </div>

        <p className="mb-3 text-sm font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          Personal Feed
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--ink)]">
          Your quieter corner of the internet.
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          Sign in with the one email allowed for this private feed. We’ll send a secure link—no password needed.
        </p>

        {wasSent ? (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-[var(--success-soft)] p-4 text-sm leading-6 text-[var(--success)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0" aria-hidden="true" size={18} />
              <p>
                If that address is authorized, a sign-in link is on its way. You can close this tab after opening it.
              </p>
            </div>
          </div>
        ) : (
          <form action={requestMagicLink} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-[var(--line-strong)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-blue-100"
              />
            </div>
            {errorMessages[errorKey] ? (
              <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">
                {errorMessages[errorKey]}
              </p>
            ) : null}
            <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "h-12 w-full")}>
              Send magic link
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </form>
        )}

        <p className="mt-8 border-t border-[var(--line)] pt-6 text-sm leading-6 text-[var(--muted)]">
          Access is restricted before Supabase sends a link, and protected data is independently guarded by database policies.
        </p>
      </section>
    </main>
  );
}
