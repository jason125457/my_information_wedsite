import Link from "next/link";
import { LogOut, Sparkles } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/", label: "For You" },
  { href: "/digest", label: "Digest" },
  { href: "/saved", label: "Saved" },
  { href: "/read-later", label: "Read Later" },
  { href: "/history", label: "History" },
];

export function AppHeader({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgb(246_248_251_/_0.9)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-17 max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-white">
            <Sparkles aria-hidden="true" size={17} />
          </span>
          <span>
            <span className="block text-sm font-bold tracking-[-0.01em]">Personal Feed</span>
            <span className="hidden text-xs text-[var(--muted)] sm:block">Less, but better.</span>
          </span>
        </Link>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-2 sm:w-auto" aria-label="Personal Feed">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="order-2 flex items-center gap-2 sm:order-3">
          {email ? (
            <span className="hidden max-w-40 truncate text-sm text-[var(--muted)] lg:block">{email}</span>
          ) : null}
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
              <LogOut aria-hidden="true" size={16} />
              <span className="hidden lg:inline">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
