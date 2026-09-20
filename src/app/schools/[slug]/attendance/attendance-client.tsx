"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  obtainPasskeyStepUpGrant,
} from "@/client/passkey-step-up";
import {
  CasaConfirmDialog,
} from "@/components/casa-confirm-dialog";
import {
  CasaInputDialog,
} from "@/components/casa-input-dialog";

import styles from "./attendance.module.css";

interface TodayStudent {
  studentId: string;
  casaStudentId: string;
  academicSessionId: string;
  admissionNumber:
    string | null;
  firstName: string;
  middleName:
    string | null;
  lastName: string;
  classLevelName: string;
  classArmName: string;
  presenceStatus:
    | "NOT_ARRIVED"
    | "ABSENT"
    | "ON_CAMPUS"
    | "SIGNED_OUT";
  arrivalStatus:
    | "ON_TIME"
    | "LATE"
    | "MANUAL"
    | null;
  recordedAt:
    string | null;
  checkedOutAt:
    string | null;
  earlyDeparturePreauthorized:
    boolean;
  firstCardPendingHandover:
    boolean;
  cardReplacement:
    | {
        reportedLostOn: string;
        replacementRequested: boolean;
      }
    | null;
}

interface TodayData {
  todayDate: string;
  readOnly: boolean;
  clock: {
    date: string;
    clock: string;
    weekday: number;
  };
  session:
    | {
        id: string;
        status:
          | "PLANNED"
          | "OPEN"
          | "CLOSED"
          | "CANCELLED";
        mode:
          | "INSTRUCTIONAL"
          | "PRESENCE_ONLY";
      }
    | null;
  summary: {
    expected: number;
    onCampus: number;
    signedOut: number;
    onTime: number;
    late: number;
    manual: number;
    notArrived: number;
    absent: number;
  };
  page: {
    number: number;
    total: number;
    pages: number;
  };
  students:
    TodayStudent[];
  earlyDepartures:
    Array<{
      attemptId: string;
      casaStudentId: string;
      studentName: string;
      authorized: boolean;
      reason:
        string | null;
    }>;
  terminalHealth: {
    active: number;
    seenRecently: number;
  };
  exceptions: {
    signOutsWithoutGuardianOutbox:
      number;
  };
}

interface StudentAttendanceHistory {
  student: {
    id: string;
    casaStudentId: string;
    admissionNumber: string | null;
    firstName: string;
    middleName: string | null;
    lastName: string;
  };
  period: {
    academicSessionName: string;
    academicTermName: string | null;
    startsOn: string;
    endsOn: string;
  };
  attendancePercentage: number | null;
  punctualityPercentage: number | null;
  earlyDepartures: number;
  trend: Array<{
    date: string;
    status: string;
    actualArrivalStatus: string | null;
    recordedAt: string | null;
    checkedOutAt: string | null;
    className: string;
  }>;
}

interface AttendanceLifecycle {
  id: string | null;
  status:
    | "SETUP"
    | "READY"
    | "ACTIVE"
    | "PAUSED";
  effectiveStartDate:
    string | null;
  readyAt:
    string | null;
  activatedAt:
    string | null;
  pausedAt:
    string | null;
  scheduledResumeAt:
    string | null;
  scheduledResumeReason:
    string | null;
}

interface Policy {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  validFrom: string;
  validTo:
    string | null;
  schoolBusGraceMinutes:
    number;
  independentGraceMinutes:
    number;  days: Array<{
    weekday: number;
    checkInOpensAt: string;
    onTimeUntil: string;
    checkInClosesAt: string;
    normalDismissalAt: string;
    checkOutClosesAt: string;
  }>;
}

type PendingAttendanceConfirm =
  | {
      kind: "FIRST_CARD";
      student: TodayStudent;
    }
  | {
      kind: "CARD_REPLACEMENT";
      student: TodayStudent;
    };

type PendingAttendanceInput =
  | {
      kind: "SUPERVISED_LATE";
      student: TodayStudent;
    }
  | {
      kind: "REOPEN";
    }
  | {
      kind: "REBIND";
    };

const weekdayLabels = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

type AttendanceDayTimes = {
  checkInOpensAt: string;
  onTimeUntil: string;
  checkInClosesAt: string;
  normalDismissalAt: string;
  checkOutClosesAt: string;
};

const defaultAttendanceDayTimes:
  AttendanceDayTimes = {
    checkInOpensAt: "07:00",
    onTimeUntil: "07:45",
    checkInClosesAt: "09:00",
    normalDismissalAt: "14:00",
    checkOutClosesAt: "17:00",
  };

function createDefaultAttendanceDayTimes():
  Record<number, AttendanceDayTimes> {
  return Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map(
      (weekday) => [
        weekday,
        {
          ...defaultAttendanceDayTimes,
        },
      ],
    ),
  ) as Record<
    number,
    AttendanceDayTimes
  >;
}

function studentName(
  student:
    TodayStudent,
): string {
  return [
    student.firstName,
    student.middleName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatTime(
  value:
    string | null,
): string {
  if (!value) {
    return "—";
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return parsed
    .toLocaleTimeString(
      [],
      {
        hour:
          "2-digit",
        minute:
          "2-digit",
      },
    );
}

export default function AttendanceClient(
  {
    slug,
    schoolName,
    canManage,
    canManageLifecycle,
    canViewOrganization,
    canSuperviseAttendance,
    branches,
  }: {
    slug: string;
    schoolName: string;
    canManage: boolean;
    canManageLifecycle: boolean;
    canViewOrganization: boolean;
    canSuperviseAttendance: boolean;
    branches: Array<{
      id: string;
      name: string;
      code: string;
      isHeadquarters: boolean;
    }>;
  },
) {
  const [
    data,
    setData,
  ] =
    useState<
      TodayData | null
    >(null);

  const [
    policies,
    setPolicies,
  ] =
    useState<
      Policy[]
    >([]);

  const [
    lifecycle,
    setLifecycle,
  ] =
    useState<
      AttendanceLifecycle | null
    >(null);

  const [
    selectedBranchId,
    setSelectedBranchId,
  ] =
    useState(
      branches[0]?.id ?? "",
    );

  const [
    selectedEarlyStudentIds,
    setSelectedEarlyStudentIds,
  ] =
    useState<string[]>([]);

  const [
    selectedEarlyReason,
    setSelectedEarlyReason,
  ] =
    useState("");

  const [
    selectedLateStudentIds,
    setSelectedLateStudentIds,
  ] = useState<string[]>([]);

  const [
    selectedLateReason,
    setSelectedLateReason,
  ] = useState("");

  const [
    selectedLateAllowedUntil,
    setSelectedLateAllowedUntil,
  ] = useState("");

  const [
    schoolBusGraceMinutes,
    setSchoolBusGraceMinutes,
  ] = useState(0);

  const [
    independentGraceMinutes,
    setIndependentGraceMinutes,
  ] = useState(0);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    notice,
    setNotice,
  ] =
    useState<
      string | null
    >(null);

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    view,
    setView,
  ] =
    useState("ALL");

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    historyStudent,
    setHistoryStudent,
  ] = useState<TodayStudent | null>(null);

  const [
    historyData,
    setHistoryData,
  ] = useState<StudentAttendanceHistory | null>(null);

  const [
    historyBusy,
    setHistoryBusy,
  ] = useState(false);

  const [
    earlyReasons,
    setEarlyReasons,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    policyName,
    setPolicyName,
  ] =
    useState(
      "Standard school day",
    );

  const [
    dayTimes,
    setDayTimes,
  ] =
    useState<
      Record<
        number,
        AttendanceDayTimes
      >
    >(
      createDefaultAttendanceDayTimes,
    );

  const [
    selectedWeekdays,
    setSelectedWeekdays,
  ] =
    useState<number[]>(
      [
        1,
        2,
        3,
        4,
        5,
      ],
    );

  const [
    pendingConfirm,
    setPendingConfirm,
  ] =
    useState<PendingAttendanceConfirm | null>(null);

  const [
    pendingInput,
    setPendingInput,
  ] =
    useState<PendingAttendanceInput | null>(null);

  const refreshToday =
    useCallback(
      async (
        quiet =
          false,
      ) => {
        await Promise.resolve();

        if (!quiet) {
          setError(
            null,
          );
        }

        const params =
          new URLSearchParams({
            q:
              query,
            view,
            page:
              String(
                page,
              ),
            pageSize:
              "50",
          });

        if (selectedDate) {
          params.set("date", selectedDate);
        }

        const attendancePath =
          selectedBranchId
            ? `/api/schools/${encodeURIComponent(
                slug,
              )}/branches/${encodeURIComponent(
                selectedBranchId,
              )}/attendance/today`
            : `/api/schools/${encodeURIComponent(
                slug,
              )}/attendance/today`;

        const response =
          await fetch(
            `${attendancePath}?${params.toString()}`,
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );

        const body:
          unknown =
            await response.json();

        if (!response.ok) {
          if (!quiet) {
            const message =
              typeof body ===
                "object" &&
              body !== null &&
              "message" in body &&
              typeof body.message ===
                "string"
                ? body.message
                : "Attendance could not be loaded.";

            setError(
              message,
            );
          }

          return;
        }

        setData(
          body as
            TodayData,
        );
      },
      [
        slug,
        query,
        view,
        page,
        selectedBranchId,
        selectedDate,
      ],
    );

  const refreshLifecycle =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/lifecycle`,
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
          await response.json() as {
            lifecycle?:
              AttendanceLifecycle;
          };

        setLifecycle(
          body.lifecycle ??
          null,
        );
      },
      [
        slug,
      ],
    );

  const refreshPolicies =
    useCallback(
      async () => {
        if (!selectedBranchId) {
          setPolicies([]);
          return;
        }

        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/branches/${encodeURIComponent(
              selectedBranchId,
            )}/attendance/policies`,
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
          await response.json() as {
            policies?:
              Policy[];
          };

        // Hydrate editable Attendance policy fields directly from the fetched persisted default.
        const nextPolicies =
          body.policies ??
            [];

        setPolicies(
          nextPolicies,
        );

        const persistedDefault =
          nextPolicies.find(
            (policy) =>
              policy.isDefault &&
              policy.isActive,
          ) ??
          null;

        if (
          persistedDefault &&
          Array.isArray(
            persistedDefault.days,
          ) &&
          persistedDefault.days.length >
            0
        ) {
          const orderedDays =
            [...persistedDefault.days]
              .sort(
                (
                  left,
                  right,
                ) =>
                  left.weekday -
                  right.weekday,
              );

          const normalizeTime =
            (
              value:
                string,
            ) =>
              value.length >=
                5
                ? value.slice(
                    0,
                    5,
                  )
                : value;

          setPolicyName(
            persistedDefault.name,
          );

          setSelectedWeekdays(
            orderedDays.map(
              (day) =>
                day.weekday,
            ),
          );

          setDayTimes(
            (
              current,
            ) => {
              const next = {
                ...current,
              };

              for (
                const day of
                orderedDays
              ) {
                next[
                  day.weekday
                ] = {
                  checkInOpensAt:
                    normalizeTime(
                      day.checkInOpensAt,
                    ),
                  onTimeUntil:
                    normalizeTime(
                      day.onTimeUntil,
                    ),
                  checkInClosesAt:
                    normalizeTime(
                      day.checkInClosesAt,
                    ),
                  normalDismissalAt:
                    normalizeTime(
                      day.normalDismissalAt,
                    ),
                  checkOutClosesAt:
                    normalizeTime(
                      day.checkOutClosesAt,
                    ),
                };
              }

              return next;
            },
          );
        }
      },
      [
        slug,
        selectedBranchId,
      ],
    );

  useEffect(
    () => {
      const initialTimer =
        window.setTimeout(
          () => {
            void refreshToday();
            void refreshLifecycle();
            if (canManage && selectedBranchId) {
              void refreshPolicies();
            }
          },
          0,
        );

      const refreshTimer =
        window.setInterval(
          () => {
            void refreshToday(
              true,
            );
            void refreshLifecycle();
          },
          15_000,
        );

      return () => {
        window.clearTimeout(
          initialTimer,
        );

        window.clearInterval(
          refreshTimer,
        );
      };
    },
    [
      refreshToday,
      refreshLifecycle,
      refreshPolicies,
      canManage,
      selectedBranchId,
    ],
  );

  const defaultPolicy =
    useMemo(
      () =>
        policies.find(
          (policy) =>
            policy.isDefault &&
            policy.isActive,
        ) ??
        null,
      [
        policies,
      ],
    );

  function attendanceActionErrorMessage(
    code:
      string | undefined,
    message:
      string | undefined,
  ): string {
    if (
      code ===
      "ATTENDANCE_NOT_ACTIVE"
    ) {
      return "Attendance has not been activated for this school yet. Complete Attendance setup, mark it READY, then activate it before preparing a session.";
    }

    if (
      code ===
      "ATTENDANCE_PAUSED"
    ) {
      return "Attendance is currently paused. Resume Attendance before preparing or opening a session.";
    }

    if (
      code ===
      "ATTENDANCE_EFFECTIVE_DATE_NOT_REACHED"
    ) {
      return "Attendance is activated, but its effective start date has not arrived yet.";
    }

    if (
      code ===
      "NON_INSTRUCTIONAL_DAY"
    ) {
      return "Today is not an instructional day for this campus. Check the active default policy weekdays and Calendar & holidays.";
    }

    if (
      code ===
      "ATTENDANCE_POLICY_REQUIRED"
    ) {
      return "This campus needs an active default Attendance policy that is valid for today and includes today's weekday.";
    }

    return (
      message ??
      code ??
      "Attendance action failed."
    );
  }

  async function mutateLifecycle(
    action:
      | "MARK_READY"
      | "ACTIVATE_TODAY"
      | "ACTIVATE_NEXT"
      | "RESUME",
  ) {
    if (
      !canManageLifecycle
    ) {
      setError(
        "Only the School Owner or Admin can change the school Attendance lifecycle.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const today =
        data?.todayDate ??
        null;

      const payload =
        action ===
          "MARK_READY"
          ? {
              action:
                "MARK_READY",
              reason:
                "Attendance setup completed from Attendance workspace.",
            }
          : action ===
              "ACTIVATE_TODAY"
            ? {
                action:
                  "ACTIVATE",
                effectiveDate:
                  today,
                confirmStartToday:
                  true,
                reason:
                  "Attendance activated for today from Attendance workspace.",
              }
            : action ===
                "ACTIVATE_NEXT"
              ? {
                  action:
                    "ACTIVATE",
                  effectiveDate:
                    null,
                  confirmStartToday:
                    false,
                  reason:
                    "Attendance scheduled from next instructional date.",
                }
              : {
                  action:
                    "RESUME",
                  reason:
                    "Attendance resumed from Attendance workspace.",
                };

      if (
        action ===
          "ACTIVATE_TODAY" &&
        !today
      ) {
        throw new Error(
          "CASA could not resolve the school's current date.",
        );
      }

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/lifecycle`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            cache:
              "no-store",
            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            lifecycle?:
              AttendanceLifecycle;
            message?:
              string;
            code?:
              string;
          };

      if (!response.ok) {
        throw new Error(
          attendanceActionErrorMessage(
            body.code,
            body.message,
          ),
        );
      }

      setLifecycle(
        body.lifecycle ??
        null,
      );

      setNotice(
        action ===
          "MARK_READY"
          ? "Attendance setup is READY. Activate it for today or the next instructional day."
          : action ===
              "ACTIVATE_TODAY"
            ? "Attendance is ACTIVE from today. You can now prepare today's campus session."
            : action ===
                "ACTIVATE_NEXT"
              ? `Attendance is ACTIVE from ${body.lifecycle?.effectiveStartDate ?? "the next instructional day"}.`
              : "Attendance has resumed and is ACTIVE.",
      );

      await Promise.all([
        refreshLifecycle(),
        refreshToday(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Attendance lifecycle action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recordFirstCardException(
    student: TodayStudent,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/schools/${encodeURIComponent(
          slug,
        )}/attendance/first-card-exceptions/${encodeURIComponent(
          student.studentId,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            verificationMethod: "FACE_EXISTING_PROFILE",
            confirmStudentFaceMatch: true,
          }),
        },
      );

      const body = await response.json() as {
        message?: string;
        code?: string;
      };

      if (!response.ok) {
        throw new Error(
          body.message ??
          body.code ??
          "First-card attendance exception failed.",
        );
      }

      setNotice(
        "Supervised first-card attendance recorded with face-confirmation audit.",
      );
      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "First-card attendance exception failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recordCardReplacementException(
    student: TodayStudent,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/card-exceptions/${encodeURIComponent(
            student.studentId,
          )}`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            cache:
              "no-store",
            body:
              JSON.stringify({
                verificationMethod:
                  "FACE_EXISTING_PROFILE",
              }),
          },
        );

      const body =
        await response
          .json() as {
            message?:
              string;
            code?:
              string;
            graceDayNumber?:
              number |
              null;
            replacementRequested?:
              boolean;
          };

      if (
        !response.ok
      ) {
        throw new Error(
          body.message ??
          body.code ??
          "Lost-card attendance exception failed.",
        );
      }

      setNotice(
        body.replacementRequested
          ? "Lost-card attendance recorded with face confirmation. The formal replacement request remains authoritative."
          : `Lost-card attendance recorded with face confirmation${body.graceDayNumber ? ` on instructional grace day ${body.graceDayNumber} of 3` : ""}.`,
      );

      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Lost-card attendance exception failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recordSupervisedLate(
    student: TodayStudent,
    reason: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/schools/${encodeURIComponent(
          slug,
        )}/attendance/supervised-late-arrivals/${encodeURIComponent(
          student.studentId,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ reason }),
        },
      );

      const body = await response.json() as {
        message?: string;
        code?: string;
      };

      if (!response.ok) {
        throw new Error(
          body.message ??
          body.code ??
          "Supervised late arrival failed.",
        );
      }

      setNotice(
        "Supervised arrival recorded as LATE and preserved in attendance audit history.",
      );
      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Supervised late arrival failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function mutateSession(
    action:
      | "PREPARE"
      | "OPEN"
      | "CLOSE"
      | "REOPEN",
    reason: string | null = null,
    mode: "INSTRUCTIONAL" | "PRESENCE_ONLY" = "INSTRUCTIONAL",
  ) {
    if (!selectedBranchId) {
      setError("Attendance must be opened for one campus.");
      return;
    }
    if (
      action === "REOPEN" &&
      !reason
    ) {
      setPendingInput({ kind: "REOPEN" });
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setNotice(
      null,
    );

    try {
      const grant =
        action ===
          "REOPEN"
          ? await obtainPasskeyStepUpGrant({
              schoolSlug:
                slug,
              action:
                "ATTENDANCE_SESSION_REOPEN",
            })
          : null;

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/${encodeURIComponent(
            selectedBranchId,
          )}/attendance/sessions/today`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
              ...(grant
                ? {
                    "x-casa-passkey-step-up":
                      grant,
                  }
                : {}),
            },
            credentials:
              "same-origin",
            cache:
              "no-store",
            body:
              JSON.stringify(
                action ===
                  "REOPEN"
                  ? {
                      action,
                      reason,
                    }
                  : action === "PREPARE"
                    ? {
                        action,
                        mode,
                      }
                    : {
                        action,
                      },
              ),
          },
        );

      const raw =
        await response.text();

      let body:
        {
          code?:
            string;
          message?:
            string;
        } =
          {};

      if (raw) {
        try {
          body =
            JSON.parse(
              raw,
            ) as {
              code?:
                string;
              message?:
                string;
            };
        } catch {
          body =
            {};
        }
      }

      if (!response.ok) {
        throw new Error(
          attendanceActionErrorMessage(
            body.code,
            body.message,
          ),
        );
      }

      setNotice(
        action ===
          "PREPARE"
          ? mode === "PRESENCE_ONLY"
            ? "Presence-only Saturday is prepared. Open it when the campus is ready to scan."
            : "Attendance is prepared. Review the policy, then open when the campus is ready."
          : action ===
              "OPEN"
            ? "Attendance is open."
            : action ===
                "REOPEN"
              ? "Attendance reopened. The original session and audit history were preserved."
              : "Attendance is closed.",
      );

      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Attendance session action failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function openStudentHistory(student: TodayStudent) {
    if (!selectedBranchId) {
      setError("Choose one campus to view student attendance history.");
      return;
    }

    setHistoryStudent(student);
    setHistoryData(null);
    setHistoryBusy(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        academicSessionId: student.academicSessionId,
      });
      const response = await fetch(
        `/api/schools/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranchId)}/students/${encodeURIComponent(student.studentId)}/attendance-analytics?${params.toString()}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json() as StudentAttendanceHistory & { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? "Student attendance history could not be loaded.");
      }
      setHistoryData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Student attendance history could not be loaded.");
      setHistoryStudent(null);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function rebindSessionPolicy(
    reason?: string,
  ) {
    if (!selectedBranchId) {
      setError("Attendance must be scoped to one campus.");
      return;
    }
    if (!reason) {
      setPendingInput({ kind: "REBIND" });
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setNotice(
      null,
    );

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action:
            "ATTENDANCE_SESSION_POLICY_REBIND",
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/${encodeURIComponent(
            selectedBranchId,
          )}/attendance/sessions/today/policy-rebind`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-casa-passkey-step-up":
                grant,
            },
            credentials:
              "same-origin",
            cache:
              "no-store",
            body:
              JSON.stringify({
                reason,
              }),
          },
        );

      const raw =
        await response.text();

      let body:
        {
          code?:
            string;
          message?:
            string;
        } =
          {};

      if (raw) {
        try {
          body =
            JSON.parse(
              raw,
            ) as {
              code?:
                string;
              message?:
                string;
            };
        } catch {
          body =
            {};
        }
      }

      if (!response.ok) {
        throw new Error(
          body.code ??
            body.message ??
            "Attendance policy correction failed.",
        );
      }

      setNotice(
        "Today's open session now uses the current attendance policy. Earlier rejected scans remain preserved in audit history.",
      );

      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Attendance policy correction failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function createPolicy() {
    if (!selectedBranchId) {
      setError("Choose one campus before creating an attendance policy.");
      return;
    }

    if (
      selectedWeekdays.length ===
      0
    ) {
      setError(
        "Select at least one school day.",
      );
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setNotice(
      null,
    );

    try {
      const validFrom =
        data?.clock
          .date ??
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          );

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/${encodeURIComponent(
            selectedBranchId,
          )}/attendance/policies`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                name:
                  policyName,
                validFrom,
                validTo:
                  null,
                isDefault:
                  true,
                schoolBusGraceMinutes,
                independentGraceMinutes,
                days:
                  selectedWeekdays.map(
                    (
                      weekday,
                    ) => ({
                      weekday,
                      ...(
                        dayTimes[
                          weekday
                        ] ??
                        defaultAttendanceDayTimes
                      ),
                    }),
                  ),
              }),
          },
        );

      const body =
        await response.json() as {
          message?:
            string;
          issues?:
            Array<{
              message:
                string;
            }>;
        };

      if (!response.ok) {
        throw new Error(
          body.issues?.[0]
            ?.message ??
            body.message ??
            "Attendance policy could not be created.",
        );
      }

      setNotice(
        "New default attendance policy created. Historical sessions keep their original policy reference.",
      );

      await refreshPolicies();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Attendance policy could not be created.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function authorizeEarly(
    attemptId:
      string,
  ) {
    const reason =
      earlyReasons[
        attemptId
      ]?.trim();

    if (
      !reason ||
      reason.length <
        3
    ) {
      setError(
        "Enter the reason for the early departure.",
      );
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setNotice(
      null,
    );

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action:
            "EARLY_DEPARTURE",
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/early-departures/${attemptId}/authorize`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-casa-passkey-step-up":
                grant,
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                reason,
              }),
          },
        );

      const body =
        await response.json() as {
          code?:
            string;
          message?:
            string;
        };

      if (!response.ok) {
        throw new Error(
          body.code ??
            body.message ??
            "Early departure authorization failed.",
        );
      }

      setNotice(
        "Early departure authorized. The Scanner will resume face verification automatically.",
      );

      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Early departure authorization failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }


  async function authorizeSelectedEarlyDepartures() {
    const reason =
      selectedEarlyReason.trim();

    if (!selectedBranchId) {
      setError(
        "Choose one branch before authorizing selected students.",
      );
      return;
    }

    if (
      selectedEarlyStudentIds.length ===
        0
    ) {
      setError(
        "Select at least one student who is currently on campus.",
      );
      return;
    }

    if (
      reason.length <
        3
    ) {
      setError(
        "Enter the reason for the selected students leaving early.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action:
            "EARLY_DEPARTURE",
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/early-departures/preauthorize`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-casa-passkey-step-up":
                grant,
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                branchId:
                  selectedBranchId,
                studentIds:
                  selectedEarlyStudentIds,
                reason,
              }),
          },
        );

      const body =
        await response.json() as {
          message?: string;
          code?: string;
          requested?: number;
          newlyAuthorized?: number;
          alreadyAuthorized?: number;
        };

      if (!response.ok) {
        throw new Error(
          body.message ??
            body.code ??
            "Selected students could not be authorized for early departure.",
        );
      }

      setNotice(
        `${body.requested ?? selectedEarlyStudentIds.length} student(s) are cleared to use the Scanner for early departure. Each student must still scan their own card and pass face/liveness.`,
      );
      setSelectedEarlyStudentIds([]);
      setSelectedEarlyReason("");
      await refreshToday();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Selected students could not be authorized for early departure.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function authorizeSelectedLateStay() {
    const reason = selectedLateReason.trim();
    const allowed = new Date(selectedLateAllowedUntil);

    if (!selectedBranchId) {
      setError("Choose one campus before authorizing late stay.");
      return;
    }
    if (selectedLateStudentIds.length === 0) {
      setError("Select at least one student who is still on campus.");
      return;
    }
    if (reason.length < 3) {
      setError("Enter the reason for the selected students staying after close.");
      return;
    }
    if (!Number.isFinite(allowed.getTime()) || allowed.getTime() <= Date.now()) {
      setError("Choose a future allowed-until time for late stay.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const grant = await obtainPasskeyStepUpGrant({
        schoolSlug: slug,
        action: "LATE_DEPARTURE",
      });
      const response = await fetch(
        `/api/schools/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranchId)}/attendance/late-stay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-casa-passkey-step-up": grant,
          },
          credentials: "same-origin",
          body: JSON.stringify({
            studentIds: selectedLateStudentIds,
            reason,
            allowedUntil: allowed.toISOString(),
          }),
        },
      );
      const body = await response.json() as { message?: string; code?: string; authorized?: number };
      if (!response.ok) {
        throw new Error(body.message ?? body.code ?? "Late-stay authorization failed.");
      }
      setNotice(`${body.authorized ?? selectedLateStudentIds.length} student(s) may check out after campus close until the approved time. Each checkout still requires the student's own card and biometric verification.`);
      setSelectedLateStudentIds([]);
      setSelectedLateReason("");
      setSelectedLateAllowedUntil("");
      await refreshToday();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Late-stay authorization failed.");
    } finally {
      setBusy(false);
    }
  }

  const metrics =
    data
      ? [
          {
            value:
              data.summary.expected,
            label:
              "Expected",
          },
          {
            value:
              data.summary.onCampus,
            label:
              "On campus",
          },
          {
            value:
              data.summary.onTime,
            label:
              "On time",
          },
          {
            value:
              data.summary.late,
            label:
              "Late",
          },
          {
            value:
              data.summary.notArrived,
            label:
              "Not arrived",
          },
          {
            value:
              data.summary.absent,
            label:
              "Absent",
          },
          {
            value:
              data.summary.signedOut,
            label:
              "Signed out",
          },
        ]
      : [];

  return (
    <main
      className={
        styles.shell
      }
    >
      <header
        className={
          styles.header
        }
      >
        <div>
          <p className={styles.kicker}>
            CASA / Attendance
          </p>
          <h1
            className={
              styles.brand
            }
          >
            ATTENDANCE
            <br />
            REGISTER
          </h1>
        </div>

        <div className={styles.headerContext}>
          <div className={styles.school}>
            <strong>
              {schoolName}
            </strong>
            <br />
            {
              data?.clock
                .date ??
              "Loading date..."
            }
            {" · "}
            {
              data?.clock
                .clock ??
              "—"
            }
          </div>

          <nav className={styles.headerActions} aria-label="Attendance navigation">
            <Link
              className={styles.headerLink}
              href={`/schools/${encodeURIComponent(slug)}/registry`}
            >
              Registry
            </Link>
            <Link
              className={styles.headerLink}
              href={`/schools/${encodeURIComponent(slug)}/technician`}
            >
              Technical
            </Link>
            <Link
              className={styles.headerLink}
              href={`/schools/${encodeURIComponent(slug)}/notifications`}
            >
              Notifications
            </Link>
            {canManage ? (
              <>
                <Link
                  className={styles.headerLink}
                  href={`/schools/${encodeURIComponent(slug)}/attendance/transport`}
                >
                  Transport &amp; grace
                </Link>
                <Link
                  className={styles.headerLink}
                  href={`/schools/${encodeURIComponent(slug)}/summer`}
                >
                  Summer
                </Link>
              </>
            ) : (
              <Link
                className={styles.headerLink}
                href={`/schools/${encodeURIComponent(slug)}/technician/attendance`}
              >
                Operator view
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div
        className={
          styles.statusLine
        }
      >
        <span className="casa-status">
          Attendance lifecycle:{" "}
          {
            lifecycle?.status ??
            "LOADING"
          }
        </span>

        {lifecycle?.effectiveStartDate && (
          <span className={styles.muted}>
            Effective:{" "}
            {
              lifecycle.effectiveStartDate
            }
          </span>
        )}

        {canManageLifecycle &&
          lifecycle?.status ===
            "SETUP" && (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={
              busy ||
              !defaultPolicy
            }
            onClick={() =>
              void mutateLifecycle(
                "MARK_READY",
              )
            }
          >
            Mark Attendance ready
          </button>
        )}

        {canManageLifecycle &&
          lifecycle?.status ===
            "READY" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={
                busy ||
                !defaultPolicy
              }
              onClick={() =>
                void mutateLifecycle(
                  "ACTIVATE_TODAY",
                )
              }
            >
              Activate Attendance today
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={
                busy ||
                !defaultPolicy
              }
              onClick={() =>
                void mutateLifecycle(
                  "ACTIVATE_NEXT",
                )
              }
            >
              Activate next instructional day
            </button>
          </div>
        )}

        {canManageLifecycle &&
          lifecycle?.status ===
            "PAUSED" && (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() =>
              void mutateLifecycle(
                "RESUME",
              )
            }
          >
            Resume Attendance
          </button>
        )}

        {lifecycle?.status ===
          "SETUP" &&
          !defaultPolicy && (
          <span className={styles.muted}>
            Create an active default campus policy before marking Attendance ready.
          </span>
        )}

        {lifecycle?.status ===
          "READY" && (
          <span className={styles.muted}>
            Attendance is configured but not active yet.
          </span>
        )}

        {lifecycle?.status ===
          "PAUSED" && (
          <span className={styles.muted}>
            Attendance is paused; campus sessions cannot be prepared or opened.
          </span>
        )}

        <span
          className={
            styles.status
          }
        >
          {data?.session
            ?.status ??
            "NO SESSION"}
        </span>

        {!data?.session && !data?.readOnly && (
          <span className={styles.muted}>
            No attendance session has been prepared for this campus/date. Prepare and open attendance before recording arrivals or supervised card exceptions.
          </span>
        )}

        <span
          className={
            styles.muted
          }
        >
          {defaultPolicy
            ? `Policy: ${defaultPolicy.name}`
            : "No default attendance policy"}
        </span>

        <label className={styles.actions}>
          <span className={styles.muted}>Attendance date</span>
          <input
            className={styles.input}
            type="date"
            max={data?.todayDate ?? undefined}
            value={selectedDate || data?.clock.date || ""}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setPage(1);
              setSelectedEarlyStudentIds([]);
              setSelectedLateStudentIds([]);
            }}
          />
          {data?.readOnly && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setSelectedDate("");
                setPage(1);
              }}
            >
              Today
            </button>
          )}
        </label>

        {data?.readOnly && (
          <span className="casa-status">Historical · read only</span>
        )}

        {data?.session?.mode === "PRESENCE_ONLY" && (
          <span className="casa-status">Presence only · not graded</span>
        )}

        <span
          className={
            styles.muted
          }
        >
          Terminals recently seen:{" "}
          {
            data
              ?.terminalHealth
              .seenRecently ??
            0
          }
          /
          {
            data
              ?.terminalHealth
              .active ??
            0
          }
        </span>

        {canManage && !data?.readOnly && (
          <div className={styles.actions}>
            {!data?.session && (
              <>
                {(data?.clock.weekday !== 6 ||
                  defaultPolicy?.days.some((day) => day.weekday === 6)) && (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={
                      busy ||
                      !selectedBranchId ||
                      lifecycle?.status !==
                        "ACTIVE" ||
                      Boolean(
                        lifecycle?.effectiveStartDate &&
                        data?.todayDate &&
                        lifecycle.effectiveStartDate >
                          data.todayDate,
                      )
                    }
                    onClick={() => void mutateSession("PREPARE", null, "INSTRUCTIONAL")}
                  >
                    Prepare attendance
                  </button>
                )}
                {data?.clock.weekday === 6 && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={
                      busy ||
                      !selectedBranchId ||
                      lifecycle?.status !==
                        "ACTIVE" ||
                      Boolean(
                        lifecycle?.effectiveStartDate &&
                        data?.todayDate &&
                        lifecycle.effectiveStartDate >
                          data.todayDate,
                      )
                    }
                    onClick={() => void mutateSession("PREPARE", null, "PRESENCE_ONLY")}
                  >
                    Prepare presence-only
                  </button>
                )}
              </>
            )}

            {data?.session?.status === "PLANNED" && (
              <>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void mutateSession("OPEN")}
                >
                  Open today
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => void rebindSessionPolicy()}
                >
                  Use current policy
                </button>
              </>
            )}

            {data?.session?.status === "OPEN" && (
              <>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void mutateSession("CLOSE")}
                >
                  Close today
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => void rebindSessionPolicy()}
                >
                  Use current policy
                </button>
              </>
            )}

            {data?.session?.status === "CLOSED" && (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void mutateSession("REOPEN")}
              >
                Reopen today
              </button>
            )}

            {data?.session?.status === "CANCELLED" && (
              <span className="casa-status">Session cancelled</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          className={
            `${styles.notice} ${styles.error}`
          }
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          className={
            `${styles.notice} ${styles.success}`
          }
        >
          {notice}
        </div>
      )}

      {data &&
        data.exceptions
          .signOutsWithoutGuardianOutbox >
          0 && (
        <div
          className={
            `${styles.notice} ${styles.warning}`
          }
        >
          {
            data
              .exceptions
              .signOutsWithoutGuardianOutbox
          }{" "}
          accepted sign-out
          {data
            .exceptions
            .signOutsWithoutGuardianOutbox ===
          1
            ? ""
            : "s"}{" "}
          currently have no guardian notification outbox row.
        </div>
      )}

      <section
        className={
          styles.metrics
        }
      >
        {metrics.map(
          (
            metric,
          ) => (
            <div
              key={
                metric.label
              }
              className={
                styles.metric
              }
            >
              <span
                className={
                  styles.metricValue
                }
              >
                {
                  metric.value
                }
              </span>
              <span
                className={
                  styles.metricLabel
                }
              >
                {
                  metric.label
                }
              </span>
            </div>
          ),
        )}
      </section>

      {canSuperviseAttendance &&
        data?.session?.status ===
          "OPEN" && (
        <section
          className={
            styles.section
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <div>
              <h2
                className={
                  styles.sectionTitle
                }
              >
                Early departure
              </h2>
              <p
                className={
                  styles.muted
                }
              >
                For a known group, select any on-campus students from the same branch, enter one reason, and authorize once with Passkey. They may be from different classes.
              </p>
            </div>
            <span
              className={
                styles.muted
              }
            >
              {selectedEarlyStudentIds.length} selected
            </span>
          </div>

          {!selectedBranchId ? (
            <p
              className={
                styles.muted
              }
            >
              Choose a branch below first. Group early departure is branch-scoped.
            </p>
          ) : null}

          <div
            className={
              styles.filters
            }
          >
            <input
              className={
                styles.input
              }
              value={
                selectedEarlyReason
              }
              maxLength={240}
              placeholder="Reason, e.g. Sent home for outstanding school fees"
              onChange={
                (event) =>
                  setSelectedEarlyReason(
                    event.target.value,
                  )
              }
            />
            <button
              type="button"
              className={
                styles.button
              }
              disabled={
                busy ||
                !selectedBranchId ||
                selectedEarlyStudentIds.length ===
                  0
              }
              onClick={
                () =>
                  void authorizeSelectedEarlyDepartures()
              }
            >
              Authorize selected with Passkey
            </button>
          </div>
        </section>
      )}

      {canSuperviseAttendance &&
        data?.session?.status === "CLOSED" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Late-stay checkout</h2>
              <p className={styles.muted}>
                Select only students who remain on campus, give one reason and allowed-until time, then approve the group once with Passkey. Each student still checks out with their own card and face/liveness.
              </p>
            </div>
            <span className={styles.muted}>{selectedLateStudentIds.length} selected</span>
          </div>
          <div className={styles.filters}>
            <input
              className={styles.input}
              value={selectedLateReason}
              maxLength={240}
              placeholder="Reason, e.g. Waiting for parent pickup"
              onChange={(event) => setSelectedLateReason(event.target.value)}
            />
            <input
              className={styles.input}
              type="datetime-local"
              value={selectedLateAllowedUntil}
              onChange={(event) => setSelectedLateAllowedUntil(event.target.value)}
            />
            <button
              type="button"
              className={styles.button}
              disabled={busy || selectedLateStudentIds.length === 0 || !selectedLateAllowedUntil}
              onClick={() => void authorizeSelectedLateStay()}
            >
              Authorize late stay with Passkey
            </button>
          </div>
        </section>
      )}

      {canSuperviseAttendance &&
        data &&
        data.earlyDepartures
          .length >
          0 && (
        <section
          className={
            styles.section
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <h2
              className={
                styles.sectionTitle
              }
            >
              Early departure
            </h2>
            <span
              className={
                styles.muted
              }
            >
              Passkey required
            </span>
          </div>

          <div
            className={
              styles.earlyGrid
            }
          >
            {data.earlyDepartures.map(
              (
                departure,
              ) => (
                <div
                  key={
                    departure.attemptId
                  }
                  className={
                    styles.earlyItem
                  }
                >
                  <div>
                    <strong>
                      {
                        departure.studentName
                      }
                    </strong>
                    <br />
                    <span
                      className={
                        styles.muted
                      }
                    >
                      {
                        departure.casaStudentId
                      }
                    </span>
                  </div>

                  {departure.authorized ? (
                    <div
                      className={
                        styles.success
                      }
                    >
                      Authorized — waiting for face verification.
                    </div>
                  ) : (
                    <input
                      className={
                        styles.input
                      }
                      value={
                        earlyReasons[
                          departure
                            .attemptId
                        ] ??
                        ""
                      }
                      placeholder="Reason for early release"
                      onChange={
                        (
                          event,
                        ) =>
                          setEarlyReasons(
                            (
                              current,
                            ) => ({
                              ...current,
                              [departure.attemptId]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                      }
                    />
                  )}

                  {!departure.authorized && (
                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      disabled={
                        busy
                      }
                      onClick={
                        () =>
                          void authorizeEarly(
                            departure.attemptId,
                          )
                      }
                    >
                      Authorize with Passkey
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
        </section>
      )}

      <section
        className={
          styles.section
        }
      >
        <div
          className={
            styles.sectionHeader
          }
        >
          <h2
            className={
              styles.sectionTitle
            }
          >
            Students
          </h2>

          <span
            className={
              styles.muted
            }
          >
            {
              data?.page
                .total ??
              0
            }{" "}
            matching
          </span>
        </div>

        <div
          className={
            styles.filters
          }
        >
          {branches.length > 1 && (
            <select
              className={styles.select}
              value={selectedBranchId}
              onChange={(event) => {
                setSelectedBranchId(event.target.value);
                setSelectedEarlyStudentIds([]);
                setSelectedLateStudentIds([]);
                setPolicies([]);
                setPage(1);
              }}
            >
              {branches.map((branch) => (
                <option
                  key={branch.id}
                  value={branch.id}
                >
                  {branch.name}
                  {branch.isHeadquarters ? " · HQ" : ""}
                </option>
              ))}
            </select>
          )}

          <input
            className={
              styles.input
            }
            value={
              query
            }
            placeholder="Search name, CASA ID, school number, class"
            onChange={
              (
                event,
              ) => {
                setQuery(
                  event
                    .target
                    .value,
                );
                setPage(
                  1,
                );
              }
            }
          />

          <select
            className={
              styles.select
            }
            value={
              view
            }
            onChange={
              (
                event,
              ) => {
                setView(
                  event
                    .target
                    .value,
                );
                setPage(
                  1,
                );
              }
            }
          >
            <option value="ALL">
              All
            </option>
            <option value="ON_CAMPUS">
              On campus
            </option>
            <option value="LATE">
              Late
            </option>
            <option value="NOT_ARRIVED">
              Not arrived
            </option>
            <option value="ABSENT">
              Absent
            </option>
            <option value="SIGNED_OUT">
              Signed out
            </option>
          </select>

          <button
            type="button"
            className={
              styles.secondaryButton
            }
            onClick={
              () =>
                void refreshToday()
            }
          >
            Refresh
          </button>
        </div>

        <div
          className={
            styles.tableWrap
          }
        >
          <table
            className={
              styles.table
            }
          >
            <thead>
              <tr>
                <th>
                  Student
                </th>
                <th>
                  Class
                </th>
                <th>
                  Presence
                </th>
                <th>
                  Arrival
                </th>
                <th>
                  Arrived
                </th>
                <th>
                  Signed out
                </th>
                {(canSuperviseAttendance || canManage) && (
                  <th>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data?.students
                .map(
                  (
                    student,
                  ) => (
                    <tr
                      key={
                        student.studentId
                      }
                    >
                      <td>
                        <span
                          className={
                            styles.studentName
                          }
                        >
                          {studentName(
                            student,
                          )}
                        </span>
                        <br />
                        <span
                          className={
                            styles.muted
                          }
                        >
                          {
                            student.casaStudentId
                          }
                        </span>
                      </td>
                      <td>
                        {
                          student.classLevelName
                        }{" "}
                        {
                          student.classArmName
                        }
                      </td>
                      <td>
                        {
                          student.presenceStatus
                        }
                      </td>
                      <td>
                        {
                          student.arrivalStatus ??
                          "—"
                        }
                      </td>
                      <td>
                        {formatTime(
                          student.recordedAt,
                        )}
                      </td>
                      <td>
                        {formatTime(
                          student.checkedOutAt,
                        )}
                      </td>
                      {(canSuperviseAttendance || canManage) && (
                        <td>
                          <div className={styles.actions}>
                            {canManage && selectedBranchId && (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={historyBusy}
                                onClick={() => void openStudentHistory(student)}
                              >
                                History
                              </button>
                            )}

                            {canSuperviseAttendance &&
                              !data?.readOnly &&
                              data?.session?.mode === "INSTRUCTIONAL" &&
                              student.presenceStatus === "ON_CAMPUS" &&
                              data?.session?.status === "CLOSED" && (
                                <label className={styles.actions}>
                                  <input
                                    type="checkbox"
                                    disabled={busy || !selectedBranchId}
                                    checked={selectedLateStudentIds.includes(student.studentId)}
                                    onChange={(event) => {
                                      setSelectedLateStudentIds((current) =>
                                        event.target.checked
                                          ? Array.from(new Set([...current, student.studentId]))
                                          : current.filter((id) => id !== student.studentId),
                                      );
                                    }}
                                  />
                                  Late stay
                                </label>
                              )}

                            {canSuperviseAttendance &&
                              !data?.readOnly &&
                              data?.session?.mode === "INSTRUCTIONAL" &&
                              data?.session?.status === "OPEN" &&
                              student.presenceStatus === "ON_CAMPUS" &&
                              (student.earlyDeparturePreauthorized ? (
                                <span className="casa-status">Early departure authorized</span>
                              ) : (
                                <label className={styles.actions}>
                                  <input
                                    type="checkbox"
                                    disabled={busy || !selectedBranchId}
                                    checked={selectedEarlyStudentIds.includes(student.studentId)}
                                    onChange={(event) => {
                                      setSelectedEarlyStudentIds((current) =>
                                        event.target.checked
                                          ? Array.from(new Set([...current, student.studentId]))
                                          : current.filter((id) => id !== student.studentId),
                                      );
                                    }}
                                  />
                                  Early departure
                                </label>
                              ))}

                            {canSuperviseAttendance &&
                              !data?.readOnly &&
                              data?.session?.mode === "INSTRUCTIONAL" &&
                              data?.session?.status === "OPEN" &&
                              (student.presenceStatus === "NOT_ARRIVED" || student.presenceStatus === "ABSENT") && (
                                <>
                                  {student.firstCardPendingHandover && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      disabled={busy}
                                      onClick={() => setPendingConfirm({ kind: "FIRST_CARD", student })}
                                    >
                                      First-card face
                                    </button>
                                  )}
                                  {student.cardReplacement && (
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      disabled={busy}
                                      onClick={() => setPendingConfirm({ kind: "CARD_REPLACEMENT", student })}
                                    >
                                      {student.cardReplacement.replacementRequested
                                        ? "Lost-card face - replacement pending"
                                        : "Lost-card face - 3-day grace"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={busy}
                                    onClick={() => setPendingInput({ kind: "SUPERVISED_LATE", student })}
                                  >
                                    Record late
                                  </button>
                                </>
                              )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}

              {data &&
                data.students
                  .length ===
                  0 && (
                <tr>
                  <td
                    colSpan={
                      (canSuperviseAttendance || canManage) ? 7 : 6
                    }
                  >
                    No students match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {historyStudent && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>
                  {studentName(historyStudent)} · Attendance history
                </h3>
                <span className={styles.muted}>
                  {historyData
                    ? `${historyData.period.academicSessionName}${historyData.period.academicTermName ? ` · ${historyData.period.academicTermName}` : ""}`
                    : "Loading history..."}
                </span>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setHistoryStudent(null);
                  setHistoryData(null);
                }}
              >
                Close history
              </button>
            </div>

            {historyBusy && <p className={styles.muted}>Loading attendance history...</p>}

            {historyData && (
              <>
                <div className={styles.filters}>
                  <span className="casa-status">Attendance {historyData.attendancePercentage ?? "—"}%</span>
                  <span className="casa-status">Punctuality {historyData.punctualityPercentage ?? "—"}%</span>
                  <span className="casa-status">Early departures {historyData.earlyDepartures}</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Class</th>
                        <th>Status</th>
                        <th>Arrival</th>
                        <th>Arrived</th>
                        <th>Signed out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.trend.slice().reverse().map((entry) => (
                        <tr key={entry.date}>
                          <td>{entry.date}</td>
                          <td>{entry.className || "—"}</td>
                          <td>{entry.status}</td>
                          <td>{entry.actualArrivalStatus ?? "—"}</td>
                          <td>{formatTime(entry.recordedAt)}</td>
                          <td>{formatTime(entry.checkedOutAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {data &&
          data.page.pages >
            1 && (
          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className={
                styles.secondaryButton
              }
              disabled={
                page <= 1
              }
              onClick={
                () =>
                  setPage(
                    (
                      current,
                    ) =>
                      Math.max(
                        1,
                        current -
                          1,
                      ),
                  )
              }
            >
              Previous
            </button>

            <span
              className={
                styles.muted
              }
            >
              Page {
                data.page.number
              } of {
                data.page.pages
              }
            </span>

            <button
              type="button"
              className={
                styles.secondaryButton
              }
              disabled={
                page >=
                data.page.pages
              }
              onClick={
                () =>
                  setPage(
                    (
                      current,
                    ) =>
                      Math.min(
                        data.page.pages,
                        current +
                          1,
                      ),
                  )
              }
            >
              Next
            </button>
          </div>
        )}
      </section>

      {canManage && (
        <section
          className={
            styles.section
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <h2
              className={
                styles.sectionTitle
              }
            >
              Attendance policy
            </h2>
            <span
              className={
                styles.muted
              }
            >
              New version only — historical days remain intact.
            </span>
          </div>

          <div
            className={
              styles.policyForm
            }
          >
            <input
              className={
                styles.input
              }
              value={
                policyName
              }
              onChange={
                (
                  event,
                ) =>
                  setPolicyName(
                    event
                      .target
                      .value,
                  )
              }
              placeholder="Policy name"
            />

            <div
              className={
                styles.weekdays
              }
            >
              {[
                1,
                2,
                3,
                4,
                5,
                0,
              ].map(
                (
                  weekday,
                ) => (
                  <label
                    key={
                      weekday
                    }
                    className={
                      styles.checkbox
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedWeekdays.includes(
                          weekday,
                        )
                      }
                      onChange={
                        (
                          event,
                        ) =>
                          setSelectedWeekdays(
                            (
                              current,
                            ) =>
                              event
                                .target
                                .checked
                                ? [
                                    ...current,
                                    weekday,
                                  ]
                                : current.filter(
                                    (
                                      value,
                                    ) =>
                                      value !==
                                      weekday,
                                  ),
                          )
                      }
                    />
                    {
                      weekdayLabels[
                        weekday
                      ]
                    }
                  </label>
                ),
              )}
            </div>

            <div className="mt-4 grid gap-4">
              <div className="border border-black bg-[#f7f7f3] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <strong className="block">
                      Saturday lessons
                    </strong>
                    <p className={styles.muted}>
                      Choose whether Saturday is part of the normal school attendance week.
                    </p>
                  </div>
                  <strong>
                    {selectedWeekdays.includes(6)
                      ? "ON"
                      : "OFF"}
                  </strong>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={styles.button}
                    aria-pressed={
                      selectedWeekdays.includes(
                        6,
                      )
                    }
                    onClick={() =>
                      setSelectedWeekdays(
                        (
                          current,
                        ) =>
                          current.includes(
                            6,
                          )
                            ? current
                            : [
                                ...current,
                                6,
                              ],
                      )
                    }
                  >
                    There is lesson on Saturday
                  </button>

                  <button
                    type="button"
                    className={styles.button}
                    aria-pressed={
                      !selectedWeekdays.includes(
                        6,
                      )
                    }
                    onClick={() =>
                      setSelectedWeekdays(
                        (
                          current,
                        ) =>
                          current.filter(
                            (
                              weekday,
                            ) =>
                              weekday !==
                              6,
                          ),
                      )
                    }
                  >
                    No lesson on Saturday
                  </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-black/50">
                  When Saturday is ON, its own check-in, on-time, check-in close, dismissal and sign-out close times appear below. When Saturday is OFF, Saturday is not an instructional day and students are not expected for attendance.
                </p>
              </div>

              {[...selectedWeekdays]
                .sort(
                  (
                    left,
                    right,
                  ) => {
                    const order = [
                      1,
                      2,
                      3,
                      4,
                      5,
                      6,
                      0,
                    ];

                    return (
                      order.indexOf(
                        left,
                      ) -
                      order.indexOf(
                        right,
                      )
                    );
                  },
                )
                .map(
                  (
                    weekday,
                  ) => {
                    const schedule =
                      dayTimes[
                        weekday
                      ] ??
                      defaultAttendanceDayTimes;

                    return (
                      <div
                        key={
                          weekday
                        }
                        className="border border-black/15 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>
                            {
                              weekdayLabels[
                                weekday
                              ]
                            }
                          </strong>
                          <span className={styles.muted}>
                            Instructional day
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          {(
                            [
                              [
                                "checkInOpensAt",
                                "Check-in opens",
                              ],
                              [
                                "onTimeUntil",
                                "On-time until",
                              ],
                              [
                                "checkInClosesAt",
                                "Check-in closes",
                              ],
                              [
                                "normalDismissalAt",
                                "Normal dismissal",
                              ],
                              [
                                "checkOutClosesAt",
                                "Sign-out closes",
                              ],
                            ] as const
                          ).map(
                            (
                              [
                                key,
                                label,
                              ],
                            ) => (
                              <label
                                key={
                                  key
                                }
                              >
                                <span className={styles.muted}>
                                  {label}
                                </span>
                                <input
                                  className={styles.input}
                                  type="time"
                                  value={
                                    schedule[
                                      key
                                    ]
                                  }
                                  onChange={
                                    (
                                      event,
                                    ) =>
                                      setDayTimes(
                                        (
                                          current,
                                        ) => ({
                                          ...current,
                                          [weekday]:
                                            {
                                              ...(
                                                current[
                                                  weekday
                                                ] ??
                                                defaultAttendanceDayTimes
                                              ),
                                              [key]:
                                                event
                                                  .target
                                                  .value,
                                            },
                                        }),
                                      )
                                  }
                                />
                              </label>
                            ),
                          )}
                        </div>
                      </div>
                    );
                  },
                )}

              {selectedWeekdays.length === 0 ? (
                <p className={styles.muted}>
                  Select at least one instructional weekday. Leave Saturday unchecked when Saturday is normally closed.
                </p>
              ) : null}

              <p className={styles.muted}>
                Each selected weekday has its own attendance times. Each instructional weekday has its own attendance times. Use the Saturday Lessons control above to turn normal Saturday attendance on or off. Calendar remains for exceptional dates such as holidays, breaks, branch closures or a Special non-instructional day.
              </p>
            </div>

            <button
              type="button"
              className={
                styles.button
              }
              disabled={
                busy
              }
              onClick={
                () =>
                  void createPolicy()
              }
            >
              Create new default policy
            </button>

            {defaultPolicy && (
              <p
                className={
                  styles.muted
                }
              >
                Current default:{" "}
                <strong>
                  {
                    defaultPolicy.name
                  }
                </strong>
              </p>
            )}
          </div>
        </section>
      )}

      <CasaConfirmDialog
        open={pendingConfirm !== null}
        title={
          pendingConfirm?.kind === "CARD_REPLACEMENT"
            ? "Record lost-card attendance?"
            : "Record first-card attendance?"
        }
        message={
          pendingConfirm?.kind === "CARD_REPLACEMENT"
            ? `Confirm that ${studentName(pendingConfirm.student)} is physically present and their face matches the existing enrolled biometric profile. CASA will enforce the three-instructional-day grace rule unless a formal replacement request already exists.`
            : pendingConfirm?.kind === "FIRST_CARD"
              ? `Confirm that ${studentName(pendingConfirm.student)} is physically present and their face matches the existing enrolled biometric profile.`
              : ""
        }
        confirmLabel="Record attendance"
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const pending = pendingConfirm;
          setPendingConfirm(null);

          if (pending?.kind === "FIRST_CARD") {
            void recordFirstCardException(
              pending.student,
            );
          } else if (pending?.kind === "CARD_REPLACEMENT") {
            void recordCardReplacementException(
              pending.student,
            );
          }
        }}
      />

      <CasaInputDialog
        open={pendingInput !== null}
        title={pendingInput?.kind === "SUPERVISED_LATE" ? "Record supervised late arrival" : pendingInput?.kind === "REOPEN" ? "Reopen attendance session" : "Use current attendance policy"}
        message={pendingInput?.kind === "SUPERVISED_LATE" ? `Enter the reason ${studentName(pendingInput.student)} arrived after the normal check-in window.` : pendingInput?.kind === "REOPEN" ? "Explain why today's attendance session needs to be reopened. This reason stays in the audit history." : "Explain why today's open attendance session should use the current default policy. The reason and Passkey authorization stay in the audit history."}
        label="Reason"
        initialValue={pendingInput?.kind === "SUPERVISED_LATE" ? "Arrived after the normal check-in window" : pendingInput?.kind === "REOPEN" ? "Closed accidentally" : "Use corrected current attendance schedule"}
        minLength={pendingInput?.kind === "SUPERVISED_LATE" ? 3 : 8}
        maxLength={240}
        confirmLabel={pendingInput?.kind === "SUPERVISED_LATE" ? "Record late arrival" : pendingInput?.kind === "REOPEN" ? "Continue to reopen" : "Continue"}
        busy={busy}
        onCancel={() => setPendingInput(null)}
        onConfirm={(reason) => {
          const pending = pendingInput;
          setPendingInput(null);
          if (pending?.kind === "SUPERVISED_LATE") {
            void recordSupervisedLate(pending.student, reason);
          } else if (pending?.kind === "REOPEN") {
            void mutateSession("REOPEN", reason);
          } else if (pending?.kind === "REBIND") {
            void rebindSessionPolicy(reason);
          }
        }}
      />
    </main>
  );
}
