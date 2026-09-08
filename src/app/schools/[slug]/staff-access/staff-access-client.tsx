"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type StaffRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string | null;
  membershipStatus: string;
  role: string;
  activePasskeys: number;
};

type AcademicOptions = {
  sessions: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  classArms: Array<{
    id: string;
    name: string;
    classLevelName: string;
  }>;
};

type Assignment = {
  id?: string;
  assignmentId?: string;
  assignment_id?: string;
  membershipId?: string;
  membership_id?: string;
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
  active?: boolean;
  is_active?: boolean;
};

type JsonBody = {
  message?: string;
  staff?: StaffRow[];
  sessions?: AcademicOptions["sessions"];
  classArms?: AcademicOptions["classArms"];
  assignments?: Assignment[];
  temporaryPassword?: string | null;
  reusedIdentity?: boolean;
};

export default function StaffAccessClient(
  {
    slug,
    schoolName,
    canCreateAdmin,
  }: {
    slug:
      string;
    schoolName:
      string;
    canCreateAdmin:
      boolean;
  },
) {
  const [
    staff,
    setStaff,
  ] =
    useState<StaffRow[]>(
      [],
    );

  const [
    academic,
    setAcademic,
  ] =
    useState<AcademicOptions>({
      sessions:
        [],
      classArms:
        [],
    });

  const [
    assignments,
    setAssignments,
  ] =
    useState<Assignment[]>(
      [],
    );

  const [
    fullName,
    setFullName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    role,
    setRole,
  ] =
    useState<
      "ADMIN" |
      "STAFF" |
      "SCHOOL_TECHNICIAN"
    >(
      "STAFF",
    );

  const [
    assignmentMembershipId,
    setAssignmentMembershipId,
  ] =
    useState("");

  const [
    sessionId,
    setSessionId,
  ] =
    useState("");

  const [
    classArmId,
    setClassArmId,
  ] =
    useState("");

  const [
    temporaryPassword,
    setTemporaryPassword,
  ] =
    useState<string | null>(
      null,
    );

  const [
    notice,
    setNotice,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const base =
    `/api/schools/${encodeURIComponent(
      slug,
    )}`;

  function assignmentValue(
    assignment:
      Assignment,
    camel:
      keyof Assignment,
    snake:
      keyof Assignment,
  ) {
    return (
      assignment[camel] ??
      assignment[snake] ??
      ""
    );
  }

  const load =
    useCallback(
      async () => {
        const [
          staffResponse,
          academicResponse,
          assignmentResponse,
        ] =
          await Promise.all([
            fetch(
              `${base}/staff-access`,
              {
                cache:
                  "no-store",
              },
            ),
            fetch(
              `${base}/registry/academic-options`,
              {
                cache:
                  "no-store",
              },
            ),
            fetch(
              `${base}/teacher-assignments`,
              {
                cache:
                  "no-store",
              },
            ),
          ]);

        const [
          staffBody,
          academicBody,
          assignmentBody,
        ] =
          (await Promise.all([
            staffResponse
              .json(),
            academicResponse
              .json(),
            assignmentResponse
              .json(),
          ])) as [
            JsonBody,
            JsonBody,
            JsonBody,
          ];

        if (
          !staffResponse.ok
        ) {
          throw new Error(
            staffBody.message ??
              "Unable to load staff.",
          );
        }

        if (
          !academicResponse.ok
        ) {
          throw new Error(
            academicBody.message ??
              "Unable to load academic options.",
          );
        }

        if (
          !assignmentResponse.ok
        ) {
          throw new Error(
            assignmentBody.message ??
              "Unable to load teacher assignments.",
          );
        }

        setStaff(
          staffBody.staff ??
            [],
        );

        setAcademic({
          sessions:
            academicBody.sessions ??
            [],
          classArms:
            academicBody.classArms ??
            [],
        });

        setAssignments(
          assignmentBody.assignments ??
            [],
        );
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
            load().catch(
              (
                error,
              ) => {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Unable to load Staff & Access.",
                );
              },
            );
          },
        );

      return () => {
        window.cancelAnimationFrame(
          frame,
        );
      };
    },
    [
      load,
    ],
  );

  const people =
    useMemo(
      () => {
        const byMembership =
          new Map<
            string,
            {
              membershipId:
                string;
              userId:
                string;
              fullName:
                string;
              email:
                string | null;
              membershipStatus:
                string;
              activePasskeys:
                number;
              roles:
                string[];
            }
          >();

        for (
          const row of
          staff
        ) {
          const existing =
            byMembership.get(
              row.membershipId,
            );

          if (existing) {
            if (
              !existing.roles.includes(
                row.role,
              )
            ) {
              existing.roles.push(
                row.role,
              );
            }
          } else {
            byMembership.set(
              row.membershipId,
              {
                membershipId:
                  row.membershipId,
                userId:
                  row.userId,
                fullName:
                  row.fullName,
                email:
                  row.email,
                membershipStatus:
                  row.membershipStatus,
                activePasskeys:
                  row.activePasskeys,
                roles: [
                  row.role,
                ],
              },
            );
          }
        }

        return [
          ...byMembership.values(),
        ];
      },
      [
        staff,
      ],
    );

  const teachers =
    people.filter(
      (
        person,
      ) =>
        person.roles.includes(
          "STAFF",
        ),
    );

  async function createStaff(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      "",
    );
    setNotice(
      "",
    );
    setTemporaryPassword(
      null,
    );
    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          `${base}/staff-access`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                fullName,
                email,
                role,
              }),
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
            "Unable to create staff access.",
        );
      }

      setTemporaryPassword(
        body.temporaryPassword ??
          null,
      );

      setNotice(
        body.message ??
          "Staff access created.",
      );

      setFullName(
        "",
      );
      setEmail(
        "",
      );

      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to create staff access.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function assignTeacher(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      "",
    );
    setNotice(
      "",
    );
    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          `${base}/teacher-assignments`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                membershipId:
                  assignmentMembershipId,
                academicSessionId:
                  sessionId,
                classArmId,
                active:
                  true,
              }),
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
            "Unable to assign this teacher.",
        );
      }

      setNotice(
        "Teacher assignment saved.",
      );

      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to assign this teacher.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function updateMembershipStatus(
    person: {
      membershipId:
        string;
      membershipStatus:
        string;
      roles:
        string[];
    },
  ) {
    setError(
      "",
    );
    setNotice(
      "",
    );
    setBusy(
      true,
    );

    try {
      const nextStatus =
        person.membershipStatus ===
          "ACTIVE"
          ? "SUSPENDED"
          : "ACTIVE";

      const response =
        await fetch(
          `${base}/staff-access/${encodeURIComponent(
            person.membershipId,
          )}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                status:
                  nextStatus,
              }),
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
            "Unable to update staff access.",
        );
      }

      setNotice(
        nextStatus ===
          "ACTIVE"
          ? "Staff access reactivated."
          : "Staff access suspended.",
      );

      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update staff access.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="casa-container min-h-screen bg-white px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
        <header className="grid gap-6 border-b border-black pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-4">
              <span className="casa-kicker">CASA</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">Staff & Access</span>
            </div>
            <h1 className="mt-3 max-w-[10ch] text-6xl font-semibold tracking-[-0.065em] sm:text-8xl">
              People who run the school.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-black/50">
              {schoolName}. Every person gets their own CASA identity. Never share an Admin account.
            </p>
          </div>

          <nav className="flex flex-wrap gap-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
            <Link
              href={`/schools/${encodeURIComponent(
                slug,
              )}/registry`}
              className="border-b border-black"
            >
              Registry
            </Link>
            <Link
              href="/security/passkeys"
              className="border-b border-black"
            >
              Security
            </Link>
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

        {notice ? (
          <div
            className="mt-6 border-l-2 border-[#176744] bg-[#e7f1eb] px-4 py-3 text-sm text-[#176744]"
            role="status"
          >
            {notice}
          </div>
        ) : null}

        {temporaryPassword ? (
          <section className="mt-6 border-2 border-black bg-black p-5 text-white">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/55">
              Show once / temporary password
            </p>
            <p className="mt-3 break-all font-mono text-lg font-semibold">
              {temporaryPassword}
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-white/60">
              Give this directly to the staff member. CASA will force them to replace it after first sign-in. It is not stored in readable form.
            </p>
          </section>
        ) : null}

        <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
          <section>
            <div className="flex items-end justify-between gap-4 border-b border-black pb-3">
              <div>
                <p className="casa-kicker text-black/45">
                  Active people
                </p>
                <h2 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">
                  {people.length} staff identities
                </h2>
              </div>
            </div>

            <div className="divide-y divide-black/20">
              {people.map(
                (
                  person,
                ) => (
                  <article
                    key={
                      person.membershipId
                    }
                    className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.025em]">
                        {person.fullName}
                      </h3>
                      <p className="mt-1 text-sm text-black/45">
                        {person.email ??
                          "No email"}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/55">
                        <p>
                          {person.roles.join(
                            " · ",
                          )}
                        </p>
                        <p className="mt-1">
                          {person.membershipStatus} · {person.activePasskeys} active Passkey{person.activePasskeys === 1 ? "" : "s"}
                        </p>
                      </div>

                      {!person.roles.includes(
                        "OWNER",
                      ) ? (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (
                              person.roles.includes(
                                "ADMIN",
                              ) &&
                              !canCreateAdmin
                            )
                          }
                          onClick={() =>
                            void updateMembershipStatus(
                              person,
                            )
                          }
                          className="mt-3 border-b border-black font-mono text-[9px] font-semibold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {person.membershipStatus ===
                          "ACTIVE"
                            ? "Suspend access"
                            : "Reactivate access"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>

          <aside>
            <form
              onSubmit={
                createStaff
              }
              className="border-t border-black pt-5"
            >
              <p className="casa-kicker text-black/45">
                Add staff member
              </p>

              <label className="casa-label mt-5">
                <span>
                  Full name
                </span>
                <input
                  required
                  value={
                    fullName
                  }
                  onChange={(
                    event,
                  ) =>
                    setFullName(
                      event
                        .target
                        .value,
                    )
                  }
                  className="casa-field"
                />
              </label>

              <label className="casa-label mt-4">
                <span>
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={
                    email
                  }
                  onChange={(
                    event,
                  ) =>
                    setEmail(
                      event
                        .target
                        .value,
                    )
                  }
                  className="casa-field"
                />
              </label>

              <label className="casa-label mt-4">
                <span>
                  School role
                </span>
                <select
                  value={
                    role
                  }
                  onChange={(
                    event,
                  ) =>
                    setRole(
                      event
                        .target
                        .value as
                        | "ADMIN"
                        | "STAFF"
                        | "SCHOOL_TECHNICIAN",
                    )
                  }
                  className="casa-field"
                >
                  {canCreateAdmin ? (
                    <option value="ADMIN">
                      School Admin
                    </option>
                  ) : null}
                  <option value="STAFF">
                    Teacher / Staff
                  </option>
                  <option value="SCHOOL_TECHNICIAN">
                    School Technician
                  </option>
                </select>
              </label>

              <button
                type="submit"
                disabled={
                  busy
                }
                className="casa-button mt-5 w-full"
              >
                Create access →
              </button>
            </form>

            <form
              onSubmit={
                assignTeacher
              }
              className="mt-10 border-t border-black pt-5"
            >
              <p className="casa-kicker text-black/45">
                Assign Teacher / My Class
              </p>

              <label className="casa-label mt-5">
                <span>
                  Teacher
                </span>
                <select
                  required
                  value={
                    assignmentMembershipId
                  }
                  onChange={(
                    event,
                  ) =>
                    setAssignmentMembershipId(
                      event
                        .target
                        .value,
                    )
                  }
                  className="casa-field"
                >
                  <option value="">
                    Select teacher
                  </option>
                  {teachers.map(
                    (
                      person,
                    ) => (
                      <option
                        key={
                          person.membershipId
                        }
                        value={
                          person.membershipId
                        }
                      >
                        {person.fullName}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="casa-label mt-4">
                <span>
                  Academic session
                </span>
                <select
                  required
                  value={
                    sessionId
                  }
                  onChange={(
                    event,
                  ) =>
                    setSessionId(
                      event
                        .target
                        .value,
                    )
                  }
                  className="casa-field"
                >
                  <option value="">
                    Select session
                  </option>
                  {academic.sessions.map(
                    (
                      session,
                    ) => (
                      <option
                        key={
                          session.id
                        }
                        value={
                          session.id
                        }
                      >
                        {session.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="casa-label mt-4">
                <span>
                  Class
                </span>
                <select
                  required
                  value={
                    classArmId
                  }
                  onChange={(
                    event,
                  ) =>
                    setClassArmId(
                      event
                        .target
                        .value,
                    )
                  }
                  className="casa-field"
                >
                  <option value="">
                    Select class
                  </option>
                  {academic.classArms.map(
                    (
                      arm,
                    ) => (
                      <option
                        key={
                          arm.id
                        }
                        value={
                          arm.id
                        }
                      >
                        {arm.classLevelName} / {arm.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <button
                type="submit"
                disabled={
                  busy ||
                  teachers.length ===
                    0
                }
                className="casa-button-secondary mt-5 w-full"
              >
                Assign class →
              </button>

              <p className="mt-3 text-xs leading-5 text-black/40">
                A Staff account becomes a Teacher only after an explicit class/session assignment.
              </p>
            </form>
          </aside>
        </div>

        <section className="mt-12 border-t border-black pt-5">
          <p className="casa-kicker text-black/45">
            Current teacher assignments
          </p>

          <div className="mt-4 grid gap-px bg-black sm:grid-cols-2 xl:grid-cols-3">
            {assignments.length >
            0 ? (
              assignments.map(
                (
                  assignment,
                  index,
                ) => (
                  <article
                    key={
                      String(
                        assignmentValue(
                          assignment,
                          "id",
                          "assignment_id",
                        ) ||
                          assignmentValue(
                            assignment,
                            "membershipId",
                            "membership_id",
                          ) ||
                          index,
                      )
                    }
                    className="bg-[var(--casa-paper)] p-4"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/45">
                      {String(
                        assignmentValue(
                          assignment,
                          "academicSessionName",
                          "academic_session_name",
                        ) ||
                          "Academic session",
                      )}
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {String(
                        assignmentValue(
                          assignment,
                          "classLevelName",
                          "class_level_name",
                        ),
                      )
                        ? `${String(
                            assignmentValue(
                              assignment,
                              "classLevelName",
                              "class_level_name",
                            ),
                          )} / `
                        : ""}
                      {String(
                        assignmentValue(
                          assignment,
                          "classArmName",
                          "class_arm_name",
                        ) ||
                          assignmentValue(
                            assignment,
                            "classArmId",
                            "class_arm_id",
                          ),
                      )}
                    </p>
                  </article>
                ),
              )
            ) : (
              <p className="bg-[var(--casa-paper)] p-5 text-sm text-black/45 sm:col-span-2 xl:col-span-3">
                No teacher assignments yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
