"use client";

import { UploadFlow } from "@/components/upload/upload-flow";
import { MAX_PAGES } from "@/lib/types";

export default function CreatePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-display">New reviewer</h1>
        <p className="text-callout text-secondary">
          Upload a PDF or PowerPoint — up to {MAX_PAGES} pages.
        </p>
      </header>
      <div className="mt-10">
        <UploadFlow />
      </div>
    </div>
  );
}
