"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ThemePicker } from "@/components/settings/theme-picker";
import { Sheet } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { useTheme } from "@/components/theme-provider";
import {
  deleteAccount,
  friendlyAuthError,
  providerLabel,
  resendVerification,
  signOut,
} from "@/lib/firebase/auth";
import { updateDisplayName, updatePreferences } from "@/lib/firebase/users";
import type { ThemePreference } from "@/lib/themes";
import { DEFAULT_PREFERENCES, type FeedbackMode } from "@/lib/types";
import { initialsFrom } from "@/lib/utils";

const FEEDBACK_OPTIONS = [
  { value: "immediate" as const, label: "After each question" },
  { value: "end" as const, label: "At the end" },
];

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { preference, resolved, setPreference } = useTheme();
  const { toast } = useToast();
  const router = useRouter();

  const preferences = profile?.preferences ?? DEFAULT_PREFERENCES;
  const savedName = (profile?.displayName ?? user?.displayName ?? "").trim();
  // `draft` is null until the field is edited, so the saved name flows straight
  // through without an effect syncing prop into state.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? savedName;
  const [savingName, setSavingName] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const nameChanged = name.trim() !== savedName;

  async function onSaveName() {
    if (!user || !name.trim()) return;
    setSavingName(true);
    try {
      await updateDisplayName(user.uid, name.trim());
      await refreshProfile();
      setDraft(null);
      toast("Name updated.", "success");
    } catch {
      toast("Couldn't save your name. Please try again.", "error");
    } finally {
      setSavingName(false);
    }
  }

  /** Theme writes to localStorage immediately, then syncs to the profile. */
  async function onThemeChange(next: ThemePreference) {
    setPreference(next);
    if (!user) return;
    updatePreferences(user.uid, { theme: next }).catch(() => {
      /* Local preference already applied; a failed sync isn't worth a toast. */
    });
  }

  async function onPreferenceChange(patch: Parameters<typeof updatePreferences>[1]) {
    if (!user) return;
    try {
      await updatePreferences(user.uid, patch);
      await refreshProfile();
    } catch {
      toast("Couldn't save that preference.", "error");
    }
  }

  async function onDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    try {
      const { requiresRecentLogin } = await deleteAccount(user);
      if (requiresRecentLogin) {
        setConfirmOpen(false);
        toast("For your security, sign in again before deleting your account.", "info");
        await signOut();
        router.push("/sign-in");
        return;
      }
      router.push("/");
    } catch (caught) {
      toast(friendlyAuthError(caught), "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display">Settings</h1>
        <p className="text-callout text-secondary">Your account and study preferences.</p>
      </header>

      <Section title="Account">
        <div className="flex items-center gap-4 pb-1">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-callout font-semibold text-secondary">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt=""
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initialsFrom(name, user.email)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-callout font-medium">{name || "Your account"}</p>
            <p className="truncate text-caption text-tertiary">{user.email}</p>
          </div>
        </div>

        <Row label="Display name" description="How your name appears on this device.">
          <div className="flex w-full items-center gap-2 sm:w-56">
            <Input
              label="Display name"
              hideLabel
              value={name}
              onChange={(event) => setDraft(event.target.value)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              onClick={onSaveName}
              loading={savingName}
              disabled={!nameChanged}
            >
              Save
            </Button>
          </div>
        </Row>

        <Row label="Sign-in method" description="Managed by your provider.">
          <span className="text-callout text-secondary">
            {user.providerData.map((provider) => providerLabel(provider.providerId)).join(", ")}
          </span>
        </Row>

        {!user.emailVerified && user.providerData.some((p) => p.providerId === "password") && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-[var(--color-warning)] py-1 pl-4">
            <p className="text-caption text-secondary">Your email address isn&apos;t verified yet.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await resendVerification(user);
                  toast("Verification email sent.", "success");
                } catch (caught) {
                  toast(friendlyAuthError(caught), "error");
                }
              }}
            >
              Resend email
            </Button>
          </div>
        )}
      </Section>

      <Section title="Appearance" id="preferences">
        <Row label="Theme" description="Applies on this device.">
          <ThemePicker preference={preference} active={resolved} onChange={onThemeChange} />
        </Row>
      </Section>

      <Section title="Quizzes">
        <Row label="Show answers" description="When feedback appears during a quiz.">
          <SegmentedControl
            label="Show answers"
            options={FEEDBACK_OPTIONS}
            value={preferences.feedbackMode}
            onChange={(value: FeedbackMode) => onPreferenceChange({ feedbackMode: value })}
          />
        </Row>

        <Row label="Show a timer" description="Track how long each quiz takes.">
          <Toggle
            label="Show a timer"
            hideLabel
            checked={preferences.timerEnabled}
            onCheckedChange={(checked) => onPreferenceChange({ timerEnabled: checked })}
          />
        </Row>
      </Section>

      <section className="mt-14 flex flex-col items-start gap-2 border-t border-[var(--color-border)] pt-8">
        <h2 className="text-title2">Delete account</h2>
        <p className="max-w-[52ch] text-callout text-secondary">
          Permanently removes your account, documents, and every quiz you&apos;ve generated. This
          can&apos;t be undone.
        </p>
        <Button
          variant="secondary"
          className="mt-3 text-[var(--color-error)]"
          onClick={() => setConfirmOpen(true)}
        >
          Delete account
        </Button>
      </section>

      {/* §2.7: destructive action gated behind a typed confirmation. */}
      <Sheet
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmText("");
        }}
        title="Delete your account?"
        description="This permanently deletes your documents, quizzes, and attempt history."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              disabled={confirmText.trim().toLowerCase() !== "delete"}
              onClick={onDeleteAccount}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <Input
          data-autofocus
          label='Type "delete" to confirm'
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="delete"
          autoComplete="off"
        />
      </Sheet>
    </div>
  );
}

/** A titled group. The rule and the label do what a card used to. */
function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 flex flex-col">
      <h2 className="text-caption tracking-[0.06em] text-tertiary uppercase">{title}</h2>
      <div className="mt-4 flex flex-col divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: what it is on the left, the control on the right. Every row in
 * the page shares this shape, which is most of what "polished" means here —
 * the controls line up because they are laid out by the same component.
 */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-callout">{label}</span>
        {description && <span className="text-caption text-tertiary">{description}</span>}
      </div>
      <div className="flex shrink-0 items-center sm:justify-end">{children}</div>
    </div>
  );
}
