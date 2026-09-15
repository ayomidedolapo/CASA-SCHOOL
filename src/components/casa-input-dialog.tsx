"use client";

import {
  useEffect,
  useState,
} from "react";

export interface CasaInputDialogProps {
  open: boolean;
  title: string;
  message: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  maxLength?: number;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function CasaInputDialog(props: CasaInputDialogProps) {
  const {
    open,
    ...dialogProps
  } = props;

  if (
    !open
  ) {
    return null;
  }

  return (
    <CasaInputDialogOpen
      key={`${dialogProps.title}:${dialogProps.initialValue ?? ""}`}
      {...dialogProps}
    />
  );
}

function CasaInputDialogOpen({
  title,
  message,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  minLength = 1,
  maxLength = 240,
  busy = false,
  onConfirm,
  onCancel,
}: Omit<CasaInputDialogProps, "open">) {
  const [
    value,
    setValue,
  ] = useState(
    initialValue,
  );

  useEffect(() => {
    const priorOverflow =
      document.body.style.overflow;
    document.body.style.overflow =
      "hidden";

    const onKeyDown =
      (event: KeyboardEvent) => {
        if (
          event.key ===
            "Escape" &&
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
  ]);

  const normalized =
    value.trim();
  const valid =
    normalized.length >=
      minLength &&
    normalized.length <=
      maxLength;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !busy
        ) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby="casa-input-message"
        aria-labelledby="casa-input-title"
        aria-modal="true"
        className="w-full max-w-lg border border-black bg-[#f7f7f3] shadow-2xl"
        role="dialog"
      >
        <div className="border-b border-black px-5 py-4 sm:px-6">
          <p className="casa-kicker text-black/45">
            Additional information required
          </p>
          <h2
            className="mt-2 text-2xl font-semibold tracking-[-0.045em]"
            id="casa-input-title"
          >
            {title}
          </h2>
        </div>

        <form
          onSubmit={(
            event,
          ) => {
            event.preventDefault();

            if (
              valid &&
              !busy
            ) {
              onConfirm(
                normalized,
              );
            }
          }}
        >
          <div className="px-5 py-6 sm:px-6">
            <p
              className="text-sm leading-6 text-black/60"
              id="casa-input-message"
            >
              {message}
            </p>

            <label className="casa-label mt-5">
              <span>
                {label}
              </span>
              <textarea
                autoFocus
                className="casa-field min-h-28 bg-white"
                maxLength={
                  maxLength
                }
                onChange={(
                  event,
                ) =>
                  setValue(
                    event.target.value,
                  )
                }
                placeholder={
                  placeholder
                }
                value={
                  value
                }
              />
            </label>

            <p className="mt-2 font-mono text-[9px] uppercase text-black/35">
              {normalized.length} / {maxLength} characters
              {minLength > 1
                ? ` · minimum ${minLength}`
                : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 border-t border-black">
            <button
              className="border-r border-black px-4 py-4 text-sm font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                busy
              }
              onClick={
                onCancel
              }
              type="button"
            >
              {cancelLabel}
            </button>
            <button
              className="bg-black px-4 py-4 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                busy ||
                !valid
              }
              type="submit"
            >
              {busy
                ? "Working..."
                : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
