"use client";

import { useState, type ReactNode } from "react";
import { Icon, cx } from "@/components/ui";
import { openFile } from "@/lib/api";

/** Opens an auth-protected file; a failed fetch shows its reason next to the button instead of an unhandled rejection. */
export function FileButton({
  id,
  icon = "picture_as_pdf",
  label,
  className,
  children,
}: {
  id: string;
  icon?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function open() {
    setBusy(true);
    setErr("");
    try {
      await openFile(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        aria-label={label}
        className={cx(
          "inline-flex min-h-7 cursor-pointer whitespace-nowrap items-center gap-1 rounded-xs bg-surface-high px-2 py-1 text-caption font-semibold text-primary hover:bg-surface-highest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
          className,
        )}
      >
        <Icon name={busy ? "progress_activity" : icon} className={busy ? "animate-spin" : undefined} />
        {children}
      </button>
      {err && (
        <span role="alert" className="text-caption text-error">
          {err}
        </span>
      )}
    </span>
  );
}
