"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Set as an ordered walkthrough rather than a grid of feature cards: these are
 * four steps of one flow, and numbering them says more than four icon tiles do.
 */
const STEPS = [
  {
    title: "Upload your material",
    body: "A PDF or PowerPoint, up to 150 pages. The text is pulled out on the server — nothing to prepare first.",
  },
  {
    title: "Get a real quiz",
    body: "Multiple choice interleaved with written identification questions, the way an actual exam is set.",
  },
  {
    title: "Answer, then understand",
    body: "Every question carries a short explanation and the page it came from, so a wrong answer teaches something.",
  },
  {
    title: "See what stuck",
    body: "Scores and timing per sitting, and a one-tap retake of only the questions you missed.",
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const primaryHref = user ? "/dashboard" : "/sign-up";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page flex max-w-5xl items-center justify-between py-5">
        <span className="text-callout font-semibold tracking-[-0.01em]">
          Reviewhere<span className="text-[var(--color-accent)]">.</span>
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
        {/* Left-aligned rather than centred: a measure this long is easier to
            read ranged left, and it lines up with everything below it. */}
        <section className="page max-w-5xl pt-20 pb-24 sm:pt-32 sm:pb-32">
          <h1 className="max-w-[15ch] text-[40px] leading-[1.06] font-semibold tracking-[-0.03em] text-balance sm:text-[52px]">
            Turn your notes into a quiz you can actually sit.
          </h1>
          <p className="mt-6 max-w-[52ch] text-body text-secondary">
            Upload a PDF or a slide deck. Reviewhere reads it and writes a mixed reviewer —
            multiple choice and written answers, scored, explained, and linked back to the page it
            came from.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={primaryHref}>
              <Button size="lg">{user ? "Open dashboard" : "Upload a document"}</Button>
            </Link>
            <span className="text-caption text-tertiary">
              Free, and built for a handful of students.
            </span>
          </div>
        </section>

        <section aria-labelledby="how" className="page max-w-5xl pb-28">
          <h2 id="how" className="text-caption tracking-[0.06em] text-tertiary uppercase">
            How it works
          </h2>
          {/* Rules, not boxes: the divider does the grouping a card would. */}
          <ol className="mt-8 grid gap-x-16 gap-y-10 sm:grid-cols-2">
            {STEPS.map(({ title, body }, index) => (
              <li key={title} className="border-t border-[var(--color-border)] pt-5">
                <span className="text-caption text-tertiary tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-title2">{title}</h3>
                <p className="mt-2 max-w-[46ch] text-callout text-secondary">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="page flex max-w-5xl items-center justify-between py-8 text-caption text-tertiary">
          <span>Reviewhere</span>
          <span>Built for studying. Free for everyone using it.</span>
        </div>
      </footer>
    </div>
  );
}
