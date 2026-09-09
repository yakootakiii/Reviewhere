"use client";

import Link from "next/link";
import { FileText, ListChecks, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

const FEATURES = [
  {
    icon: FileText,
    title: "PDF or slides in",
    body: "Drop in up to 150 pages of lecture slides or readings. We pull out the text, diagrams and all.",
  },
  {
    icon: Sparkles,
    title: "A real quiz out",
    body: "Multiple choice interleaved with identification questions, so it feels like the actual exam.",
  },
  {
    icon: ListChecks,
    title: "Every answer explained",
    body: "Each question links back to the page it came from, with a short explanation once you answer.",
  },
  {
    icon: Timer,
    title: "Track what sticks",
    body: "Scores, time taken, and a breakdown by type — plus a one-tap retake of just what you missed.",
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const primaryHref = user ? "/dashboard" : "/sign-up";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-title2 tracking-tight">
          Review<span className="text-accent-gradient">here</span>
        </span>
        <nav className="flex items-center gap-2" aria-label="Account">
          {!loading &&
            (user ? (
              <Link href="/dashboard">
                <Button size="sm">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 pt-16 pb-20 text-center sm:pt-24">
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-caption text-secondary">
            Active recall, not re-reading
          </span>
          <h1 className="text-[44px] leading-[1.05] font-bold tracking-[-0.025em] sm:text-[60px]">
            Your notes,
            <br />
            <span className="text-accent-gradient">turned into a quiz.</span>
          </h1>
          <p className="max-w-xl text-body text-secondary">
            Upload a PDF or PowerPoint and get a polished, ready-to-take reviewer — multiple choice
            and identification, scored and explained.
          </p>
          <Link href={primaryHref}>
            <Button size="lg">{user ? "Open dashboard" : "Upload your first document"}</Button>
          </Link>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl bg-surface hairline p-6 shadow-[var(--shadow-soft)]">
              <div
                aria-hidden
                className="mb-4 flex size-10 items-center justify-center rounded-[10px] bg-accent-soft text-[var(--color-accent)]"
              >
                <Icon className="size-5" />
              </div>
              <h2 className="text-title2 mb-1.5">{title}</h2>
              <p className="text-callout text-secondary">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] px-6 py-6 text-center text-caption text-tertiary">
        Reviewhere — built for studying, free for everyone using it.
      </footer>
    </div>
  );
}
