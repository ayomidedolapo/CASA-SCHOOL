"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type LifecycleStatus =
  | "SETUP"
  | "READY"
  | "ACTIVE"
  | "PAUSED";

type Lifecycle = {
  status: LifecycleStatus;
  effectiveStartDate: string | null;
  scheduledResumeAt?:
    string | null;
  scheduledResumeReason?:
    string | null;
};

type StudentRow = {
  studentId?: string;
  casaStudentId?: string;
  firstName?: string;
  lastName?: string;
  className?: string;
  arrivalStatus?: string | null;
  punctualityOutcome?: string | null;
  presenceStatus?: string;
  arrivalMethod?: string | null;
  minutesAfterOfficialStart?: number | null;
};

type TodayResult = {
  clock?: {
    date?: string;
    time?: string;
  };
  session?: {
    id?: string;
    status?: string;
  } | null;
  summary?: Record<string, number>;
  students?: StudentRow[];
};

const views = [
  ["ALL", "All"],
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["NOT_ARRIVED", "Not arrived"],
  ["ABSENT", "Absent"],
  ["ON_CAMPUS", "On campus"],
  ["SIGNED_OUT", "Signed out"],
] as const;

async function bodyOrThrow(
  response: Response,
) {
  const body =
    await response.json().catch(
      () => ({}),
    );

  if (!response.ok) {
    throw new Error(
      typeof body.message ===
        "string"
        ? body.message
        : "Attendance request failed.",
    );
  }

  return body;
}

export default function TechnicianAttendanceClient({
  slug,
  canManageLifecycle,
}: {
  slug: string;
  canManageLifecycle: boolean;
}) {
  const [lifecycle, setLifecycle] =
    useState<Lifecycle | null>(null);
  const [today, setToday] =
    useState<TodayResult>({});
  const [view, setView] =
    useState("ALL");
  const [busy, setBusy] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [scheduledResumeAt, setScheduledResumeAt] =
    useState("");

  const fetchAttendance =
    useCallback(async () => {
      const [
        lifecycleBody,
        todayBody,
      ] = await Promise.all([
        bodyOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/lifecycle`,
            { cache: "no-store" },
          ),
        ),
        bodyOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/today?view=${encodeURIComponent(
              view,
            )}&pageSize=100`,
            { cache: "no-store" },
          ),
        ),
      ]);

      return {
        lifecycleBody,
        todayBody,
      };
    }, [slug, view]);

  const refresh =
    useCallback(async () => {
      const {
        lifecycleBody,
        todayBody,
      } = await fetchAttendance();

      setLifecycle(
        lifecycleBody.lifecycle ??
          null,
      );
      setToday(todayBody);
    }, [fetchAttendance]);

  useEffect(() => {
    let cancelled =
      false;

    void (async () => {
      try {
        const {
          lifecycleBody,
          todayBody,
        } =
          await fetchAttendance();

        if (cancelled) {
          return;
        }

        setLifecycle(
          lifecycleBody.lifecycle ??
            null,
        );
        setToday(
          todayBody,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load attendance.",
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [fetchAttendance]);

  async function mutate(
    endpoint: "lifecycle" | "session",
    body: Record<string, unknown>,
  ) {
    setBusy(true);
    setMessage("");

    try {
      const url =
        endpoint === "lifecycle"
          ? `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/lifecycle`
          : `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/sessions/today`;

      await bodyOrThrow(
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }),
      );

      setMessage(
        "Attendance operation completed.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Attendance operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const scheduledResumeDate =
    scheduledResumeAt
      ? new Date(
          scheduledResumeAt,
        )
      : null;
  const scheduledIso =
    scheduledResumeDate &&
    !Number.isNaN(
      scheduledResumeDate.getTime(),
    )
      ? scheduledResumeDate.toISOString()
      : null;

  const nextLifecycle =
    !canManageLifecycle
      ? null
      : lifecycle?.status === "SETUP"
        ? {
            label: "Mark ready",
            body: {
              action: "MARK_READY",
            },
          }
        : lifecycle?.status === "READY"
          ? {
              label: "Activate attendance",
              body: {
                action: "ACTIVATE",
              },
            }
          : lifecycle?.status === "ACTIVE"
            ? {
                label: "Suspend attendance",
                body: {
                  action: "PAUSE",
                  scheduledResumeAt:
                    scheduledIso,
                },
              }
            : lifecycle?.status === "PAUSED"
              ? {
                  label: "Resume now",
                  body: {
                    action: "RESUME",
                  },
                }
              : null;

  const rows =
    Array.isArray(today.students)
      ? today.students
      : [];

  return (
    <div className="mx-auto max-w-[1700px]">
      <section className="grid border-b border-black lg:grid-cols-[1fr_1fr]">
        <div className="border-b border-black p-5 sm:p-8 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Lifecycle
          </p>
          <div className="mt-4 flex items-end justify-between gap-6">
            <strong className="text-4xl tracking-[-0.05em]">
              {lifecycle?.status ??
                "—"}
            </strong>
            {nextLifecycle ? (
              <button
                className="border border-black bg-black px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f2f2ef] disabled:opacity-40"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    "lifecycle",
                    nextLifecycle.body,
                  )
                }
                type="button"
              >
                {nextLifecycle.label}
              </button>
            ) : null}
          </div>

          {canManageLifecycle &&
          (lifecycle?.status === "ACTIVE" ||
            lifecycle?.status === "PAUSED") ? (
            <div className="mt-5 border-t border-black/20 pt-4">
              <label className="block font-mono text-[9px] uppercase tracking-[0.12em] text-black/55">
                Scheduled resume
                <input
                  className="mt-2 block w-full border border-black bg-white px-3 py-2 text-xs normal-case tracking-normal"
                  type="datetime-local"
                  value={scheduledResumeAt}
                  onChange={(event) =>
                    setScheduledResumeAt(
                      event.target.value,
                    )
                  }
                />
              </label>

              {lifecycle?.status === "PAUSED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="border border-black px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] disabled:opacity-30"
                    disabled={
                      busy ||
                      !scheduledResumeAt
                    }
                    onClick={() =>
                      void mutate(
                        "lifecycle",
                        {
                          action:
                            "SCHEDULE_RESUME",
                          scheduledResumeAt:
                            scheduledIso,
                        },
                      )
                    }
                    type="button"
                  >
                    Save scheduled resume
                  </button>

                  {lifecycle.scheduledResumeAt ? (
                    <button
                      className="border border-black px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] disabled:opacity-30"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          "lifecycle",
                          {
                            action:
                              "CANCEL_SCHEDULED_RESUME",
                          },
                        )
                      }
                      type="button"
                    >
                      Cancel schedule
                    </button>
                  ) : null}
                </div>
              ) : null}

              {lifecycle?.scheduledResumeAt ? (
                <p className="mt-3 text-xs text-black/55">
                  Resume scheduled for{" "}
                  {new Date(
                    lifecycle.scheduledResumeAt,
                  ).toLocaleString()}.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-black/55">
            {canManageLifecycle
              ? "Owner/Admin lifecycle authority is active here. Scheduled resume is explicit and audited."
              : "Technicians can inspect attendance readiness and session health, but cannot suspend, resume, activate, or otherwise change the attendance lifecycle."}
          </p>
        </div>

        <div className="p-5 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Today session
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <strong className="block text-3xl tracking-[-0.04em]">
                {today.session?.status ??
                  "NO SESSION"}
              </strong>
              <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-black/55">
                {today.clock?.date ??
                  "—"}{" "}
                /{" "}
                {today.clock?.time ??
                  "—"}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                className="border border-black px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-30"
                disabled={
                  busy ||
                  today.session?.status ===
                    "OPEN"
                }
                onClick={() =>
                  void mutate(
                    "session",
                    {
                      action: "OPEN",
                    },
                  )
                }
                type="button"
              >
                Open
              </button>
              <button
                className="border border-black px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-30"
                disabled={
                  busy ||
                  today.session?.status !==
                    "OPEN"
                }
                onClick={() =>
                  void mutate(
                    "session",
                    {
                      action: "CLOSE",
                    },
                  )
                }
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <p className="border-b border-black px-5 py-3 text-sm sm:px-8">
          {message}
        </p>
      ) : null}

      <section className="p-5 sm:p-8">
        <div className="flex flex-wrap gap-2 border-b border-black pb-4">
          {views.map(
            ([value, label]) => (
              <button
                className={`border border-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  view === value
                    ? "bg-black text-[#f2f2ef]"
                    : ""
                }`}
                key={value}
                onClick={() =>
                  setView(value)
                }
                type="button"
              >
                {label}
              </button>
            ),
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-black font-mono text-[10px] uppercase tracking-[0.14em]">
                <th className="py-3 pr-4">
                  Student
                </th>
                <th className="py-3 pr-4">
                  Class
                </th>
                <th className="py-3 pr-4">
                  Presence
                </th>
                <th className="py-3 pr-4">
                  Punctuality
                </th>
                <th className="py-3">
                  Transport
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                (student, index) => (
                  <tr
                    className="border-b border-black/20 align-top text-sm"
                    key={
                      student.studentId ??
                      `${student.casaStudentId}-${index}`
                    }
                  >
                    <td className="py-4 pr-4">
                      <strong>
                        {student.firstName ??
                          ""}{" "}
                        {student.lastName ??
                          ""}
                      </strong>
                      <span className="mt-1 block font-mono text-[10px] text-black/50">
                        {student.casaStudentId ??
                          "—"}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      {student.className ??
                        "—"}
                    </td>
                    <td className="py-4 pr-4 font-mono text-[10px] uppercase">
                      {student.presenceStatus ??
                        "—"}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="font-mono text-[10px] uppercase">
                        {student.punctualityOutcome ??
                          student.arrivalStatus ??
                          "—"}
                      </span>
                      {typeof student.minutesAfterOfficialStart ===
                      "number" ? (
                        <span className="mt-1 block text-xs text-black/50">
                          {
                            student.minutesAfterOfficialStart
                          }{" "}
                          min after official
                        </span>
                      ) : null}
                    </td>
                    <td className="py-4 font-mono text-[10px] uppercase">
                      {student.arrivalMethod ??
                        "—"}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {rows.length === 0 ? (
            <p className="py-10 text-sm text-black/55">
              No students match this view.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
