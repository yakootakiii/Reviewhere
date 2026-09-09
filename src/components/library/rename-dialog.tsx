"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";

/** §2.6 rename, for both documents and quizzes. */
export function RenameDialog({
  open,
  onClose,
  onSave,
  label,
  initialValue,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  label: string;
  initialValue: string;
  busy?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rename"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(trimmed)} loading={busy} disabled={!trimmed}>
            Save
          </Button>
        </>
      }
    >
      <Input
        label={label}
        data-autofocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && trimmed) onSave(trimmed);
        }}
      />
    </Sheet>
  );
}
