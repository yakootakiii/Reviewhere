"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

/**
 * Priority comes from fill and contrast, not from gradients or glow. Primary is
 * a single flat accent; secondary is a hairline; ghost is text.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-accent-foreground hover:bg-[var(--color-accent-hover)]",
  secondary: "bg-transparent text-primary hairline hover:bg-surface-secondary",
  ghost: "text-secondary hover:bg-surface-secondary hover:text-primary",
  destructive: "bg-[var(--color-error)] text-white hover:brightness-95",
};

// md matches the 44px input height so the two line up when set side by side,
// and clears the 44px touch target on small screens.
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-caption rounded-sm gap-1.5",
  md: "h-11 px-4 text-callout rounded-md gap-2",
  lg: "h-12 px-6 text-callout rounded-md gap-2",
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
      // Feedback on press is a small opacity shift, not a bounce: the control
      // should acknowledge the click without moving under the finger.
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,color,opacity] duration-150 [transition-timing-function:var(--ease-out-soft)]",
        "active:opacity-80 disabled:pointer-events-none disabled:opacity-40",
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
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
        "text-secondary transition-colors duration-150 [transition-timing-function:var(--ease-out-soft)]",
        "hover:bg-surface-secondary hover:text-primary active:opacity-80",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
