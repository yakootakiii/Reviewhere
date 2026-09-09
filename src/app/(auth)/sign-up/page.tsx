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
import { friendlyAuthError, signUpWithEmail } from "@/lib/firebase/auth";

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  if (!configured) return <SetupNotice />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Passwords need to be at least 6 characters.");
      return;
    }

    setPending(true);
    try {
      await signUpWithEmail(name, email, password);
      toast("Account created — check your inbox to verify your email.", "success");
      router.replace("/dashboard");
    } catch (caught) {
      setError(friendlyAuthError(caught));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-display">Create your account</h1>
        <p className="text-callout text-secondary">
          Turn your slides and readings into a reviewer in under a minute.
        </p>
      </div>

      <OAuthButtons onError={setError} onSuccess={() => router.replace("/dashboard")} />

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-caption text-tertiary">or</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="At least 6 characters."
          error={error ?? undefined}
          required
        />
        <Button type="submit" loading={pending} fullWidth size="lg">
          Create account
        </Button>
      </form>

      <p className="text-center text-caption text-secondary">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-[var(--color-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
