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

import styles from "./attendance.module.css";

interface TodayStudent {
  studentId: string;
  casaStudentId: string;
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
}

interface TodayData {
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

const weekdayLabels = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

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
    canViewOrganization,
    canSuperviseAttendance,
    branches,
  }: {
    slug: string;
    schoolName: string;
    canManage: boolean;
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
    selectedBranchId,
    setSelectedBranchId,
  ] =
    useState(
      canViewOrganization
        ? ""
        : branches[0]?.id ?? "",
    );

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
    times,
    setTimes,
  ] =
    useState({
      checkInOpensAt:
        "07:00",
      onTimeUntil:
        "07:45",
      checkInClosesAt:
        "09:00",
      normalDismissalAt:
        "14:00",
      checkOutClosesAt:
        "17:00",
    });

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
      ],
    );

  const refreshPolicies =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
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

          const representativeDay =
            orderedDays[0];

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

          setTimes({
            checkInOpensAt:
              normalizeTime(
                representativeDay
                  .checkInOpensAt,
              ),
            onTimeUntil:
              normalizeTime(
                representativeDay
                  .onTimeUntil,
              ),
            checkInClosesAt:
              normalizeTime(
                representativeDay
                  .checkInClosesAt,
              ),
            normalDismissalAt:
              normalizeTime(
                representativeDay
                  .normalDismissalAt,
              ),
            checkOutClosesAt:
              normalizeTime(
                representativeDay
                  .checkOutClosesAt,
              ),
          });
        }
      },
      [
        slug,
      ],
    );

  useEffect(
    () => {
      const initialTimer =
        window.setTimeout(
          () => {
            void refreshToday();
            if (canManage) {
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
      refreshPolicies,
      canManage,
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

  async function recordFirstCardException(
    student: TodayStudent,
  ) {
    if (
      !window.confirm(
        `Confirm that ${studentName(student)} is physically present and their face matches the existing enrolled biometric profile.`,
      )
    ) {
      return;
    }

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

  async function recordSupervisedLate(
    student: TodayStudent,
  ) {
    const entered = window.prompt(
      `Reason for supervised late arrival for ${studentName(student)}:`,
      "Arrived after the normal check-in window",
    );

    if (entered === null) {
      return;
    }

    const reason = entered.trim();
    if (reason.length < 3 || reason.length > 240) {
      setError(
        "Enter a supervised late-arrival reason between 3 and 240 characters.",
      );
      return;
    }

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
      | "OPEN"
      | "CLOSE"
      | "REOPEN",
  ) {
    let reason:
      string | null =
        null;

    if (
      action ===
        "REOPEN"
    ) {
      const entered =
        window.prompt(
          "Why are you reopening today's attendance session? This reason is kept in the audit history.",
          "Closed accidentally",
        );

      if (entered === null) {
        return;
      }

      reason =
        entered.trim();

      if (
        reason.length <
          8 ||
        reason.length >
          240
      ) {
        setError(
          "Enter a reopen reason between 8 and 240 characters.",
        );
        return;
      }
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
          body.code ??
            body.message ??
            "Attendance session action failed.",
        );
      }

      setNotice(
        action ===
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

  async function rebindSessionPolicy() {
    const entered =
      window.prompt(
        "Why should today's open attendance session use the current default policy? The reason and Passkey authorization are kept in the audit history.",
        "Use corrected current attendance schedule",
      );

    if (entered === null) {
      return;
    }

    const reason =
      entered.trim();

    if (
      reason.length <
        8 ||
      reason.length >
        240
    ) {
      setError(
        "Enter a policy correction reason between 8 and 240 characters.",
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
            "ATTENDANCE_SESSION_POLICY_REBIND",
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
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
            if (
        !defaultPolicy ||
        !Number.isInteger(
          defaultPolicy
            .schoolBusGraceMinutes,
        ) ||
        !Number.isInteger(
          defaultPolicy
            .independentGraceMinutes,
        ) ||
        defaultPolicy
          .schoolBusGraceMinutes <
          0 ||
        defaultPolicy
          .schoolBusGraceMinutes >
          240 ||
        defaultPolicy
          .independentGraceMinutes <
          0 ||
        defaultPolicy
          .independentGraceMinutes >
          240
      ) {
        throw new Error(
          "Current attendance grace settings are unavailable. Refresh Attendance before creating a schedule revision.",
        );
      }

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
                schoolBusGraceMinutes:
                  defaultPolicy
                    .schoolBusGraceMinutes,
                independentGraceMinutes:
                  defaultPolicy
                    .independentGraceMinutes,
                days:
                  selectedWeekdays.map(
                    (
                      weekday,
                    ) => ({
                      weekday,
                      ...times,
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
            TODAY
            <br />
            ATTENDANCE
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
            {canManage ? (
              <Link
                className={styles.headerLink}
                href={`/schools/${encodeURIComponent(slug)}/attendance/transport`}
              >
                Transport &amp; grace
              </Link>
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
        <span
          className={
            styles.status
          }
        >
          {data?.session
            ?.status ??
            "NO SESSION"}
        </span>

        <span
          className={
            styles.muted
          }
        >
          {defaultPolicy
            ? `Policy: ${defaultPolicy.name}`
            : "No default attendance policy"}
        </span>

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

        {canManage && (
          <div
            className={
              styles.actions
            }
          >
            {data?.session
              ?.status !==
              "OPEN" ? (
              <button
                type="button"
                className={
                  styles.button
                }
                disabled={
                  busy ||
                  data?.session?.status ===
                    "CANCELLED"
                }
                onClick={
                  () =>
                    void mutateSession(
                      data?.session?.status ===
                        "CLOSED"
                        ? "REOPEN"
                        : "OPEN",
                    )
                }
              >
                {data?.session?.status ===
                "CLOSED"
                  ? "Reopen today"
                  : data?.session?.status ===
                      "CANCELLED"
                    ? "Session cancelled"
                    : "Open today"}
              </button>
            ) : (
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
                    void mutateSession(
                      "CLOSE",
                    )
                }
              >
                Close today
              </button>
            )}
            {data?.session?.status ===
              "OPEN" && (
              <button
                type="button"
                onClick={() =>
                  void rebindSessionPolicy()
                }
                disabled={
                  busy
                }
                className={
                  styles.button
                }
              >
                Use current policy
              </button>
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

      {canManage &&
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
          {(canViewOrganization || branches.length > 1) && (
            <select
              className={styles.select}
              value={selectedBranchId}
              onChange={(event) => {
                setSelectedBranchId(event.target.value);
                setPage(1);
              }}
            >
              {canViewOrganization && (
                <option value="">Organization-wide</option>
              )}
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
                {canSuperviseAttendance && (
                  <th>
                    Supervised action
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
                      {canSuperviseAttendance && (
                        <td>
                          {student.presenceStatus === "NOT_ARRIVED" ||
                          student.presenceStatus === "ABSENT" ? (
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={busy}
                                onClick={() =>
                                  void recordFirstCardException(student)
                                }
                              >
                                First-card face
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={busy}
                                onClick={() =>
                                  void recordSupervisedLate(student)
                                }
                              >
                                Record late
                              </button>
                            </div>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
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
                      canSuperviseAttendance ? 7 : 6
                    }
                  >
                    No students match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
                styles.policyTimes
              }
            >
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
                    <span
                      className={
                        styles.muted
                      }
                    >
                      {label}
                    </span>
                    <input
                      className={
                        styles.input
                      }
                      type="time"
                      value={
                        times[
                          key
                        ]
                      }
                      onChange={
                        (
                          event,
                        ) =>
                          setTimes(
                            (
                              current,
                            ) => ({
                              ...current,
                              [key]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                      }
                    />
                  </label>
                ),
              )}
            </div>

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
                6,
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
    </main>
  );
}
