"use client";

import { useState } from "react";
import { signInWithApple, signInWithGoogle } from "@/lib/firebase/auth";

/** Provider marks are inline SVG so no external asset host is needed. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.54 14.16a6.9 6.9 0 0 1 0-4.41V6.77H1.7a11.5 11.5 0 0 0 0 10.37l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.98c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.52 15.11.5 12 .5A11.5 11.5 0 0 0 1.7 6.77l3.84 2.98C6.45 7.02 9 4.98 12 4.98Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.05-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.81 3.15-.46 7.8 1.3 10.35.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.12M14.5 4.7c.71-.87 1.2-2.07 1.06-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.33-.58 3.05-1.45" />
    </svg>
  );
}

export function OAuthButtons({
  onError,
  onSuccess,
}: {
  onError: (message: string) => void;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState<"google" | "apple" | null>(null);

  async function run(provider: "google" | "apple", signIn: () => Promise<unknown>) {
    setPending(provider);
    try {
      await signIn();
      onSuccess();
    } catch (error) {
      const { friendlyAuthError } = await import("@/lib/firebase/auth");
      onError(friendlyAuthError(error));
    } finally {
      setPending(null);
    }
  }

  const base =
    "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md text-callout font-medium " +
    "transition-all duration-200 [transition-timing-function:var(--ease-out-soft)] " +
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => run("google", signInWithGoogle)}
        className={`${base} bg-surface text-primary border border-[var(--color-border-strong)] hover:bg-surface-secondary`}
      >
        <GoogleMark />
        {pending === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => run("apple", signInWithApple)}
        className={`${base} bg-[#000] text-white hover:bg-[#1a1a1a] dark:bg-white dark:text-black dark:hover:bg-[#e8e8e8]`}
      >
        <AppleMark />
        {pending === "apple" ? "Opening Apple…" : "Continue with Apple"}
      </button>
    </div>
  );
}
