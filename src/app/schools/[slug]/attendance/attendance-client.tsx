"use client";

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
    return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
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
  }: {
    slug: string;
    schoolName: string;
    canManage: boolean;
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

        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/today?${params.toString()}`,
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

        setPolicies(
          body.policies ??
            [],
        );
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
            void refreshPolicies();
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

  async function mutateSession(
    action:
      | "OPEN"
      | "CLOSE",
  ) {
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
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                action,
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
            "Attendance session action failed.",
        );
      }

      setNotice(
        action ===
          "OPEN"
          ? "Attendance is open."
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
        <h1
          className={
            styles.brand
          }
        >
          TODAY
          <br />
          ATTENDANCE
        </h1>

        <div
          className={
            styles.school
          }
        >
          <strong>
            {schoolName}
          </strong>
          <br />
          {
            data?.clock
              .date ??
            "Loading dateÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"
          }
          {" Ãƒâ€šÃ‚Â· "}
          {
            data?.clock
              .clock ??
            "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"
          }
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
                  busy
                }
                onClick={
                  () =>
                    void mutateSession(
                      "OPEN",
                    )
                }
              >
                Open today
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
                      Authorized ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â waiting for face verification.
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
                          "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"
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
                      6
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
              New version only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â historical days remain intact.
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