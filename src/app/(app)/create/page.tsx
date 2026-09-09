"use client";

import { UploadCloud } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { MAX_PAGES } from "@/lib/types";

export default function CreatePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display">New Reviewer</h1>
        <p className="text-callout text-secondary">
          Upload a PDF or PowerPoint — up to {MAX_PAGES} pages.
        </p>
      </div>

      {/* M2 replaces this with the dropzone + upload progress + parsing state. */}
      <EmptyState
        icon={<UploadCloud className="size-6" />}
        title="Upload coming next"
        description="The shell is ready. File upload, page-count validation, and text extraction land in the next milestone."
      />
    </div>
  );
}
