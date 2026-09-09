import { cn } from "@/lib/utils";

/** §7.4: friendly illustration + short copy + one primary CTA. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="flex size-14 items-center justify-center rounded-2xl bg-surface-secondary text-secondary"
      >
        {icon}
      </div>
      <h3 className="text-title2">{title}</h3>
      <p className="max-w-sm text-callout text-secondary">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** §6: anything slower than 300ms gets a skeleton, not a spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-surface-secondary", className)}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl bg-surface hairline p-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/3" />
    </div>
  );
}

/** Full-panel error with a plain-language reason and a retry action (§7.4). */
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
      className="flex flex-col items-center gap-3 rounded-xl bg-[var(--color-error-soft)] px-6 py-10 text-center"
    >
      <h3 className="text-title2">{title}</h3>
      <p className="max-w-md text-callout text-secondary">{description}</p>
      {action}
    </div>
  );
}
