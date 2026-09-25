"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type TeacherClass = {
  assignmentId?: string;
  assignment_id?: string;
  academicSessionId?: string;
  academic_session_id?: string;
  academicSessionName?: string;
  academic_session_name?: string;
  classArmId?: string;
  class_arm_id?: string;
  classArmName?: string;
  class_arm_name?: string;
  classLevelName?: string;
  class_level_name?: string;
  branchName?: string;
  branch_name?: string;
  sectionName?: string;
  section_name?: string;
  activeStudentCount?: number;
  active_student_count?: number;
};

type StudentRow = {
  studentId: string;
  casaStudentId: string;
  admissionNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  presenceStatus: string;
  arrivalStatus: string | null;
  recordedAt: string | null;
  checkedOutAt: string | null;
  departureResult: string | null;
};

type TodayBody = {
  message?: string;
  summary?: Record<string, number>;
  students?: StudentRow[];
};

type JsonBody = {
  message?: string;
  classes?: TeacherClass[];
};

function value(
  item:
    TeacherClass,
  camel:
    keyof TeacherClass,
  snake:
    keyof TeacherClass,
) {
  return (
    item[camel] ??
    item[snake] ??
    ""
  );
}

export default function MyClassClient(
  {
    slug,
    schoolName,
    staffName,
  }: {
    slug:
      string;
    schoolName:
      string;
    staffName:
      string;
  },
) {
  const [
    classes,
    setClasses,
  ] =
    useState<TeacherClass[]>(
      [],
    );

  const [
    selectedId,
    setSelectedId,
  ] =
    useState("");

  const [
    today,
    setToday,
  ] =
    useState<TodayBody | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const base =
    `/api/schools/${encodeURIComponent(
      slug,
    )}/teacher`;

  async function signOut() {
    await fetch(
      "/api/auth/logout",
      {
        method:
          "POST",
        credentials:
          "same-origin",
      },
    );

    window.location.assign(
      `/login?school=${encodeURIComponent(
        slug,
      )}`,
    );
  }

  const selected =
    useMemo(
      () =>
        classes.find(
          (
            item,
          ) =>
            String(
              value(
                item,
                "classArmId",
                "class_arm_id",
              ),
            ) ===
            selectedId,
        ) ??
        null,
      [
        classes,
        selectedId,
      ],
    );

  const loadClasses =
    useCallback(
      async () => {
        setLoading(
          true,
        );
        setError(
          "",
        );

        try {
          const response =
            await fetch(
              `${base}/classes`,
              {
                cache:
                  "no-store",
              },
            );

          const body =
            (await response
              .json()
              .catch(
                () =>
                  ({}),
              )) as JsonBody;

          if (!response.ok) {
            throw new Error(
              body.message ??
                "Unable to load your classes.",
            );
          }

          const next =
            body.classes ??
            [];

          setClasses(
            next,
          );

          if (
            next.length >
            0
          ) {
            setSelectedId(
              String(
                value(
                  next[0],
                  "classArmId",
                  "class_arm_id",
                ),
              ),
            );
          }
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load your classes.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        base,
      ],
    );

  useEffect(
    () => {
      const frame =
        window.requestAnimationFrame(
          () => {
            void loadClasses();
          },
        );

      return () => {
        window.cancelAnimationFrame(
          frame,
        );
      };
    },
    [
      loadClasses,
    ],
  );

  useEffect(
    () => {
      let cancelled =
        false;

      if (!selectedId) {
        return () => {
          cancelled =
            true;
        };
      }

      async function loadToday() {
        try {
          const response =
            await fetch(
              `${base}/classes/${encodeURIComponent(
                selectedId,
              )}/attendance/today`,
              {
                cache:
                  "no-store",
              },
            );

          const body =
            (await response
              .json()
              .catch(
                () =>
                  ({}),
              )) as TodayBody;

          if (!response.ok) {
            throw new Error(
              body.message ??
                "Unable to load today's class attendance.",
            );
          }

          if (!cancelled) {
            setToday(
              body,
            );
          }
        } catch (error) {
          if (!cancelled) {
            setError(
              error instanceof Error
                ? error.message
                : "Unable to load today's class attendance.",
            );
          }
        }
      }

      const frame =
        window.requestAnimationFrame(
          () => {
            void loadToday();
          },
        );

      return () => {
        cancelled =
          true;
        window.cancelAnimationFrame(
          frame,
        );
      };
    },
    [
      base,
      selectedId,
    ],
  );

  const summary =
    today?.summary ??
    {};

  const students =
    today?.students ??
    [];

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="casa-container min-h-screen bg-white px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
        <header className="grid gap-7 border-b border-black pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-4">
              <span className="casa-kicker">CASA</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">My Class</span>
            </div>
            <h1 className="mt-3 max-w-[9ch] text-6xl font-semibold tracking-[-0.065em] sm:text-8xl">
              Today with your students.
            </h1>
            <p className="mt-5 text-sm text-black/50">
              {staffName} · {schoolName}
            </p>
          </div>

          <nav className="flex flex-wrap gap-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
            <Link
              href="/security/passkeys"
              className="border-b border-black"
            >
              Account security
            </Link>
            <button
              type="button"
              className="border-b border-black"
              onClick={() =>
                void signOut()
              }
            >
              Sign out
            </button>
          </nav>
        </header>

        {error ? (
          <div
            className="casa-error mt-6"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <section className="mt-9 grid gap-8 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,1fr)]">
          <aside className="border-t border-black pt-4">
            <p className="casa-kicker text-black/45">
              Assigned classes
            </p>

            {loading ? (
              <p className="mt-5 text-sm text-black/45">
                Loading assignments...
              </p>
            ) : classes.length ===
              0 ? (
              <p className="mt-5 text-sm leading-6 text-black/45">
                No active class assignment. Ask an Owner or Admin to assign your Staff identity.
              </p>
            ) : (
              <div className="mt-4 grid gap-px bg-black">
                {classes.map(
                  (
                    item,
                  ) => {
                    const id =
                      String(
                        value(
                          item,
                          "classArmId",
                          "class_arm_id",
                        ),
                      );

                    const arm =
                      String(
                        value(
                          item,
                          "classArmName",
                          "class_arm_name",
                        ),
                      );

                    const level =
                      String(
                        value(
                          item,
                          "classLevelName",
                          "class_level_name",
                        ),
                      );

                    return (
                      <button
                        key={
                          id
                        }
                        type="button"
                        onClick={() =>
                          setSelectedId(
                            id,
                          )
                        }
                        className={`min-h-20 p-4 text-left ${
                          selectedId ===
                          id
                            ? "bg-black text-white"
                            : "bg-[var(--casa-paper)] text-black"
                        }`}
                      >
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] opacity-55">
                          {String(
                            value(
                              item,
                              "academicSessionName",
                              "academic_session_name",
                            ),
                          )}
                        </span>
                        <span className="mt-2 block text-xl font-semibold tracking-[-0.025em]">
                          {level
                            ? `${level} / `
                            : ""}
                          {arm}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </aside>

          <div>
            {selected ? (
              <>
                <div className="border-t border-black pt-4">
                  <p className="casa-kicker text-black/45">
                    Live class view
                  </p>
                  <h2 className="mt-3 text-5xl font-semibold tracking-[-0.055em]">
                    {String(
                      value(
                        selected,
                        "classLevelName",
                        "class_level_name",
                      ),
                    )}{" "}
                    /{" "}
                    {String(
                      value(
                        selected,
                        "classArmName",
                        "class_arm_name",
                      ),
                    )}
                  </h2>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-px bg-black sm:grid-cols-4">
                  {[
                    [
                      "Expected",
                      summary.expected ??
                        students.length,
                    ],
                    [
                      "On campus",
                      summary.onCampus ??
                        0,
                    ],
                    [
                      "On time",
                      summary.onTime ??
                        0,
                    ],
                    [
                      "Late",
                      summary.late ??
                        0,
                    ],
                  ].map(
                    (
                      item,
                    ) => (
                      <article
                        key={
                          String(
                            item[0],
                          )
                        }
                        className="bg-[var(--casa-paper)] p-4"
                      >
                        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">
                          {item[0]}
                        </p>
                        <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                          {item[1]}
                        </p>
                      </article>
                    ),
                  )}
                </div>

                <div className="mt-8 border-t border-black">
                  <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-black py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">
                    <span>
                      Student
                    </span>
                    <span>
                      Today
                    </span>
                  </div>

                  {students.map(
                    (
                      student,
                    ) => (
                      <article
                        key={
                          student.studentId
                        }
                        className="grid grid-cols-[1fr_auto] gap-4 border-b border-black/20 py-4"
                      >
                        <div>
                          <p className="font-semibold">
                            {student.firstName}{" "}
                            {student.middleName
                              ? `${student.middleName} `
                              : ""}
                            {student.lastName}
                          </p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-black/40">
                            {student.casaStudentId}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
                            {student.presenceStatus}
                          </p>
                          <p className="mt-1 text-xs text-black/45">
                            {student.arrivalStatus ??
                              "Not recorded"}
                          </p>
                        </div>
                      </article>
                    ),
                  )}

                  {students.length ===
                  0 ? (
                    <p className="py-6 text-sm text-black/45">
                      No students are currently returned for this class.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
