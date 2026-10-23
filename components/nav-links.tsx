"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/** Primary navigation with the current page highlighted. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
