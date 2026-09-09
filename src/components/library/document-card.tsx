"use client";

import { FileText, Presentation } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { StudyDocument } from "@/lib/types";

function formatDate(document: StudyDocument): string {
  const date = document.createdAt?.toDate?.();
  if (!date) return "Just now";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentCard({ document }: { document: StudyDocument }) {
  const Icon = document.fileType === "pptx" ? Presentation : FileText;
  const unit = document.fileType === "pptx" ? "slides" : "pages";

  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-[var(--color-accent)]"
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-callout font-medium" title={document.fileName}>
            {document.fileName}
          </h3>
          <p className="text-caption text-secondary">
            {document.pageCount} {unit} · {formatDate(document)}
          </p>
        </div>
      </div>

      {/* Quiz generation lands in M3; until then a document is a parsed source. */}
      <p className="text-caption text-tertiary">No quizzes yet</p>
    </Card>
  );
}
