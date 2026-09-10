import { cn } from "@/lib/utils";

/**
 * Short copy and one action. The `icon` prop is accepted and ignored — an empty
 * state is a sentence, and a decorative glyph above it only adds noise.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 py-16", className)}>
      <h3 className="text-title2">{title}</h3>
      <p className="max-w-[48ch] text-callout text-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** §6: anything slower than 300ms gets a skeleton, not a spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-secondary", className)} />
  );
}

/** Mirrors the widget tile's proportions so nothing jumps when content lands. */
export function CardSkeleton() {
  return (
    <div className="flex aspect-square flex-col rounded-2xl bg-surface-secondary p-4">
      <Skeleton className="h-3 w-10 opacity-60" />
      <div className="mt-auto flex flex-col gap-3">
        <Skeleton className="h-7 w-16 opacity-60" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-4/5 opacity-60" />
          <Skeleton className="h-3 w-1/2 opacity-60" />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-panel error (§7.4). A hairline and a red rule carry the alarm — a filled
 * red panel shouts at the user for something that is usually just a retry.
 */
export function ErrorPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 border-l-2 border-[var(--color-error)] py-1 pl-5"
    >
      <h3 className="text-title2">{title}</h3>
      <p className="max-w-[52ch] text-callout text-secondary">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
