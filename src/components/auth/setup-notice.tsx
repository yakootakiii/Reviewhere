import { KeyRound } from "lucide-react";

/**
 * Shown when .env.local has no Firebase credentials yet, so the shell stays
 * browsable during setup instead of throwing on the first auth call.
 */
export function SetupNotice() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-20 text-center">
      <div
        aria-hidden
        className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
      >
        <KeyRound className="size-6" />
      </div>
      <h2 className="text-title1">Firebase isn&apos;t connected yet</h2>
      <p className="text-callout text-secondary">
        Copy <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-caption">.env.local.example</code> to{" "}
        <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-caption">.env.local</code>, fill in your
        Firebase project credentials, and restart the dev server.
      </p>
    </div>
  );
}
