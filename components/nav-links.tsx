"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/** Primary navigation; the longest matching href is the current page. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const current = items
    .filter((item) => matches(item.href))
    .sort((first, second) => second.href.length - first.href.length)[0]?.href;

  return (
    <>
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-[var(--ink)] text-white" : "text-[var(--ink-soft)] hover:bg-[var(--surface-subtle)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
