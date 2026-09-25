"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CasaConfirmDialog,
} from "@/components/casa-confirm-dialog";
import { StudentCards } from "./student-cards";
import { BulkCardActivation } from "./bulk-card-activation";
import { RegistryM34AOperations } from "./m34a-registry-operations";

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
  casaStudentId: string;
  admissionNumber: string | null;
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
  admissionDate:
    string | null;
  homeBranchId: string | null;
  homeBranchName: string | null;
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
  notificationsEnabled: boolean;
  activeNotificationDevices: number;
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

interface RegistrationCampus {
  id: string;
  name: string;
  isHeadquarters: boolean;
}

interface AcademicOptions {
  branches: Array<{
    id: string;
    name: string;
    code: string;
    isHeadquarters: boolean;
  }>;
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
      branches: [],
      sessions: [],
      classArms: [],
    });
  const [
    registrationCampus,
    setRegistrationCampus,
  ] =
    useState<
      RegistrationCampus |
      null
    >(null);
  const [busy, setBusy] =
    useState(false);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [
    removeStudentOpen,
    setRemoveStudentOpen,
  ] =
    useState(false);
  const [
    cardActivationBatchVersion,
    setCardActivationBatchVersion,
  ] =
    useState(0);

  useEffect(() => {
    const handleBatchComplete = () => {
      setCardActivationBatchVersion(
        (value) => value + 1,
      );
    };

    window.addEventListener(
      "casa:card-activation-batch-complete",
      handleBatchComplete,
    );

    return () => {
      window.removeEventListener(
        "casa:card-activation-batch-complete",
        handleBatchComplete,
      );
    };
  }, []);

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

      const responseText =
        await response.text();

      let body:
        ({
          message?: string;
        } & T) |
        null = null;

      if (
        responseText.trim()
      ) {
        try {
          body =
            JSON.parse(
              responseText,
            ) as {
              message?: string;
            } & T;
        } catch {
          body = null;
        }
      }

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
          body?.message ??
            `CASA could not complete the request (${response.status}).`,
        );
      }

      if (!body) {
        throw new Error(
          "CASA returned an empty or invalid response.",
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
        registrationCampus:
          RegistrationCampus;
      }>(
        `/students?q=${encodeURIComponent(
          query,
        )}`,
      );

      setStudents(body.students);
      setStudentTotal(
        body.pagination.total,
      );
      setRegistrationCampus(
        body.registrationCampus,
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
        registrationCampus:
          RegistrationCampus;
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
          setRegistrationCampus(
            studentBody.registrationCampus,
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

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
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
              ) || null,
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
              ) || null,
          }),
        },
      );

      formElement.reset();
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

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
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

      formElement.reset();
      setNotice(
        "Guardian added to the registry.",
      );
      await refresh();
      window.dispatchEvent(
        new Event(
          "casa:guardian-registry-changed",
        ),
      );
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

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    try {
      const enrollmentResult =
        await request<{
          cardProvisioning?: {
            status?: string;
            scheduledFor?:
              string | null;
          };
        }>(
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

      await request(
        `/students/${selectedStudentId}/arrival-method`,
        {
          method: "PATCH",
          body: JSON.stringify({
            arrivalMethod:
              form.get(
                "arrivalMethod",
              ),
            effectiveFrom:
              form.get(
                "startsOn",
              ),
            reason:
              "Set during enrollment",
          }),
        },
      );

      formElement.reset();
      const cardStatus =
        enrollmentResult
          .cardProvisioning
          ?.status;
      const scheduledFor =
        enrollmentResult
          .cardProvisioning
          ?.scheduledFor ??
        null;

      setNotice(
        cardStatus ===
          "CREATED" &&
        scheduledFor
          ? `Student enrollment saved. The first permanent card is scheduled for term-end production on ${scheduledFor}. Until physical handover and activation, the School Technician/Admin should use supervised first-card check-in and assisted sign-out.`
          : cardStatus ===
              "CREATED"
          ? "Student enrollment and arrival method saved. CASA created the first digital card automatically and queued it for production."
          : cardStatus ===
              "ALREADY_PRESENT"
            ? "Student enrollment and arrival method saved. The student already has a current card."
            : cardStatus ===
                "DEFERRED_NO_TEMPLATE"
              ? "Student enrollment saved. First-card creation is waiting for an active school card template."
              : cardStatus ===
                  "DEFERRED_INCOMPLETE_CARD_DATA"
                ? "Student enrollment saved. Complete the student card-visible details before creating the first card."
                : "Student enrollment and arrival method saved.",
      );
      window.dispatchEvent(
        new Event(
          "casa:student-card-changed",
        ),
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

  async function updateStudent(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !selectedStudentId ||
      !studentDetail
    ) {
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
        `/students/${selectedStudentId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            firstName:
              form.get("firstName"),
            middleName:
              form.get("middleName") ||
              null,
            lastName:
              form.get("lastName"),
            preferredName:
              form.get("preferredName") ||
              null,
            admissionDate:
              form.get("admissionDate") ||
              null,
            sex:
              form.get("sex"),
            status:
              form.get("status"),
            exitDate:
              form.get("exitDate") ||
              null,
          }),
        },
      );

      setNotice(
        "Student record updated.",
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update student.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent() {
    if (
      !selectedStudentId ||
      !selectedStudent
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await request(
        `/students/${selectedStudentId}`,
        {
          method:
            "DELETE",
        },
      );

      setRemoveStudentOpen(
        false,
      );
      setSelectedStudentId(
        null,
      );
      setStudentDetail(
        null,
      );
      setNotice(
        "Student removed from the active registry. Historical attendance, identity and audit records were preserved.",
      );
      await refresh();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Unable to remove student.",
      );
    } finally {
      setBusy(
        false,
      );
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

  const selectedStudent =
    studentDetail?.student ??
    null;

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black/15">
        <div className="casa-container grid lg:grid-cols-[0.72fr_1.28fr]">
          <section className="flex min-h-44 flex-col justify-between border-b border-black/15 px-5 py-5 sm:px-8 lg:border-r lg:border-b-0 lg:px-10 lg:py-8">
            <div className="flex items-center justify-between gap-5">
              <p className="casa-kicker">CASA</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">School registry</p>
            </div>
            <div className="pt-10">
              <p className="casa-kicker text-black/40">People & enrollment</p>
              <h1 className="mt-3 max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                {school.name}
              </h1>
            </div>
          </section>

          <section className="flex flex-col justify-between bg-white px-5 py-5 sm:px-8 lg:px-10 lg:py-8">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <p className="casa-kicker text-black/40">CASA / Registry</p>
              <nav className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.1em]" aria-label="School operations">
                <Link className="border-b border-black" href={`/schools/${encodeURIComponent(school.slug)}/attendance`}>Attendance</Link>
                <Link className="border-b border-black" href={`/schools/${encodeURIComponent(school.slug)}/technician`}>Identity operations</Link>
                {(roles.includes("OWNER") || roles.includes("ADMIN")) ? (
                  <>
                    <Link className="border-b border-black" href={`/schools/${encodeURIComponent(school.slug)}/academic`}>Academic setup</Link>
                    <Link className="border-b border-black" href={`/schools/${encodeURIComponent(school.slug)}/calendar`}>Calendar & holidays</Link>
                    <Link className="border-b border-black" href={`/schools/${encodeURIComponent(school.slug)}/staff-access`}>Staff & access</Link>
                  </>
                ) : null}
                <Link className="border-b border-black" href="/security/passkeys">Security</Link>
              </nav>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <h2 className="casa-display-compact max-w-[8ch]">REGISTRY</h2>
                <p className="mt-5 max-w-xl text-sm leading-6 text-black/50">
                  The authoritative student, guardian, enrollment and school-issued identity record for this school.
                </p>
              </div>
              <div className="grid grid-cols-2 border-l border-t border-black/15">
                <div className="min-w-32 border-r border-b border-black/15 p-4">
                  <strong className="block text-4xl font-semibold tracking-[-0.05em]">{studentTotal}</strong>
                  <span className="casa-kicker mt-2 block text-black/40">Students</span>
                </div>
                <div className="min-w-32 border-r border-b border-black/15 p-4">
                  <strong className="block text-4xl font-semibold tracking-[-0.05em]">{guardianTotal}</strong>
                  <span className="casa-kicker mt-2 block text-black/40">Guardians</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-black/15 pt-4">
              <div>
                <p className="text-xs font-semibold">{user.fullName}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-black/45">{roles.join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2"><a className="casa-button-quiet" href={`/schools/${encodeURIComponent(school.slug)}/branches`}>Branches</a><a className="casa-button-quiet" href={`/schools/${encodeURIComponent(school.slug)}/summer`}>Summer</a><button onClick={() => void logout()} className="casa-button-quiet" type="button">Sign out</button></div>
            </div>
          </section>
        </div>
      </header>

      <div className="casa-container bg-white px-5 py-6 sm:px-8">
        {notice ? (
          <div
            className="casa-notice mb-5 text-[var(--casa-positive)]"
            role="status"
          >
            {notice}
          </div>
        ) : null}

        {error ? (
          <div
            className="casa-error mb-5"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {tab === "students" ? (
          <BulkCardActivation
            schoolSlug={school.slug}
          />
        ) : null}

        <div className="grid border-t border-black xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <section className="min-w-0 border-b border-black xl:border-b-0 xl:border-r">
            <div className="grid gap-4 border-b border-black p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
              <div className="flex border border-black">
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
                      className={`min-h-10 px-3 font-mono text-[10px] uppercase tracking-[0.12em] ${
                        tab === value
                          ? "bg-black text-[#f2f2ef]"
                          : "bg-transparent text-black"
                      }`}
                      type="button"
                      aria-pressed={
                        tab === value
                      }
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <label className="relative block">
                <span className="casa-sr-only">
                  Search registry
                </span>
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search name, CASA ID, admission, guardian..."
                  className="casa-field"
                />
              </label>
            </div>

            {tab ===
            "students" ? (
              <div>
                {students.length ===
                0 ? (
                  <div className="px-5 py-12">
                    <p className="casa-kicker">
                      Empty registry
                    </p>
                    <p className="mt-3 max-w-md text-sm leading-6 text-black/55">
                      No students match the current search. Register a new
                      student from the operations panel.
                    </p>
                  </div>
                ) : (
                  students.map(
                    (student) => {
                      const selected =
                        selectedStudentId ===
                        student.id;

                      return (
                        <button
                          key={
                            student.id
                          }
                          onClick={() => {
                            if (
                              selected
                            ) {
                              setSelectedStudentId(
                                null,
                              );
                              setStudentDetail(
                                null,
                              );
                              return;
                            }

                            setStudentDetail(
                              null,
                            );
                            setSelectedStudentId(
                              student.id,
                            );
                          }}
                          className={`grid w-full gap-4 border-b border-black/20 px-5 py-4 text-left transition sm:grid-cols-[minmax(0,1fr)_130px_190px] ${
                            selected
                              ? "border-l-4 border-l-black bg-black/[0.035]"
                              : "hover:bg-black/[0.025]"
                          }`}
                          type="button"
                          aria-current={
                            selected
                              ? "true"
                              : undefined
                          }
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {student.lastName}{" "}
                              {student.firstName}
                            </p>
                            <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-black/50">
                              {student.casaStudentId}
                              {student.admissionNumber
                                ? ` · ${student.admissionNumber}`
                                : ""}
                            </p>
                          </div>

                          <div>
                            <p className="casa-kicker text-black/45">
                              Status
                            </p>
                            <p className="mt-2 text-xs font-semibold">
                              {student.status}
                            </p>
                          </div>

                          <div>
                            <p className="casa-kicker text-black/45">
                              Current class
                            </p>
                            <p className="mt-2 text-xs font-semibold">
                              {student.homeBranchName ?? "Campus not assigned"}
                              {" · "}
                              {student.classLevelName
                                ? `${student.classLevelName} · ${student.classArmName ?? ""}`
                                : "Not enrolled"}
                            </p>
                          </div>
                        </button>
                      );
                    },
                  )
                )}
              </div>
            ) : (
              <div>
                {guardians.length ===
                0 ? (
                  <div className="px-5 py-12">
                    <p className="casa-kicker">
                      No guardians
                    </p>
                    <p className="mt-3 text-sm text-black/55">
                      Add a guardian from the operations panel, then link the
                      record to a student.
                    </p>
                  </div>
                ) : (
                  guardians.map(
                    (guardian) => (
                      <div
                        key={
                          guardian.id
                        }
                        className="grid gap-3 border-b border-black/20 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-semibold">
                            {guardian.fullName}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {guardian.email ??
                              guardian.phone ??
                              "No contact detail"}
                          </p>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <span
                            className={`casa-status ${
                              guardian.membershipId
                                ? "casa-status-positive"
                                : ""
                            }`}
                          >
                            {guardian.membershipId
                              ? "Portal linked"
                              : "No portal account"}
                          </span>
                          <span
                            className={`casa-status ${
                              guardian.notificationsEnabled
                                ? "casa-status-positive"
                                : ""
                            }`}
                          >
                            {guardian.notificationsEnabled
                              ? `Notifications enabled · ${guardian.activeNotificationDevices} device${guardian.activeNotificationDevices === 1 ? "" : "s"}`
                              : "Notifications not enabled"}
                          </span>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
            )}
          </section>

          <aside className="min-w-0">
            {selectedStudent ? (
              <section className="border-b border-black p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black pb-5">
                  <div>
                    <p className="casa-kicker">
                      Selected student
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">
                      {selectedStudent.firstName}{" "}
                      {selectedStudent.lastName}
                    </h3>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-black/50">
                      {selectedStudent.casaStudentId}
                      {selectedStudent.admissionNumber
                        ? ` · ${selectedStudent.admissionNumber}`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={`casa-status ${
                      selectedStudent.status ===
                      "ACTIVE"
                        ? "casa-status-positive"
                        : "casa-status-warning"
                    }`}
                  >
                    {selectedStudent.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    className="casa-button-secondary text-center"
                    href={`/schools/${encodeURIComponent(
                      school.slug,
                    )}/technician?studentId=${encodeURIComponent(
                      selectedStudent.id,
                    )}&q=${encodeURIComponent(
                      selectedStudent.casaStudentId,
                    )}`}
                  >
                    Face / identity
                  </Link>
                  <Link
                    className="casa-button-secondary text-center"
                    href={`/schools/${encodeURIComponent(
                      school.slug,
                    )}/attendance?studentId=${encodeURIComponent(
                      selectedStudent.id,
                    )}&q=${encodeURIComponent(
                      selectedStudent.casaStudentId,
                    )}${selectedStudent.homeBranchId ? `&branchId=${encodeURIComponent(selectedStudent.homeBranchId)}` : ""}`}
                  >
                    Attendance
                  </Link>
                </div>

                <details className="mt-6 border-t border-black pt-4">
                  <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                    Edit student record
                  </summary>

                  <form
                    key={
                      selectedStudent.id
                    }
                    className="mt-5 grid gap-3 sm:grid-cols-2"
                    onSubmit={
                      updateStudent
                    }
                  >
                    <label className="casa-label">
                      <span>
                        First name
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.firstName
                        }
                        name="firstName"
                        required
                      />
                    </label>

                    <label className="casa-label">
                      <span>
                        Last name
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.lastName
                        }
                        name="lastName"
                        required
                      />
                    </label>

                    <label className="casa-label">
                      <span>
                        Middle name
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.middleName ??
                          ""
                        }
                        name="middleName"
                      />
                    </label>

                    <label className="casa-label">
                      <span>
                        Preferred name
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.preferredName ??
                          ""
                        }
                        name="preferredName"
                      />
                    </label>

                    <label className="casa-label">
                      <span>
                        Sex
                      </span>
                      <select
                        className="casa-field"
                        defaultValue={
                          selectedStudent.sex
                        }
                        name="sex"
                      >
                        <option value="UNSPECIFIED">
                          Unspecified
                        </option>
                        <option value="MALE">
                          Male
                        </option>
                        <option value="FEMALE">
                          Female
                        </option>
                      </select>
                    </label>

                    <label className="casa-label">
                      <span>
                        Admission date / optional
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.admissionDate ??
                          ""
                        }
                        name="admissionDate"
                        type="date"
                      />
                      <span className="mt-1 text-[10px] leading-4 text-black/45">
                        When this student originally joined the school. Leave blank if unknown and update it later.
                      </span>
                    </label>

                    <label className="casa-label">
                      <span>
                        Status
                      </span>
                      <select
                        className="casa-field"
                        defaultValue={
                          selectedStudent.status
                        }
                        name="status"
                      >
                        <option value="ACTIVE">
                          Active
                        </option>
                        <option value="INACTIVE">
                          Inactive
                        </option>
                        <option value="GRADUATED">
                          Graduated
                        </option>
                        <option value="WITHDRAWN">
                          Withdrawn
                        </option>
                        <option value="ARCHIVED">
                          Archived
                        </option>
                      </select>
                    </label>

                    <label className="casa-label sm:col-span-2">
                      <span>
                        Exit date / optional
                      </span>
                      <input
                        className="casa-field"
                        defaultValue={
                          selectedStudent.exitDate ??
                          ""
                        }
                        name="exitDate"
                        type="date"
                      />
                    </label>

                    <button
                      className="casa-button sm:col-span-2"
                      disabled={busy}
                      type="submit"
                    >
                      Save student changes
                    </button>
                    {(roles.includes("OWNER") ||
                      roles.includes("ADMIN")) ? (
                      <button
                        className="border border-[#8b221d] px-4 py-3 text-sm font-semibold text-[#7e1d18] transition hover:bg-[#7e1d18] hover:text-white disabled:opacity-50 sm:col-span-2"
                        disabled={busy}
                        onClick={() =>
                          setRemoveStudentOpen(
                            true,
                          )
                        }
                        type="button"
                      >
                        Remove student from active registry
                      </button>
                    ) : null}
                  </form>
                </details>

                <StudentCards
                  key={`${selectedStudent.id}:${cardActivationBatchVersion}`}
                  apiBase={apiBase}
                  studentId={
                    selectedStudent.id
                  }
                />

                <RegistryM34AOperations
                  schoolSlug={school.slug}
                  studentId={selectedStudent.id}
                />
                <div className="mt-7 border-t border-black pt-5">
                  <p className="casa-kicker">
                    Enrollment
                  </p>

                  {studentDetail &&
                  studentDetail.enrollments.length >
                    0 ? (
                    <div className="mt-4 border-t border-black/25">
                      {studentDetail.enrollments.map(
                        (
                          enrollment,
                        ) => (
                          <div
                            key={
                              enrollment.id
                            }
                            className="border-b border-black/20 py-3"
                          >
                            <p className="text-sm font-semibold">
                              {enrollment.classLevelName}{" "}
                              ·{" "}
                              {enrollment.classArmName}
                            </p>
                            <p className="mt-1 text-xs text-black/50">
                              {enrollment.academicSessionName}{" "}
                              ·{" "}
                              {enrollment.status}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-black/50">
                      No enrollment yet.
                    </p>
                  )}

                  {academicOptions.sessions.length >
                    0 &&
                  academicOptions.classArms.length >
                    0 ? (
                    <form
                      className="mt-5 grid gap-3"
                      onSubmit={
                        createEnrollment
                      }
                    >
                      <label className="casa-label">
                        <span>
                          Academic session
                        </span>
                        <select
                          required
                          name="academicSessionId"
                          defaultValue=""
                          className="casa-field"
                        >
                          <option
                            value=""
                            disabled
                          >
                            Select session
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
                                {session.name}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label className="casa-label">
                        <span>
                          Class
                        </span>
                        <select
                          required
                          name="classArmId"
                          defaultValue=""
                          className="casa-field"
                        >
                          <option
                            value=""
                            disabled
                          >
                            Select class
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
                                {arm.classLevelName} · {arm.name}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label className="casa-label">
                        <span>
                          Arrival method
                        </span>
                        <select
                          name="arrivalMethod"
                          defaultValue="INDEPENDENT"
                          className="casa-field"
                          required
                        >
                          <option value="INDEPENDENT">
                            Independent arrival
                          </option>
                          <option value="SCHOOL_BUS">
                            School bus
                          </option>
                        </select>
                      </label>

                      <label className="casa-label">
                        <span>
                          Enrollment starts on
                        </span>
                        <input
                          required
                          type="date"
                          name="startsOn"
                          className="casa-field"
                        />
                        <span className="mt-1 text-[10px] leading-4 text-black/45">
                          The date this student starts this class/session. This is separate from the school admission date.
                        </span>
                      </label>

                      <button
                        disabled={busy}
                        className="casa-button"
                        type="submit"
                      >
                        Create enrollment
                      </button>
                    </form>
                  ) : (
                    <div className="casa-notice mt-4 text-[var(--casa-warning)]">
                      <p>
                        Academic sessions and class arms must be configured before enrollment can be created.
                      </p>
                      {(roles.includes("OWNER") || roles.includes("ADMIN")) ? (
                        <Link
                          className="mt-3 inline-block border-b border-current font-semibold"
                          href={`/schools/${encodeURIComponent(school.slug)}/academic`}
                        >
                          Open Academic Setup
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="border-b border-black p-5 sm:p-6">
                <p className="casa-kicker">
                  Student workspace
                </p>
                <h3 className="casa-heading mt-4">
                  Select a student.
                </h3>
                <p className="mt-4 max-w-md text-sm leading-6 text-black/55">
                  Open a student to review identity, edit their record, manage
                  guardians and enrollment, or continue to Passkey-protected
                  face and card operations.
                </p>
              </section>
            )}

            <details
              className="border-b border-black p-5 sm:p-6"
              open={
                studentTotal === 0
              }
            >
              <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                Register new student
              </summary>

              <p className="mt-3 text-xs leading-5 text-black/50">
                Use for new admissions and exceptions. Creating a student
                record does not create a login account.
              </p>

              <form
                className="mt-5 grid gap-3 sm:grid-cols-2"
                onSubmit={
                  createStudent
                }
              >
                <label className="casa-label sm:col-span-2">
                  <span>
                    Admission number / optional
                  </span>
                  <input
                    name="admissionNumber"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    First name
                  </span>
                  <input
                    required
                    name="firstName"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Last name
                  </span>
                  <input
                    required
                    name="lastName"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Middle name
                  </span>
                  <input
                    name="middleName"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Preferred name
                  </span>
                  <input
                    name="preferredName"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Sex
                  </span>
                  <select
                    name="sex"
                    defaultValue="UNSPECIFIED"
                    className="casa-field"
                  >
                    <option value="UNSPECIFIED">
                      Unspecified
                    </option>
                    <option value="MALE">
                      Male
                    </option>
                    <option value="FEMALE">
                      Female
                    </option>
                  </select>
                </label>
                <label className="casa-label">
                  <span>
                    Date of birth
                  </span>
                  <input
                    required
                    type="date"
                    name="dateOfBirth"
                    className="casa-field"
                  />
                </label>
                <div className="casa-label sm:col-span-2">
                  <span>
                    Campus
                  </span>
                  <div className="casa-field flex min-h-11 items-center bg-black/[0.035]">
                    {registrationCampus
                      ? `${registrationCampus.name}${registrationCampus.isHeadquarters ? " · HQ" : ""}`
                      : "Campus scope unavailable"}
                  </div>
                  <span className="mt-1 text-[10px] leading-4 text-black/45">
                    CASA assigns the campus from the signed-in administrator&apos;s operating scope. It cannot be changed during student registration.
                  </span>
                </div>

                <label className="casa-label sm:col-span-2">
                  <span>
                    Admission date / optional
                  </span>
                  <input
                    type="date"
                    name="admissionDate"
                    className="casa-field"
                  />
                  <span className="mt-1 text-[10px] leading-4 text-black/45">
                    Leave blank if the exact date the student joined the school is not known. It can be added later.
                  </span>
                </label>
                <button
                  disabled={
                    busy ||
                    !registrationCampus
                  }
                  className="casa-button sm:col-span-2"
                  type="submit"
                >
                  Register student
                </button>
              </form>
            </details>

            <details className="p-5 sm:p-6">
              <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                Create guardian
              </summary>

              <p className="mt-3 text-xs leading-5 text-black/50">
                Guardian records can be created before portal access is
                provisioned, then linked to one or more students. Email is
                optional. When an email is provided CASA can send the private
                setup link automatically; otherwise staff can copy the trusted
                message and send it manually by WhatsApp.
              </p>

              <form
                className="mt-5 grid gap-3"
                onSubmit={
                  createGuardian
                }
              >
                <label className="casa-label">
                  <span>
                    Full name
                  </span>
                  <input
                    required
                    name="fullName"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    className="casa-field"
                  />
                </label>
                <label className="casa-label">
                  <span>
                    Phone / E.164
                  </span>
                  <input
                    name="phone"
                    placeholder="+234..."
                    className="casa-field"
                  />
                </label>
                <button
                  disabled={busy}
                  className="casa-button-secondary"
                  type="submit"
                >
                  Add guardian
                </button>
              </form>
            </details>
          </aside>
        </div>
      </div>

      <CasaConfirmDialog
        open={
          removeStudentOpen &&
          Boolean(
            selectedStudent,
          )
        }
        title="Remove student?"
        message={
          selectedStudent
            ? `Remove ${selectedStudent.firstName} ${selectedStudent.lastName} from the active registry? CASA will archive the student, close any active enrollment and revoke active/pending cards while preserving historical attendance and identity records.`
            : ""
        }
        confirmLabel="Remove student"
        danger
        busy={busy}
        onCancel={() =>
          setRemoveStudentOpen(
            false,
          )
        }
        onConfirm={() =>
          void removeStudent()
        }
      />
</main>
  );
}
