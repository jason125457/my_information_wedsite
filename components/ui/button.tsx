import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--ink)] text-white shadow-sm hover:bg-[var(--ink-soft)]",
        secondary:
          "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]",
        ghost:
          "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]",
        danger:
          "text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
