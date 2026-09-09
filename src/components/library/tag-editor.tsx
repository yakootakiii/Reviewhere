"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cleanTag } from "@/lib/library";
import { cn } from "@/lib/utils";

/** §2.6 subject tagging. Free-form, with suggestions from tags already in use. */
export function TagEditor({
  open,
  onClose,
  onSave,
  title,
  initialTags,
  suggestions,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
  title: string;
  initialTags: string[];
  suggestions: string[];
  busy?: boolean;
}) {
  // Keyed by the sheet's open state upstream, so this starts fresh each time.
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");

  function add(value: string) {
    const tag = cleanTag(value);
    if (!tag) return;
    // Case-insensitive: "Biology" and "biology" are the same subject.
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTags((current) => [...current, tag]);
    }
    setDraft("");
  }

  const unused = suggestions.filter(
    (suggestion) => !tags.some((tag) => tag.toLowerCase() === suggestion.toLowerCase()),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tags"
      description={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(tags)} loading={busy}>
            Save tags
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-caption text-[var(--color-accent)]">
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                    className="inline-flex size-5 items-center justify-center rounded-full hover:bg-[var(--color-accent)]/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tag-input" className="text-caption font-medium text-secondary">
            Add a tag
          </label>
          <div className="flex gap-2">
            <input
              id="tag-input"
              data-autofocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(draft);
                }
              }}
              placeholder="Biology, Finals Week…"
              className={cn(
                "h-11 flex-1 rounded-md bg-surface px-3.5 text-callout text-primary",
                "border border-[var(--color-border-strong)] placeholder:text-tertiary outline-none",
                "focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
              )}
            />
            <Button variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
        </div>

        {unused.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-caption text-secondary">Already in use</span>
            <ul className="flex flex-wrap gap-2">
              {unused.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => add(suggestion)}
                    className="rounded-full bg-surface-secondary px-2.5 py-1 text-caption text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
                  >
                    + {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
