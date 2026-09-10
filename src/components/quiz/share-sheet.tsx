"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/auth-provider";
import { getShareRecipients, shareQuiz, unshareQuiz } from "@/lib/firebase/quizzes";
import { MAX_SHARE_RECIPIENTS, type ShareRecipient } from "@/lib/quiz-shared";

/**
 * Sharing is per-person, by email. The list is a plain divided list rather than
 * a card each, and the recipient's address is only ever shown to the owner —
 * the server resolves uids so recipients never see one another.
 */
export function ShareSheet({
  open,
  onClose,
  quizId,
  quizTitle,
}: {
  open: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
}) {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<ShareRecipient[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;

    getShareRecipients(user, quizId)
      .then((list) => {
        if (active) setRecipients(list);
      })
      .catch(() => {
        if (active) {
          setRecipients([]);
          setError("Couldn't load who this is shared with.");
        }
      });

    return () => {
      active = false;
    };
  }, [open, user, quizId]);

  async function add() {
    if (!user || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const recipient = await shareQuiz(user, quizId, email.trim());
      setRecipients((current) => [...(current ?? []), recipient]);
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't share that quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(recipient: ShareRecipient) {
    if (!user) return;
    setError(null);
    // Optimistic: the list is short and the failure path puts it straight back.
    setRecipients((current) => (current ?? []).filter((r) => r.uid !== recipient.uid));
    try {
      await unshareQuiz(user, quizId, recipient.uid);
    } catch (caught) {
      setRecipients((current) => [...(current ?? []), recipient]);
      setError(caught instanceof Error ? caught.message : "Couldn't stop sharing.");
    }
  }

  const atCap = (recipients?.length ?? 0) >= MAX_SHARE_RECIPIENTS;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share this quiz"
      description={quizTitle}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <Input
              label="Email address"
              type="email"
              data-autofocus
              value={email}
              disabled={atCap}
              hint={
                atCap
                  ? `A quiz can be shared with up to ${MAX_SHARE_RECIPIENTS} people.`
                  : "They'll need a Reviewhere account with this address."
              }
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void add();
                }
              }}
              className="flex-1"
            />
            <Button onClick={add} loading={busy} disabled={!email.trim() || atCap}>
              Share
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-caption text-[var(--color-error)]">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-caption tracking-[0.06em] text-tertiary uppercase">
            Shared with
          </h3>

          {recipients === null ? (
            <Skeleton className="h-10 w-full" />
          ) : recipients.length === 0 ? (
            <p className="text-callout text-secondary">
              Not shared with anyone yet. They&apos;ll be able to take it and keep their own
              scores — they can&apos;t rename, delete, or see your results.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {recipients.map((recipient) => (
                <li key={recipient.uid} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-callout">
                      {recipient.displayName ?? recipient.email ?? "Someone"}
                    </p>
                    {recipient.displayName && recipient.email && (
                      <p className="truncate text-caption text-tertiary">{recipient.email}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Stop sharing with ${recipient.email ?? recipient.displayName ?? "this person"}`}
                    onClick={() => remove(recipient)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-surface-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
