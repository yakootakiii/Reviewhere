"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // §7.1: the gradient is reserved for primary CTAs.
  primary:
    "bg-accent-gradient text-white shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-[1.06] active:brightness-95",
  secondary:
    "bg-surface-secondary text-primary hairline hover:bg-surface-hover",
  ghost: "text-secondary hover:bg-surface-secondary hover:text-primary",
  destructive: "bg-[var(--color-error)] text-white hover:brightness-[1.06]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-[10px] gap-1.5",
  md: "h-11 px-5 text-callout rounded-md gap-2",
  lg: "h-13 px-7 text-body rounded-md gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, fullWidth, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // §7.3: scale to 0.97 on press, spring back on release.
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[transform,background-color,filter,opacity] duration-200 [transition-timing-function:var(--ease-out-soft)]",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

/** Circular, tinted icon-only button. Always needs an accessible label (§6). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ className, label, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        "text-secondary transition-all duration-200 [transition-timing-function:var(--ease-out-soft)]",
        "hover:bg-surface-secondary hover:text-primary active:scale-[0.94]",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
