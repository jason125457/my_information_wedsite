import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation: NavItem[] = [
  { href: "/", label: "今日" },
  { href: "/digest", label: "每日精選" },
  { href: "/saved", label: "收藏" },
  { href: "/read-later", label: "稍後閱讀" },
  { href: "/history", label: "歷史" },
];

const privateNavigation: NavItem[] = [{ href: "/settings", label: "設定" }];

export function AppHeader({ email }: { email?: string }) {
  return (
    <header id="top" className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
        <Link href="/" className="leading-none">
          <span className="block font-serif text-[22px] font-semibold tracking-[-0.01em]">Personal Feed</span>
          <span className="mt-1 block text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Less, but better</span>
        </Link>

        <nav aria-label="主要導覽" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:order-2 sm:ml-auto sm:w-auto">
          <NavLinks items={[...navigation, ...(email ? privateNavigation : [])]} />
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
          <ThemeToggle />
          {email ? (
            <form action={signOut}>
              <button type="submit" title={email} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium hover:border-[var(--line-strong)]">
                <LogOut aria-hidden="true" size={15} />
                登出
              </button>
            </form>
          ) : (
            <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium hover:border-[var(--line-strong)]">
              <LogIn aria-hidden="true" size={15} />
              登入
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
