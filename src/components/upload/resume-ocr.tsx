"use client";

import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OcrFlow } from "./ocr-flow";
import { TranscriptionReview } from "./transcription-review";

/**
 * Picking a scanned document back up later.
 *
 * The server keeps no copy of the original file, so reading it again needs the
 * same PDF from the person who has it. That is the honest cost of the
 * no-Storage decision, and the copy says so rather than leaving a document
 * stuck at "processing" with no way forward.
 */
export function ResumeOcr({
  documentId,
  fileName,
  pageCount,
  onDone,
}: {
  documentId: string;
  fileName: string;
  pageCount: number;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (reviewing) {
    return <TranscriptionReview documentId={documentId} onContinue={onDone} />;
  }

  if (file) {
    return (
      <OcrFlow
        documentId={documentId}
        file={file}
        pageCount={pageCount}
        onDone={() => setReviewing(true)}
      />
    );
  }

  return (
    <div className="flex flex-col items-start gap-4 border-l-2 border-[var(--color-accent)] py-1 pl-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2.5 text-title2">
          <ScanLine aria-hidden strokeWidth={1.75} className="size-5 text-tertiary" />
          This document is still waiting to be read
        </h2>
        <p className="max-w-[56ch] text-callout text-secondary">
          It&rsquo;s a scan, so its handwriting needs reading before questions can be written from
          it. We don&rsquo;t keep a copy of your file, so choose{" "}
          <span className="font-medium">{fileName}</span> again to carry on.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) setFile(chosen);
        }}
      />
      <Button onClick={() => inputRef.current?.click()}>Choose the file</Button>
    </div>
  );
}
