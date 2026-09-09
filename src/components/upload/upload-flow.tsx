"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileText, Presentation, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { GenerateFlow } from "@/components/quiz/generate-flow";
import { Dropzone } from "./dropzone";
import { uploadDocument, type IngestResult } from "@/lib/firebase/documents";
import { formatBytes } from "@/lib/documents-shared";
import { cn } from "@/lib/utils";

type Stage =
  | { name: "idle" }
  | { name: "uploading"; file: File; progress: number }
  | { name: "analyzing"; file: File }
  | { name: "done"; result: IngestResult }
  | { name: "error"; message: string; file: File };

export function UploadFlow() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const abortRef = useRef<(() => void) | null>(null);

  const start = useCallback(
    async (file: File) => {
      if (!user) return;
      setStage({ name: "uploading", file, progress: 0 });

      const { promise, abort } = uploadDocument(user, file, (fraction) => {
        setStage((current) =>
          current.name === "uploading" ? { ...current, progress: fraction } : current,
        );
        // Once bytes are delivered the server is parsing, which is the slow part.
        if (fraction >= 1) setStage({ name: "analyzing", file });
      });
      abortRef.current = abort;

      try {
        const result = await promise;
        setStage({ name: "done", result });
        toast(`${result.fileName} is ready — ${result.pageCount} pages.`, "success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStage({ name: "idle" });
          return;
        }
        const message =
          error instanceof Error ? error.message : "Upload failed. Please try again.";
        setStage({ name: "error", message, file });
      } finally {
        abortRef.current = null;
      }
    },
    [user, toast],
  );

  if (stage.name === "idle") {
    return <Dropzone onFile={start} />;
  }

  if (stage.name === "error") {
    return (
      <ErrorPanel
        title="We couldn't read that file"
        description={stage.message}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStage({ name: "idle" })}>
              Choose another file
            </Button>
            <Button onClick={() => start(stage.file)}>Try again</Button>
          </div>
        }
      />
    );
  }

  if (stage.name === "done") {
    const { result } = stage;
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-surface hairline p-8 text-center shadow-[var(--shadow-soft)]">
        <div
          aria-hidden
          className="flex size-12 items-center justify-center rounded-2xl bg-[var(--color-success-soft)] text-[var(--color-success)]"
        >
          <CheckCircle2 className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-title2">{result.fileName}</h2>
          <p className="text-callout text-secondary">
            {result.pageCount} {result.fileType === "pptx" ? "slides" : "pages"} read and ready.
          </p>
          {result.emptyPages.length > 0 && (
            <p className="text-caption text-tertiary">
              {result.emptyPages.length} page{result.emptyPages.length === 1 ? "" : "s"} had no
              readable text and will be skipped.
            </p>
          )}
        </div>
        {/* §5: parsing done → straight into the generation settings sheet. */}
        <GenerateFlow
          document={{
            id: result.documentId,
            fileName: result.fileName,
            pageCount: result.pageCount,
            fileType: result.fileType,
          }}
          autoStart
        />
        <Button variant="ghost" size="sm" onClick={() => setStage({ name: "idle" })}>
          Upload another
        </Button>
      </div>
    );
  }

  // Uploading or analyzing.
  const { file } = stage;
  const uploading = stage.name === "uploading";
  const percent = uploading ? Math.round(stage.progress * 100) : 100;
  const Icon = file.name.toLowerCase().endsWith(".pptx") ? Presentation : FileText;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface hairline p-6 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-[var(--color-accent)]"
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-callout font-medium">{file.name}</p>
          <p className="text-caption text-secondary">{formatBytes(file.size)}</p>
        </div>
        {uploading && (
          <IconButton label="Cancel upload" onClick={() => abortRef.current?.()}>
            <X aria-hidden className="size-[18px]" />
          </IconButton>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uploading ? percent : undefined}
        aria-label={uploading ? "Upload progress" : "Analyzing document"}
        className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"
      >
        <div
          className={cn(
            "h-full rounded-full bg-accent-gradient transition-[width] duration-300",
            // Page count is unknown until parsing finishes, so show motion
            // rather than a fake percentage (§7.7: keep loading copy honest).
            !uploading && "w-full animate-pulse",
          )}
          style={uploading ? { width: `${percent}%` } : undefined}
        />
      </div>

      <p className="text-caption text-secondary">
        {uploading ? `Uploading… ${percent}%` : "Analyzing your document…"}
      </p>
    </div>
  );
}
