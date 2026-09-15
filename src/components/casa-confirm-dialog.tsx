"use client";

import {
  useEffect,
} from "react";

export interface CasaConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CasaConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: CasaConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const priorOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const onKeyDown =
      (event: KeyboardEvent) => {
        if (
          event.key === "Escape" &&
          !busy
        ) {
          onCancel();
        }
      };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
      document.body.style.overflow =
        priorOverflow;
    };
  }, [
    busy,
    onCancel,
    open,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !busy
        ) {
          onCancel();
        }
      }}
    >
      <section
        aria-describedby="casa-confirm-message"
        aria-labelledby="casa-confirm-title"
        aria-modal="true"
        className="w-full max-w-lg border border-black bg-[#f7f7f3] shadow-2xl"
        role="dialog"
      >
        <div className="border-b border-black px-5 py-4 sm:px-6">
          <p className="casa-kicker text-black/45">
            Confirmation required
          </p>
          <h2
            className="mt-2 text-2xl font-semibold tracking-[-0.045em]"
            id="casa-confirm-title"
          >
            {title}
          </h2>
        </div>

        <div className="px-5 py-6 sm:px-6">
          <p
            className="text-sm leading-6 text-black/60"
            id="casa-confirm-message"
          >
            {message}
          </p>
        </div>

        <div className="grid grid-cols-2 border-t border-black">
          <button
            className="border-r border-black px-4 py-4 text-sm font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={
              danger
                ? "bg-[#7e1d18] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[#651713] disabled:cursor-not-allowed disabled:opacity-50"
                : "bg-black px-4 py-4 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
            }
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy
              ? "Working..."
              : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
