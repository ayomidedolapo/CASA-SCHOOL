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
  branchId: string | null;
  branchName: string | null;
  legacyUnassigned: boolean;
};

type BranchScope = {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
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
  branches?: BranchScope[];
  organizationAdmin?: boolean;
  reusedIdentity?: boolean;
  emailDelivery?: string;
  setup?: {
    url: string;
    expiresAt: string;
  } | null;
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
    branches,
    setBranches,
  ] =
    useState<BranchScope[]>(
      [],
    );

  const [
    selectedBranchId,
    setSelectedBranchId,
  ] =
    useState("");

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
    accessSetup,
    setAccessSetup,
  ] =
    useState<{
      name: string;
      url: string;
      expiresAt: string;
      emailDelivery: string;
    } | null>(
      null,
    );

  const [
    recovery,
    setRecovery,
  ] =
    useState<{
      name: string;
      url: string;
      expiresAt: string;
      emailDelivery: string;
    } | null>(
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

        const nextBranches =
          staffBody.branches ??
          [];
        setBranches(
          nextBranches,
        );
        setSelectedBranchId(
          (current) =>
            current &&
            nextBranches.some(
              (branch) =>
                branch.id ===
                current,
            )
              ? current
              : nextBranches[0]?.id ??
                "",
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
              branchNames:
                string[];
              legacyUnassigned:
                boolean;
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
            if (
              row.branchName &&
              !existing.branchNames.includes(
                row.branchName,
              )
            ) {
              existing.branchNames.push(
                row.branchName,
              );
            }
            existing.legacyUnassigned =
              existing.legacyUnassigned ||
              row.legacyUnassigned;
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
                branchNames:
                  row.branchName
                    ? [
                        row.branchName,
                      ]
                    : [],
                legacyUnassigned:
                  row.legacyUnassigned,
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
    setAccessSetup(
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
                branchId:
                  selectedBranchId,
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

      setAccessSetup(
        body.setup
          ? {
              name:
                fullName,
              url:
                body.setup.url,
              expiresAt:
                body.setup.expiresAt,
              emailDelivery:
                body.emailDelivery ??
                "UNKNOWN",
            }
          : null,
      );

      setNotice(
        body.message ??
          "Staff access created and email delivery attempted.",
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

  async function assignLegacyBranch(
    person: {
      membershipId: string;
      fullName: string;
    },
  ) {
    if (!selectedBranchId) {
      setError(
        "Select a campus first.",
      );
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);

    try {
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
                action:
                  "ASSIGN_BRANCH",
                branchId:
                  selectedBranchId,
              }),
          },
        );
      const body =
        (await response
          .json()
          .catch(
            () => ({}),
          )) as JsonBody;

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Unable to assign campus.",
        );
      }

      setNotice(
        `${person.fullName} was assigned to the selected campus.`,
      );
      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to assign campus.",
      );
    } finally {
      setBusy(false);
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
                action:
                  "SET_STATUS",
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

  async function createRecovery(
    person: {
      membershipId: string;
      fullName: string;
      roles: string[];
    },
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    setRecovery(null);

    try {
      const response =
        await fetch(
          `${base}/staff-access/${encodeURIComponent(
            person.membershipId,
          )}/recovery`,
          {
            method: "POST",
          },
        );

      const body =
        (await response
          .json()
          .catch(() => ({}))) as {
          message?: string;
          setup?: {
            url: string;
            expiresAt: string;
          };
          emailDelivery?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Recovery link could not be created.",
        );
      }

      if (!body.setup) {
        throw new Error(
          "CASA did not return a recovery link.",
        );
      }

      setRecovery({
        name: person.fullName,
        url: body.setup.url,
        expiresAt: body.setup.expiresAt,
        emailDelivery:
          body.emailDelivery ??
          "UNKNOWN",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Recovery link could not be created.",
      );
    } finally {
      setBusy(false);
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

        {accessSetup ? (
          <div
            className="mt-6 border-l-2 border-black bg-black/5 px-4 py-3 text-sm"
            role="status"
          >
            <strong>
              Account setup / {accessSetup.name}
            </strong>
            <p className="mt-2 text-xs text-black/55">
              Email delivery: {accessSetup.emailDelivery}
            </p>
            <p className="mt-2 break-all font-mono text-xs">
              {accessSetup.url}
            </p>
            <p className="mt-2 text-xs text-black/55">
              Private fallback copy. CASA emails this setup link automatically when Gmail delivery succeeds.
            </p>
          </div>
        ) : null}

        {recovery ? (
          <div
            className="mt-6 border-l-2 border-black bg-black/5 px-4 py-3 text-sm"
            role="status"
          >
            <strong>
              Password recovery / {recovery.name}
            </strong>
            <p className="mt-2 text-xs text-black/55">
              Email delivery: {recovery.emailDelivery}
            </p>
            <p className="mt-2 break-all font-mono text-xs">
              {recovery.url}
            </p>
            <p className="mt-2 text-xs text-black/55">
              Single-use link. Expires after 24 hours. Use this copy only if email delivery did not complete.
            </p>
          </div>
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
                        <p className="mt-1">
                          {person.branchNames.length > 0
                            ? person.branchNames.join(" · ")
                            : person.legacyUnassigned
                              ? "Needs campus assignment"
                              : "Organization-wide"}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3 sm:justify-end">
                        {person.legacyUnassigned &&
                        selectedBranchId ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void assignLegacyBranch(
                                person,
                              )
                            }
                            className="border border-black/25 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Assign to{" "}
                            {
                              branches.find(
                                (branch) =>
                                  branch.id ===
                                  selectedBranchId,
                              )?.name ??
                              "campus"
                            }
                          </button>
                        ) : null}

                        {!person.roles.includes(
                          "OWNER",
                        ) &&
                        (
                          !person.roles.includes(
                            "ADMIN",
                          ) ||
                          canCreateAdmin
                        ) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void createRecovery(
                                person,
                              )
                            }
                            className="border border-black/25 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Password recovery
                          </button>
                        ) : null}

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
                            className="border border-black/25 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {person.membershipStatus ===
                            "ACTIVE"
                              ? "Suspend access"
                              : "Reactivate access"}
                          </button>
                        ) : null}
                      </div>
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
                  Campus
                </span>
                <select
                  required
                  value={
                    selectedBranchId
                  }
                  onChange={(
                    event,
                  ) =>
                    setSelectedBranchId(
                      event.target.value,
                    )
                  }
                  className="casa-field"
                >
                  {branches.map(
                    (branch) => (
                      <option
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {branch.name}
                        {branch.isHeadquarters
                          ? " · HQ"
                          : ""}
                      </option>
                    ),
                  )}
                </select>
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
                  busy ||
                  !selectedBranchId
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
