"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { DEFAULT_PREFERENCES, type FeedbackMode, type ThemePreference } from "@/lib/types";
import { initialsFrom } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: <Sun aria-hidden className="size-3.5" /> },
  { value: "dark" as const, label: "Dark", icon: <Moon aria-hidden className="size-3.5" /> },
  { value: "system" as const, label: "System", icon: <Monitor aria-hidden className="size-3.5" /> },
];

const FEEDBACK_OPTIONS = [
  { value: "immediate" as const, label: "After each question" },
  { value: "end" as const, label: "At the end" },
];

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { preference, setPreference } = useTheme();
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display">Settings</h1>
        <p className="text-callout text-secondary">Your account and study preferences.</p>
      </div>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-body font-semibold text-secondary">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              initialsFrom(name, user.email)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{name || "Your account"}</CardTitle>
            <CardDescription className="truncate">{user.email}</CardDescription>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <Input
            label="Display name"
            value={name}
            onChange={(event) => setDraft(event.target.value)}
            className="flex-1"
          />
          <Button variant="secondary" onClick={onSaveName} loading={savingName} disabled={!nameChanged}>
            Save
          </Button>
        </div>

        {!user.emailVerified && user.providerData.some((p) => p.providerId === "password") && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--color-warning-soft)] px-4 py-3">
            <p className="text-caption text-primary">Your email address isn&apos;t verified yet.</p>
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

        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-secondary">Linked sign-in methods</span>
          <div className="flex flex-wrap gap-2">
            {user.providerData.map((provider) => (
              <span
                key={provider.providerId}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1 text-caption text-secondary"
              >
                <ShieldCheck aria-hidden className="size-3.5" />
                {providerLabel(provider.providerId)}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card id="preferences" className="flex flex-col gap-5 p-6">
        <CardTitle>Preferences</CardTitle>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-callout text-primary">Appearance</span>
            <span className="text-caption text-secondary">System follows your device setting.</span>
          </div>
          <SegmentedControl
            label="Appearance"
            options={THEME_OPTIONS}
            value={preference}
            onChange={onThemeChange}
          />
        </div>

        <div className="h-px bg-[var(--color-border)]" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-callout text-primary">Show answers</span>
            <span className="text-caption text-secondary">When feedback appears during a quiz.</span>
          </div>
          <SegmentedControl
            label="Show answers"
            options={FEEDBACK_OPTIONS}
            value={preferences.feedbackMode}
            onChange={(value: FeedbackMode) => onPreferenceChange({ feedbackMode: value })}
          />
        </div>

        <div className="h-px bg-[var(--color-border)]" />

        <Toggle
          label="Show a timer"
          description="Track how long each quiz takes."
          checked={preferences.timerEnabled}
          onCheckedChange={(checked) => onPreferenceChange({ timerEnabled: checked })}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently removes your account, documents, and every quiz you&apos;ve generated. This
          can&apos;t be undone.
        </CardDescription>
        <div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete account
          </Button>
        </div>
      </Card>

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
