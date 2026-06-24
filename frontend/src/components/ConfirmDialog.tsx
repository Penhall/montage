"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "./IconComponents";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const confirmColor =
    variant === "danger"
      ? "bg-[var(--accent-red)] border-[var(--accent-red)] text-black hover:bg-transparent hover:text-[var(--accent-red)]"
      : "bg-[var(--accent)] border-[var(--accent)] text-black hover:bg-transparent hover:text-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={dialogRef}
        className="w-full max-w-md border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
          <button onClick={onCancel} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <XIcon size={16} />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{message}</p>
        {children}
        <div className="flex items-center gap-3 justify-end mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
