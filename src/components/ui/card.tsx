import { cn } from "@/lib/utils";

/**
 * A hairline-bounded surface. Deliberately plain: no shadow, no lift on hover,
 * modest radius. Reach for a card only when it groups things that belong
 * together — a list of rows is better served by dividers than by boxes.
 */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface hairline p-5",
        interactive &&
          "transition-colors duration-150 [transition-timing-function:var(--ease-out-soft)] hover:border-[var(--color-border-strong)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-title2", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-callout text-secondary", className)} {...props} />;
}
