import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { requestMagicLink } from "@/app/login/actions";
import { buttonVariants } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/auth/authorization";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  "not-allowed": "請使用設定好的那一個 email 登入。",
  configuration: "登入功能尚未設定，請檢查環境設定。",
  callback: "登入連結無效或已過期，請重新寄一封。",
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
      <section className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_24px_70px_rgba(24,24,27,0.08)] sm:p-10">
        <div className="mb-9 flex size-12 items-center justify-center rounded-2xl bg-[var(--ink)] text-[var(--on-ink)]">
          <LockKeyhole aria-hidden="true" size={21} />
        </div>

        <p className="mb-3 font-serif text-lg font-semibold text-[var(--accent)]">Personal Feed</p>
        <h1 className="font-serif text-3xl leading-[1.25] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          你在網路上比較安靜的角落。
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          瀏覽不需要登入。登入後可以收藏、稍後閱讀和提供回饋。我們會寄一封登入連結到你的信箱，不需要密碼。
        </p>

        {wasSent ? (
          <div className="mt-8 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-sm leading-6 text-[var(--success)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0" aria-hidden="true" size={18} />
              <p>
                如果這個 email 有權限，登入連結已經寄出。點開信裡的連結後，這個分頁就可以關掉。
              </p>
            </div>
          </div>
        ) : (
          <form action={requestMagicLink} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-base text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-soft)]"
              />
            </div>
            {errorMessages[errorKey] ? (
              <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">
                {errorMessages[errorKey]}
              </p>
            ) : null}
            <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "h-12 w-full")}>
              寄送登入連結
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </form>
        )}

        <p className="mt-8 border-t border-[var(--line)] pt-6 text-sm leading-6 text-[var(--muted)]">
          只有指定的 email 會收到登入連結；個人資料另外受資料庫權限保護。
        </p>
      </section>
    </main>
  );
}
