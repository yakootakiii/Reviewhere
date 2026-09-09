"use client";

import { useRef, useState } from "react";
import { FileText, Presentation, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/documents-shared";
import { fileTypeFor } from "@/lib/extraction";
import { MAX_PAGES } from "@/lib/types";

/**
 * §2.1 drag-and-drop plus "Browse files". Checks here are UX only — the ingest
 * route re-validates everything, including the page count it derives itself.
 */
export function Dropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!fileTypeFor(file.name, file.type)) {
      setError("Reviewhere reads PDF and PowerPoint (.pptx) files. Try one of those.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${formatBytes(file.size)}. Files need to be under ${formatBytes(MAX_FILE_BYTES)}.`,
      );
      return;
    }
    onFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) accept(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center",
          "transition-colors duration-200",
          dragging
            ? "border-[var(--color-accent)] bg-accent-soft"
            : "border-[var(--color-border-strong)] bg-surface",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <div
          aria-hidden
          className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-secondary"
        >
          <UploadCloud className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium">Drag your document here</p>
          <p className="text-caption text-secondary">
            PDF or PowerPoint, up to {MAX_PAGES} pages and {formatBytes(MAX_FILE_BYTES)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn(
            "mt-1 inline-flex h-10 items-center rounded-md bg-surface-secondary px-4",
            "text-callout font-medium text-primary transition-all duration-200",
            "hover:bg-surface-hover active:scale-[0.97]",
          )}
        >
          Browse files
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="sr-only"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // Allow re-picking the same file after an error.
            event.target.value = "";
          }}
        />

        <div className="mt-2 flex items-center gap-4 text-caption text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <FileText aria-hidden className="size-3.5" /> PDF
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Presentation aria-hidden className="size-3.5" /> PPTX
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-caption text-[var(--color-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
