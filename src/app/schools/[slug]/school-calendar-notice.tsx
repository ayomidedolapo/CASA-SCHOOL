"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  usePathname,
} from "next/navigation";

import styles from "./school-calendar-notice.module.css";

type CalendarClosure = {
  id: string;
  kind:
    | "PUBLIC_HOLIDAY"
    | "SCHOOL_BREAK"
    | "BRANCH_CLOSURE"
    | "SPECIAL_NON_INSTRUCTIONAL_DAY";
  title: string;
  startsOn: string;
  endsOn: string;
  notes: string | null;
  branchId: string | null;
  branchName: string | null;
  scope: "SCHOOL" | "BRANCH";
  durationDays: number;
  nextInstructionalDate: string | null;
  updatedAt: string;
};

function formatDate(
  date: string,
) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(
    new Date(
      `${date}T00:00:00.000Z`,
    ),
  );
}

function kindLabel(
  kind:
    CalendarClosure["kind"],
) {
  switch (kind) {
    case "PUBLIC_HOLIDAY":
      return "School holiday";
    case "SCHOOL_BREAK":
      return "School break";
    case "BRANCH_CLOSURE":
      return "Campus closed";
    default:
      return "Non-instructional day";
  }
}

export default function SchoolCalendarNotice(
  {
    slug,
    initialClosure,
  }: {
    slug: string;
    initialClosure:
      CalendarClosure | null;
  },
) {
  const pathname =
    usePathname();
  const [
    closure,
    setClosure,
  ] =
    useState<
      CalendarClosure | null
    >(
      initialClosure,
    );
  const [
    acknowledgedKey,
    setAcknowledgedKey,
  ] =
    useState("");
  const [
    branchContext,
    setBranchContext,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const attendancePath =
    useMemo(
      () => {
        const schoolBase =
          `/schools/${slug}`;

        return (
          pathname ===
            `${schoolBase}/attendance` ||
          pathname.startsWith(
            `${schoolBase}/attendance/`,
          ) ||
          pathname ===
            `${schoolBase}/technician/attendance` ||
          pathname.startsWith(
            `${schoolBase}/technician/attendance/`,
          )
        );
      },
      [
        pathname,
        slug,
      ],
    );

  const load =
    useCallback(
      async (
        branchId:
          string | null,
      ) => {
        const query =
          branchId
            ? `?branchId=${encodeURIComponent(
                branchId,
              )}`
            : "";
        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/calendar-status${query}`,
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );

        if (!response.ok) {
          return;
        }

        const body =
          await response
            .json() as {
              closure?:
                CalendarClosure | null;
            };

        setClosure(
          body.closure ??
            null,
        );
      },
      [
        slug,
      ],
    );

  useEffect(
    () => {
      function onBranchContext(
        event: Event,
      ) {
        const custom =
          event as
            CustomEvent<{
              branchId?:
                string | null;
            }>;
        const next =
          custom.detail
            ?.branchId ??
          null;

        setBranchContext(
          next,
        );
        void load(
          next,
        );
      }

      window.addEventListener(
        "casa:calendar-branch-context",
        onBranchContext,
      );

      return () => {
        window.removeEventListener(
          "casa:calendar-branch-context",
          onBranchContext,
        );
      };
    },
    [
      load,
    ],
  );

  useEffect(
    () => {
      const refresh =
        () => {
          void load(
            branchContext,
          );
        };

      const timer =
        window.setInterval(
          refresh,
          60_000,
        );

      window.addEventListener(
        "focus",
        refresh,
      );

      return () => {
        window.clearInterval(
          timer,
        );
        window.removeEventListener(
          "focus",
          refresh,
        );
      };
    },
    [
      branchContext,
      load,
    ],
  );

  const closureKey =
    closure
      ? `${closure.id}:${closure.updatedAt}`
      : "";
  const acknowledged =
    Boolean(
      closureKey &&
      closureKey ===
        acknowledgedKey,
    );

  if (!closure) {
    return null;
  }

  const range =
    closure.startsOn ===
      closure.endsOn
      ? formatDate(
          closure.startsOn,
        )
      : `${formatDate(
          closure.startsOn,
        )} - ${formatDate(
          closure.endsOn,
        )}`;
  const scope =
    closure.scope ===
      "BRANCH"
      ? `${closure.branchName ?? "Selected campus"} only`
      : "Entire school";
  const duration =
    `${closure.durationDays} ${
      closure.durationDays ===
        1
        ? "day"
        : "days"
    }`;
  const resume =
    closure.nextInstructionalDate
      ? formatDate(
          closure.nextInstructionalDate,
        )
      : "the next instructional day";

  if (
    !attendancePath &&
    acknowledged
  ) {
    return (
      <aside
        className={
          styles.banner
        }
        role="status"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-black/45">
              <span className={styles.dot} />
              {kindLabel(
                closure.kind,
              )}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {closure.title} - {scope} - {range}
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline underline-offset-4"
            onClick={() =>
              setAcknowledgedKey(
                "",
              )
            }
          >
            View notice
          </button>
        </div>
      </aside>
    );
  }

  return (
    <div
      className={
        styles.backdrop
      }
      role="dialog"
      aria-modal={
        attendancePath
          ? "true"
          : "false"
      }
      aria-labelledby="casa-calendar-closure-title"
    >
      <section
        className={
          styles.card
        }
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
          <span className={styles.dot} />
          {kindLabel(
            closure.kind,
          )}
        </p>

        <h2
          id="casa-calendar-closure-title"
          className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl"
        >
          {closure.title}
        </h2>

        <div className="mt-6 grid gap-px bg-black sm:grid-cols-3">
          <div className="bg-[#f5f5f0] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
              Scope
            </p>
            <p className="mt-2 text-sm font-semibold">
              {scope}
            </p>
          </div>
          <div className="bg-[#f5f5f0] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
              Duration
            </p>
            <p className="mt-2 text-sm font-semibold">
              {duration}
            </p>
          </div>
          <div className="bg-[#f5f5f0] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
              Resumption
            </p>
            <p className="mt-2 text-sm font-semibold">
              {resume}
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-black/60">
          {range}
        </p>

        {closure.notes ? (
          <p className="mt-3 text-sm leading-6 text-black/65">
            {closure.notes}
          </p>
        ) : null}

        {attendancePath ? (
          <div className="mt-7 border-t border-black pt-5">
            <p className="text-sm font-semibold">
              Attendance operations are unavailable during this closure.
            </p>
            <p className="mt-2 text-sm leading-6 text-black/55">
              Scanner, session controls, assisted attendance and after-hours attendance remain locked until the school calendar allows attendance again.
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="casa-button mt-7"
            onClick={() =>
              setAcknowledgedKey(
                closureKey,
              )
            }
          >
            Acknowledge notice
          </button>
        )}
      </section>
    </div>
  );
}
