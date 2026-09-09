"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/feedback";

/**
 * Route-segment boundary for every signed-in screen. Without it a render error
 * leaves a blank page with no way out; §7.7 asks for a plain-language error
 * state with a retry, and this is the last one that was missing.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log line.
    console.error("Screen failed to render", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorPanel
        title="This screen ran into a problem"
        description="Nothing you've saved is affected — your documents, quizzes and scores are all still there."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/library">
              <Button variant="secondary">Back to library</Button>
            </Link>
            <Button onClick={reset}>Try again</Button>
          </div>
        }
      />
    </div>
  );
}
