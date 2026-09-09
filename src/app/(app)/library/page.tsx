"use client";

import { DocumentGrid } from "@/components/library/document-grid";

export default function LibraryPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display">Library</h1>
        <p className="text-callout text-secondary">
          Every document you&apos;ve uploaded and the quizzes generated from it.
        </p>
      </div>
      <DocumentGrid />
    </div>
  );
}
