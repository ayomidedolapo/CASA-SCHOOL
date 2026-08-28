"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { StudentCards } from "./student-cards";

interface RegistryClientProps {
  school: {
    slug: string;
    name: string;
  };
  user: {
    fullName: string;
  };
  roles: string[];
}

interface StudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string;
  sex:
    | "MALE"
    | "FEMALE"
    | "UNSPECIFIED";
  status: string;
  admissionDate: string;
  classArmName: string | null;
  classLevelName: string | null;
}

interface GuardianRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  membershipId: string | null;
}

interface StudentDetail {
  student: StudentRow & {
    exitDate?: string | null;
  };
  guardians: Array<{
    linkId: string;
    guardianId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    relationshipLabel: string;
    isPrimary: boolean;
    isEmergencyContact: boolean;
    pickupAuthorized: boolean;
    receivesNotifications: boolean;
  }>;
  enrollments: Array<{
    id: string;
    status: string;
    startsOn: string;
    endsOn: string | null;
    academicSessionName: string;
    classLevelName: string;
    classArmName: string;
  }>;
}

interface AcademicOptions {
  sessions: Array<{
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
  }>;
  classArms: Array<{
    id: string;
    name: string;
    classLevelId: string;
    classLevelName: string;
    sortOrder: number;
  }>;
}

type Tab =
  | "students"
  | "guardians";

export function RegistryClient({
  school,
  user,
  roles,
}: RegistryClientProps) {
  const router = useRouter();
  const [tab, setTab] =
    useState<Tab>("students");
  const [students, setStudents] =
    useState<StudentRow[]>([]);
  const [studentTotal, setStudentTotal] =
    useState(0);
  const [guardians, setGuardians] =
    useState<GuardianRow[]>([]);
  const [guardianTotal, setGuardianTotal] =
    useState(0);
  const [query, setQuery] =
    useState("");
  const [selectedStudentId, setSelectedStudentId] =
    useState<string | null>(null);
  const [studentDetail, setStudentDetail] =
    useState<StudentDetail | null>(null);
  const [academicOptions, setAcademicOptions] =
    useState<AcademicOptions>({
      sessions: [],
      classArms: [],
    });
  const [busy, setBusy] =
    useState(false);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const apiBase = useMemo(
    () =>
      `/api/schools/${encodeURIComponent(
        school.slug,
      )}/registry`,
    [school.slug],
  );

  const request = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit,
    ): Promise<T> => {
      const response = await fetch(
        `${apiBase}${path}`,
        {
          ...init,
          headers: {
            ...(init?.body
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),
            ...(init?.headers ?? {}),
          },
        },
      );

      const body =
        (await response.json()) as {
          message?: string;
        } & T;

      if (response.status === 401) {
        router.push(
          `/login?school=${encodeURIComponent(
            school.slug,
          )}`,
        );
        throw new Error(
          "Your session has ended.",
        );
      }

      if (!response.ok) {
        throw new Error(
          body.message ??
            "CASA School could not complete the request.",
        );
      }

      return body;
    },
    [apiBase, router, school.slug],
  );

  const loadStudents = useCallback(
    async () => {
      const body = await request<{
        students: StudentRow[];
        pagination: {
          total: number;
        };
      }>(
        `/students?q=${encodeURIComponent(
          query,
        )}`,
      );

      setStudents(body.students);
      setStudentTotal(
        body.pagination.total,
      );
    },
    [query, request],
  );

  const loadGuardians = useCallback(
    async () => {
      const body = await request<{
        guardians: GuardianRow[];
        total: number;
      }>(
        `/guardians?q=${encodeURIComponent(
          query,
        )}`,
      );

      setGuardians(
        body.guardians,
      );
      setGuardianTotal(body.total);
    },
    [query, request],
  );


  const loadStudentDetail =
    useCallback(
      async (studentId: string) => {
        const body =
          await request<StudentDetail>(
            `/students/${studentId}`,
          );

        setStudentDetail(body);
      },
      [request],
    );

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      request<{
        students: StudentRow[];
        pagination: {
          total: number;
        };
      }>(
        `/students?q=${encodeURIComponent(
          query,
        )}`,
      ),
      request<{
        guardians: GuardianRow[];
        total: number;
      }>(
        `/guardians?q=${encodeURIComponent(
          query,
        )}`,
      ),
    ])
      .then(
        ([
          studentBody,
          guardianBody,
        ]) => {
          if (cancelled) {
            return;
          }

          setStudents(
            studentBody.students,
          );
          setStudentTotal(
            studentBody.pagination.total,
          );
          setGuardians(
            guardianBody.guardians,
          );
          setGuardianTotal(
            guardianBody.total,
          );
        },
      )
      .catch(
        (cause: unknown) => {
          if (cancelled) {
            return;
          }

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the registry.",
          );
        },
      );

    return () => {
      cancelled = true;
    };
  }, [
    query,
    request,
  ]);

  useEffect(() => {
    let cancelled = false;

    void request<AcademicOptions>(
      "/academic-options",
    )
      .then((body) => {
        if (!cancelled) {
          setAcademicOptions(body);
        }
      })
      .catch(
        (cause: unknown) => {
          if (cancelled) {
            return;
          }

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load academic options.",
          );
        },
      );

    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    let cancelled = false;

    void request<StudentDetail>(
      `/students/${selectedStudentId}`,
    )
      .then((body) => {
        if (!cancelled) {
          setStudentDetail(body);
        }
      })
      .catch(
        (cause: unknown) => {
          if (cancelled) {
            return;
          }

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the student.",
          );
        },
      );

    return () => {
      cancelled = true;
    };
  }, [
    request,
    selectedStudentId,
  ]);

  async function refresh() {
    await Promise.all([
      loadStudents(),
      loadGuardians(),
    ]);

    if (selectedStudentId) {
      await loadStudentDetail(
        selectedStudentId,
      );
    }
  }

  async function createStudent(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const form =
      new FormData(
        event.currentTarget,
      );

    try {
      await request(
        "/students",
        {
          method: "POST",
          body: JSON.stringify({
            admissionNumber:
              form.get(
                "admissionNumber",
              ),
            firstName:
              form.get("firstName"),
            middleName:
              form.get(
                "middleName",
              ) || null,
            lastName:
              form.get("lastName"),
            preferredName:
              form.get(
                "preferredName",
              ) || null,
            dateOfBirth:
              form.get(
                "dateOfBirth",
              ),
            sex:
              form.get("sex"),
            admissionDate:
              form.get(
                "admissionDate",
              ),
          }),
        },
      );

      event.currentTarget.reset();
      setNotice(
        "Student added to the school registry.",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add student.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createGuardian(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const form =
      new FormData(
        event.currentTarget,
      );

    try {
      await request(
        "/guardians",
        {
          method: "POST",
          body: JSON.stringify({
            fullName:
              form.get("fullName"),
            email:
              form.get("email") ||
              null,
            phone:
              form.get("phone") ||
              null,
          }),
        },
      );

      event.currentTarget.reset();
      setNotice(
        "Guardian added to the registry.",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add guardian.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function linkGuardian(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedStudentId) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);

    const form =
      new FormData(
        event.currentTarget,
      );

    try {
      await request(
        `/students/${selectedStudentId}/guardians`,
        {
          method: "POST",
          body: JSON.stringify({
            guardianId:
              form.get(
                "guardianId",
              ),
            relationshipLabel:
              form.get(
                "relationshipLabel",
              ),
            isPrimary:
              form.get(
                "isPrimary",
              ) === "on",
            isEmergencyContact:
              form.get(
                "isEmergencyContact",
              ) === "on",
            pickupAuthorized:
              form.get(
                "pickupAuthorized",
              ) === "on",
            receivesNotifications:
              form.get(
                "receivesNotifications",
              ) === "on",
          }),
        },
      );

      event.currentTarget.reset();
      setNotice(
        "Guardian linked to the student.",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to link guardian.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createEnrollment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedStudentId) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);

    const form =
      new FormData(
        event.currentTarget,
      );

    try {
      await request(
        `/students/${selectedStudentId}/enrollments`,
        {
          method: "POST",
          body: JSON.stringify({
            academicSessionId:
              form.get(
                "academicSessionId",
              ),
            classArmId:
              form.get(
                "classArmId",
              ),
            startsOn:
              form.get("startsOn"),
          }),
        },
      );

      event.currentTarget.reset();
      setNotice(
        "Student enrollment created.",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create enrollment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      },
    );

    router.push(
      `/login?school=${encodeURIComponent(
        school.slug,
      )}`,
    );
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-5 py-4 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              CASA School
            </p>
            <h1 className="mt-1 text-lg font-semibold">
              {school.name}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="hidden text-right sm:block">
              <p className="font-medium">
                {user.fullName}
              </p>
              <p className="text-slate-500">
                {roles.join(" ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ")}
              </p>
            </div>
            <button
              onClick={() =>
                void logout()
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-slate-500">
              People & enrollment
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              School Registry
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              The authoritative student, guardian and enrollment record for this school.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">
                Students
              </p>
              <p className="mt-1 text-xl font-semibold">
                {studentTotal}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">
                Guardians
              </p>
              <p className="mt-1 text-xl font-semibold">
                {guardianTotal}
              </p>
            </div>
          </div>
        </div>

        {notice ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex rounded-lg bg-slate-100 p-1">
                {(
                  [
                    [
                      "students",
                      "Students",
                    ],
                    [
                      "guardians",
                      "Guardians",
                    ],
                  ] as const
                ).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      onClick={() =>
                        setTab(value)
                      }
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        tab === value
                          ? "bg-white shadow-sm"
                          : "text-slate-600"
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
                placeholder="Search registryÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 sm:max-w-xs"
              />
            </div>

            {tab ===
            "students" ? (
              <div className="divide-y divide-slate-100">
                {students.length ===
                0 ? (
                  <div className="p-10 text-center">
                    <p className="font-medium">
                      No students yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add the first student from the panel on the right.
                    </p>
                  </div>
                ) : (
                  students.map(
                    (student) => (
                      <button
                        key={
                          student.id
                        }
                        onClick={() => {
                          if (
                            selectedStudentId !==
                            student.id
                          ) {
                            setStudentDetail(
                              null,
                            );
                          }

                          setSelectedStudentId(
                            student.id,
                          );
                        }}
                        className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:grid-cols-[1fr_150px_180px] ${
                          selectedStudentId ===
                          student.id
                            ? "bg-slate-50"
                            : ""
                        }`}
                      >
                        <div>
                          <p className="font-medium">
                            {
                              student.lastName
                            }{" "}
                            {
                              student.firstName
                            }
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {
                              student.admissionNumber
                            }
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="text-slate-500">
                            Status
                          </p>
                          <p className="mt-1 font-medium">
                            {
                              student.status
                            }
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="text-slate-500">
                            Current class
                          </p>
                          <p className="mt-1 font-medium">
                            {student.classLevelName
                              ? `${student.classLevelName} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${student.classArmName}`
                              : "Not enrolled"}
                          </p>
                        </div>
                      </button>
                    ),
                  )
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {guardians.length ===
                0 ? (
                  <div className="p-10 text-center">
                    <p className="font-medium">
                      No guardians yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add guardians independently, then link them to students.
                    </p>
                  </div>
                ) : (
                  guardians.map(
                    (guardian) => (
                      <div
                        key={
                          guardian.id
                        }
                        className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_1fr]"
                      >
                        <div>
                          <p className="font-medium">
                            {
                              guardian.fullName
                            }
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {guardian.email ??
                              guardian.phone}
                          </p>
                        </div>
                        <div className="text-sm sm:text-right">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                            {guardian.membershipId
                              ? "Portal linked"
                              : "No login account"}
                          </span>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold">
                Add student
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                A student record does not create a login account.
              </p>

              <form
                className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                onSubmit={
                  createStudent
                }
              >
                <input
                  required
                  name="admissionNumber"
                  placeholder="Admission number"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  required
                  name="firstName"
                  placeholder="First name"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  name="middleName"
                  placeholder="Middle name"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  required
                  name="lastName"
                  placeholder="Last name"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  name="preferredName"
                  placeholder="Preferred name"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <select
                  name="sex"
                  defaultValue="UNSPECIFIED"
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                >
                  <option value="UNSPECIFIED">
                    Sex unspecified
                  </option>
                  <option value="MALE">
                    Male
                  </option>
                  <option value="FEMALE">
                    Female
                  </option>
                </select>
                <label className="text-xs text-slate-500">
                  Date of birth
                  <input
                    required
                    type="date"
                    name="dateOfBirth"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Admission date
                  <input
                    required
                    type="date"
                    name="admissionDate"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950"
                  />
                </label>
                <button
                  disabled={busy}
                  className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                >
                  Add student
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold">
                Add guardian
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Guardian records can exist before portal access is provisioned.
              </p>

              <form
                className="mt-5 space-y-3"
                onSubmit={
                  createGuardian
                }
              >
                <input
                  required
                  name="fullName"
                  placeholder="Full name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <input
                  name="phone"
                  placeholder="Phone in E.164 format"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <button
                  disabled={busy}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                >
                  Add guardian
                </button>
              </form>
            </section>

            {studentDetail ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                    Selected student
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {
                      studentDetail
                        .student
                        .firstName
                    }{" "}
                    {
                      studentDetail
                        .student
                        .lastName
                    }
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {
                      studentDetail
                        .student
                        .admissionNumber
                    }
                  </p>
                </div>

                <StudentCards
                  apiBase={apiBase}
                  studentId={
                    studentDetail.student.id
                  }
                />

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h4 className="text-sm font-semibold">
                    Guardians
                  </h4>

                  {studentDetail
                    .guardians
                    .length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {studentDetail.guardians.map(
                        (
                          guardian,
                        ) => (
                          <div
                            key={
                              guardian.linkId
                            }
                            className="rounded-lg bg-slate-50 p-3 text-sm"
                          >
                            <p className="font-medium">
                              {
                                guardian.fullName
                              }
                            </p>
                            <p className="mt-1 text-slate-500">
                              {
                                guardian.relationshipLabel
                              }
                              {guardian.isPrimary
                                ? " ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· Primary"
                                : ""}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      No guardian linked yet.
                    </p>
                  )}

                  <form
                    className="mt-4 space-y-3"
                    onSubmit={
                      linkGuardian
                    }
                  >
                    <select
                      required
                      name="guardianId"
                      defaultValue=""
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    >
                      <option
                        value=""
                        disabled
                      >
                        Select guardian
                      </option>
                      {guardians.map(
                        (guardian) => (
                          <option
                            key={
                              guardian.id
                            }
                            value={
                              guardian.id
                            }
                          >
                            {
                              guardian.fullName
                            }
                          </option>
                        ),
                      )}
                    </select>
                    <input
                      required
                      name="relationshipLabel"
                      placeholder="Relationship, e.g. Mother"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <label>
                        <input
                          type="checkbox"
                          name="isPrimary"
                          className="mr-2"
                        />
                        Primary
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name="isEmergencyContact"
                          className="mr-2"
                        />
                        Emergency
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name="pickupAuthorized"
                          className="mr-2"
                        />
                        Pickup
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name="receivesNotifications"
                          defaultChecked
                          className="mr-2"
                        />
                        Notifications
                      </label>
                    </div>
                    <button
                      disabled={
                        busy ||
                        guardians.length ===
                          0
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                    >
                      Link guardian
                    </button>
                  </form>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h4 className="text-sm font-semibold">
                    Enrollment
                  </h4>

                  {studentDetail
                    .enrollments
                    .length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {studentDetail.enrollments.map(
                        (
                          enrollment,
                        ) => (
                          <div
                            key={
                              enrollment.id
                            }
                            className="rounded-lg bg-slate-50 p-3 text-sm"
                          >
                            <p className="font-medium">
                              {
                                enrollment.classLevelName
                              }{" "}
                              ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·{" "}
                              {
                                enrollment.classArmName
                              }
                            </p>
                            <p className="mt-1 text-slate-500">
                              {
                                enrollment.academicSessionName
                              }{" "}
                              ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·{" "}
                              {
                                enrollment.status
                              }
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      No enrollment yet.
                    </p>
                  )}

                  {academicOptions
                    .sessions.length >
                    0 &&
                  academicOptions
                    .classArms.length >
                    0 ? (
                    <form
                      className="mt-4 space-y-3"
                      onSubmit={
                        createEnrollment
                      }
                    >
                      <select
                        required
                        name="academicSessionId"
                        defaultValue=""
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Academic session
                        </option>
                        {academicOptions.sessions.map(
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
                              {
                                session.name
                              }
                            </option>
                          ),
                        )}
                      </select>
                      <select
                        required
                        name="classArmId"
                        defaultValue=""
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Class
                        </option>
                        {academicOptions.classArms.map(
                          (arm) => (
                            <option
                              key={
                                arm.id
                              }
                              value={
                                arm.id
                              }
                            >
                              {
                                arm.classLevelName
                              }{" "}
                              ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·{" "}
                              {
                                arm.name
                              }
                            </option>
                          ),
                        )}
                      </select>
                      <label className="block text-xs text-slate-500">
                        Enrollment start date
                        <input
                          required
                          type="date"
                          name="startsOn"
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950"
                        />
                      </label>
                      <button
                        disabled={
                          busy
                        }
                        className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Create enrollment
                      </button>
                    </form>
                  ) : (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      Academic sessions and class arms must be configured before enrollment can be created.
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}