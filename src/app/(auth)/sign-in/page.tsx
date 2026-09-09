"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SetupNotice } from "@/components/auth/setup-notice";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toast";
import { friendlyAuthError, requestPasswordReset, signInWithEmail } from "@/lib/firebase/auth";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in (or just signed in via popup) — go straight through.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  if (!configured) return <SetupNotice />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signInWithEmail(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(friendlyAuthError(caught));
      setPending(false);
    }
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email address first, then tap Forgot password.");
      return;
    }
    try {
      await requestPasswordReset(email);
      toast("Password reset email sent. Check your inbox.", "success");
    } catch (caught) {
      setError(friendlyAuthError(caught));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-display">Welcome back</h1>
        <p className="text-callout text-secondary">Sign in to pick up where you left off.</p>
      </div>

      <OAuthButtons onError={setError} onSuccess={() => router.replace("/dashboard")} />

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-caption text-tertiary">or</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@school.edu"
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error ?? undefined}
          required
        />
        <Button type="submit" loading={pending} fullWidth size="lg">
          Sign in
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2 text-caption">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-[var(--color-accent)] hover:underline"
        >
          Forgot password?
        </button>
        <p className="text-secondary">
          New here?{" "}
          <Link href="/sign-up" className="text-[var(--color-accent)] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
