"use client";

import dynamic from "next/dynamic";
import {
  ThemeProvider,
} from "@aws-amplify/ui-react";
import type {
  AwsCredentialProvider,
} from "@aws-amplify/ui-react-liveness";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  obtainCasaInternalPasskeyStepUpGrant,
} from "@/client/passkey-step-up";

const FaceLivenessDetectorCore =
  dynamic(
    () =>
      import(
        "@aws-amplify/ui-react-liveness"
      ).then(
        (module) =>
          module.FaceLivenessDetectorCore,
      ),
    {
      ssr: false,
      loading: () => (
        <div className="casa-notice">
          Preparing face camera...
        </div>
      ),
    },
  );

type School = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
};

type StudentSummary = {
  id: string;
  casaStudentId?: string;
  casa_student_id?: string;
  admissionNumber?: string | null;
  admission_number?: string | null;
  firstName?: string;
  first_name?: string;
  middleName?: string | null;
  middle_name?: string | null;
  lastName?: string;
  last_name?: string;
  className?: string | null;
  class_name?: string | null;
  classArmName?: string | null;
  class_arm_name?: string | null;
  classLevelName?: string | null;
  class_level_name?: string | null;
  sectionCode?: string | null;
  section_code?: string | null;
  faceStatus?: string;
  face_status?: string;
  cardProductionNeed?: string;
  card_production_need?: string;
  onboardingComplete?: boolean;
  onboarding_complete?: boolean;
  lock?: {
    actor_name?: string;
    locked_at?: string;
  } | null;
  lock_holder_name?: string | null;
  locked_at?: string | null;
};

type StudentDetail = {
  student?: Record<string, unknown>;
  guardians?: Array<Record<string, unknown>>;
  enrollments?: Array<Record<string, unknown>>;
  lock?: Record<string, unknown> | null;
  onboardingComplete?: boolean;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

type AcademicOptions = {
  sessions: Array<{
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
  }>;
  branches: Array<{
    id: string;
    name: string;
    code: string;
    isHeadquarters: boolean;
  }>;
  classArms: Array<{
    id: string;
    name: string;
    classLevelId: string;
    classLevelName: string;
    sortOrder: number;
    branchId: string;
    branchName: string;
  }>;
};

type FaceCapturePhase =
  | "IDLE"
  | "CAMERA"
  | "VERIFYING"
  | "ERROR";

const FACE_RESULT_RETRY_COUNT = 6;
const FACE_RESULT_RETRY_DELAY_MS = 750;

async function waitForFaceResultRetry() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, FACE_RESULT_RETRY_DELAY_MS);
  });
}

type EnrollmentLiveness = {
  livenessSessionId: string;
  providerSessionId: string;
  expiresAt: string;
  streaming: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
  };
};

type FaceCompletionResponse = {
  message?: string;
  code?: string;
};

async function resultOrThrow(
  response: Response,
) {
  const body =
    await response
      .json()
      .catch(
        () => ({}),
      );

  if (!response.ok) {
    throw new Error(
      typeof body.message ===
        "string"
        ? body.message
        : "CASA operation failed.",
    );
  }

  return body;
}

function summaryValue(
  row: StudentSummary,
  camel: keyof StudentSummary,
  snake: keyof StudentSummary,
) {
  return row[camel] ??
    row[snake];
}

function recordValue(
  row:
    Record<string, unknown> |
    undefined,
  ...keys:
    string[]
) {
  if (!row) {
    return undefined;
  }

  for (
    const key of
    keys
  ) {
    if (
      row[key] !==
      undefined
    ) {
      return row[key];
    }
  }

  return undefined;
}

function textValue(
  value: unknown,
  fallback = "",
) {
  return typeof value ===
    "string"
    ? value
    : fallback;
}

function booleanValue(
  value: unknown,
) {
  return value ===
    true;
}

export default function InternalOnboardingClient({
  actorName,
  role,
  initialSchoolId,
  returnHref,
}: {
  actorName: string;
  role: string;
  initialSchoolId: string;
  returnHref: string;
}) {
  const [
    schools,
    setSchools,
  ] =
    useState<School[]>([]);
  const [
    schoolId,
    setSchoolId,
  ] =
    useState(
      initialSchoolId,
    );
  const [
    query,
    setQuery,
  ] =
    useState("");
  const [
    section,
    setSection,
  ] =
    useState("ALL");
  const [
    face,
    setFace,
  ] =
    useState("ALL");
  const [
    completion,
    setCompletion,
  ] =
    useState("INCOMPLETE");
  const [
    page,
    setPage,
  ] =
    useState(1);
  const [
    pagination,
    setPagination,
  ] =
    useState<Pagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      pages: 1,
    });
  const [
    students,
    setStudents,
  ] =
    useState<StudentSummary[]>([]);
  const [
    selected,
    setSelected,
  ] =
    useState<StudentSummary | null>(
      null,
    );
  const [
    detail,
    setDetail,
  ] =
    useState<StudentDetail | null>(
      null,
    );
  const [
    academicOptions,
    setAcademicOptions,
  ] =
    useState<AcademicOptions>({
      sessions: [],
      branches: [],
      classArms: [],
    });
  const [
    busy,
    setBusy,
  ] =
    useState(false);
  const [
    message,
    setMessage,
  ] =
    useState("");
  const [
    error,
    setError,
  ] =
    useState("");
  const [
    liveness,
    setLiveness,
  ] =
    useState<EnrollmentLiveness | null>(
      null,
    );
  const [
    faceCapturePhase,
    setFaceCapturePhase,
  ] =
    useState<FaceCapturePhase>(
      "IDLE",
    );
  const completingFaceRef =
    useRef(false);

  const selectedSchool =
    useMemo(
      () =>
        schools.find(
          (school) =>
            school.id ===
            schoolId,
        ) ??
        null,
      [
        schoolId,
        schools,
      ],
    );

  const endpoint =
    useMemo(
      () =>
        schoolId
          ? `/api/internal/onboarding/schools/${encodeURIComponent(
              schoolId,
            )}`
          : "",
      [
        schoolId,
      ],
    );

  const credentialProvider =
    useMemo<
      AwsCredentialProvider | null
    >(
      () => {
        if (!liveness) {
          return null;
        }

        const credentials =
          liveness.streaming;

        return async () => ({
          accessKeyId:
            credentials.accessKeyId,
          secretAccessKey:
            credentials.secretAccessKey,
          sessionToken:
            credentials.sessionToken,
          expiration:
            new Date(
              credentials.expiration,
            ),
        });
      },
      [
        liveness,
      ],
    );

  const searchPage =
    useCallback(
      async (
        targetPage:
          number,
        completionOverride?:
          string,
      ) => {
        if (!schoolId) {
          return {
            students:
              [] as StudentSummary[],
            pagination: {
              page: 1,
              pageSize: 25,
              total: 0,
              pages: 1,
            },
          };
        }

        const params =
          new URLSearchParams({
            q:
              query,
            section,
            face,
            completion:
              completionOverride ??
              completion,
            page:
              String(
                targetPage,
              ),
          });

        const body =
          await resultOrThrow(
            await fetch(
              `${endpoint}/students?${params.toString()}`,
              {
                cache:
                  "no-store",
              },
            ),
          );

        const nextStudents =
          Array.isArray(
            body.students,
          )
            ? body.students as StudentSummary[]
            : [];

        const nextPagination =
          body.pagination &&
          typeof body.pagination ===
            "object"
            ? body.pagination as Pagination
            : {
                page:
                  targetPage,
                pageSize:
                  25,
                total:
                  nextStudents.length,
                pages:
                  1,
              };

        return {
          students:
            nextStudents,
          pagination:
            nextPagination,
        };
      },
      [
        completion,
        endpoint,
        face,
        query,
        schoolId,
        section,
      ],
    );

  const applySearchResult =
    useCallback(
      (result: {
        students:
          StudentSummary[];
        pagination:
          Pagination;
      }) => {
        setStudents(
          result.students,
        );
        setPagination(
          result.pagination,
        );
        setPage(
          result.pagination.page,
        );
      },
      [],
    );

  const search =
    useCallback(
      async (
        targetPage:
          number,
      ) => {
        setBusy(true);
        setError("");

        try {
          const result =
            await searchPage(
              targetPage,
            );

          applySearchResult(
            result,
          );

          return result;
        } catch (caught) {
          setError(
            caught instanceof
              Error
              ? caught.message
              : "Search failed.",
          );
          return null;
        } finally {
          setBusy(false);
        }
      },
      [
        applySearchResult,
        searchPage,
      ],
    );

  const loadStudentDetail =
    useCallback(
      async (
        studentId:
          string,
      ) => {
        if (!endpoint) {
          return null;
        }

        const body =
          await resultOrThrow(
            await fetch(
              `${endpoint}/students/${encodeURIComponent(
                studentId,
              )}`,
              {
                cache:
                  "no-store",
              },
            ),
          );

        setDetail(
          body,
        );

        return body as StudentDetail;
      },
      [
        endpoint,
      ],
    );

  useEffect(() => {
    let cancelled =
      false;

    void (async () => {
      try {
        const body =
          await resultOrThrow(
            await fetch(
              "/api/internal/onboarding/schools",
              {
                cache:
                  "no-store",
              },
            ),
          );

        if (cancelled) {
          return;
        }

        const next =
          Array.isArray(
            body.schools,
          )
            ? body.schools as School[]
            : [];

        setSchools(
          next,
        );
        setSchoolId(
          (current) =>
            current ||
            initialSchoolId ||
            next[0]?.id ||
            "",
        );
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setError(
          caught instanceof
            Error
            ? caught.message
            : "Could not load assigned schools.",
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    initialSchoolId,
  ]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    let cancelled =
      false;

    void (async () => {
      try {
        const body =
          await resultOrThrow(
            await fetch(
              `/api/internal/onboarding/schools/${encodeURIComponent(
                schoolId,
              )}/academic-options`,
              {
                cache:
                  "no-store",
              },
            ),
          );

        if (cancelled) {
          return;
        }

        setAcademicOptions({
          sessions:
            Array.isArray(
              body.sessions,
            )
              ? body.sessions
              : [],
          branches:
            Array.isArray(
              body.branches,
            )
              ? body.branches
              : [],
          classArms:
            Array.isArray(
              body.classArms,
            )
              ? body.classArms
              : [],
        });
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setError(
          caught instanceof
            Error
            ? caught.message
            : "Could not load academic options.",
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    schoolId,
  ]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    let cancelled =
      false;

    void (async () => {
      try {
        const result =
          await searchPage(
            1,
          );

        if (cancelled) {
          return;
        }

        setStudents(
          result.students,
        );
        setPagination(
          result.pagination,
        );
        setPage(
          result.pagination.page,
        );
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setError(
          caught instanceof
            Error
            ? caught.message
            : "Search failed.",
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    applySearchResult,
    schoolId,
    searchPage,
  ]);

  async function releaseLock(
    studentId:
      string,
  ) {
    if (!endpoint) {
      throw new Error(
        "CASA onboarding endpoint is unavailable.",
      );
    }

    const response =
      await fetch(
        `${endpoint}/students/${encodeURIComponent(
          studentId,
        )}/lock`,
        {
          method:
            "DELETE",
        },
      );

    const body:
      unknown =
        await response
          .json()
          .catch(
            () => null,
          );

    const released =
      body !== null &&
      typeof body ===
        "object" &&
      "released" in body &&
      (
        body as {
          released?:
            unknown;
        }
      ).released ===
        true;

    if (
      !response.ok ||
      !released
    ) {
      const message =
        body !== null &&
        typeof body ===
          "object" &&
        "message" in body &&
        typeof (
          body as {
            message?:
              unknown;
          }
        ).message ===
          "string"
          ? (
              body as {
                message:
                  string;
              }
            ).message
          : "CASA could not release this student's onboarding lock. Refresh and verify the current lock owner before continuing.";

      throw new Error(
        message,
      );
    }
  }

  async function chooseStudent(
    student:
      StudentSummary,
  ) {
    if (!endpoint) {
      return;
    }

    setMessage("");
    setError("");
    setBusy(true);

    try {
      if (
        liveness &&
        selected
      ) {
        await cancelEnrollment(
          false,
        );
      }

      if (
        selected &&
        selected.id !==
          student.id
      ) {
        await releaseLock(
          selected.id,
        );
      }

      const lockResponse =
        await fetch(
          `${endpoint}/students/${encodeURIComponent(
            student.id,
          )}/lock`,
          {
            method:
              "PUT",
          },
        );

      if (!lockResponse.ok) {
        const body =
          await lockResponse
            .json()
            .catch(
              () => ({}),
            );

        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Student is currently locked.",
        );
      }

      const body =
        await loadStudentDetail(
          student.id,
        );

      setSelected(
        student,
      );
      setDetail(
        body,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Could not open student.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function releaseStudent() {
    if (!selected) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (liveness) {
        await cancelEnrollment(
          false,
        );
      }

      await releaseLock(
        selected.id,
      );
      setSelected(null);
      setDetail(null);
      await search(
        page,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Could not release student.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseNextIncomplete() {
    if (!schoolId) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      let candidates =
        students.filter(
          (student) =>
            !Boolean(
              summaryValue(
                student,
                "onboardingComplete",
                "onboarding_complete",
              ),
            ),
        );

      const index =
        selected
          ? candidates.findIndex(
              (student) =>
                student.id ===
                selected.id,
            )
          : -1;

      let next =
        candidates[
          index + 1
        ];

      if (!next) {
        if (
          completion !==
          "INCOMPLETE"
        ) {
          setCompletion(
            "INCOMPLETE",
          );
        }

        const nextPage =
          pagination.page <
          pagination.pages
            ? pagination.page +
              1
            : 1;

        const result =
          await searchPage(
            nextPage,
            "INCOMPLETE",
          );

        applySearchResult(
          result,
        );

        candidates =
          result.students.filter(
            (student) =>
              !Boolean(
                summaryValue(
                  student,
                  "onboardingComplete",
                  "onboarding_complete",
                ),
              ),
          );

        next =
          candidates[0];
      }

      if (!next) {
        setMessage(
          "No incomplete students match the current school and filters.",
        );
        return;
      }

      await chooseStudent(
        next,
      );
    } finally {
      setBusy(false);
    }
  }

  async function createStudent(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!endpoint) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    try {
      await resultOrThrow(
        await fetch(
          `${endpoint}/students`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                admissionNumber:
                  form.get(
                    "admissionNumber",
                  ) ||
                  null,
                branchId:
                  form.get(
                    "branchId",
                  ) ||
                  null,
                firstName:
                  form.get(
                    "firstName",
                  ),
                middleName:
                  form.get(
                    "middleName",
                  ) ||
                  null,
                lastName:
                  form.get(
                    "lastName",
                  ),
                preferredName:
                  form.get(
                    "preferredName",
                  ) ||
                  null,
                dateOfBirth:
                  form.get(
                    "dateOfBirth",
                  ),
                sex:
                  form.get(
                    "sex",
                  ),
                admissionDate:
                  form.get(
                    "admissionDate",
                  ),
              }),
          },
        ),
      );

      formElement.reset();
      setMessage(
        "Student identity registered. Add guardian/contact details now. Academic session/class assignment can be completed later after the school finishes academic setup; face capture remains a separate capture-day step.",
      );
      setCompletion(
        "INCOMPLETE",
      );
      await search(1);
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Student registration failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateStudent(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !endpoint ||
      !selected
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    try {
      await resultOrThrow(
        await fetch(
          `${endpoint}/students/${encodeURIComponent(
            selected.id,
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
                admissionNumber:
                  form.get(
                    "admissionNumber",
                  ) ||
                  null,
                firstName:
                  form.get(
                    "firstName",
                  ),
                middleName:
                  form.get(
                    "middleName",
                  ) ||
                  null,
                lastName:
                  form.get(
                    "lastName",
                  ),
                preferredName:
                  form.get(
                    "preferredName",
                  ) ||
                  null,
                dateOfBirth:
                  form.get(
                    "dateOfBirth",
                  ),
                sex:
                  form.get(
                    "sex",
                  ),
                admissionDate:
                  form.get(
                    "admissionDate",
                  ),
              }),
          },
        ),
      );

      setMessage(
        "Student details updated.",
      );
      await loadStudentDetail(
        selected.id,
      );
      await search(
        page,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Student update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addGuardian(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !endpoint ||
      !selected
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    try {
      await resultOrThrow(
        await fetch(
          `${endpoint}/students/${encodeURIComponent(
            selected.id,
          )}/guardians`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                fullName:
                  form.get(
                    "fullName",
                  ),
                email:
                  form.get(
                    "email",
                  ) ||
                  null,
                phone:
                  form.get(
                    "phone",
                  ) ||
                  null,
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
        ),
      );

      formElement.reset();
      setMessage(
        "Guardian created and linked.",
      );
      await loadStudentDetail(
        selected.id,
      );
      await search(
        page,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Guardian could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignEnrollment(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !endpoint ||
      !selected
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    try {
      await resultOrThrow(
        await fetch(
          `${endpoint}/students/${encodeURIComponent(
            selected.id,
          )}/enrollment`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                academicSessionId:
                  form.get(
                    "academicSessionId",
                  ),
                branchId:
                  form.get(
                    "branchId",
                  ),
                classArmId:
                  form.get(
                    "classArmId",
                  ),
                arrivalMethod:
                  form.get(
                    "arrivalMethod",
                  ),
                startsOn:
                  form.get(
                    "startsOn",
                  ),
              }),
          },
        ),
      );

      formElement.reset();
      setMessage(
        "Class enrollment assigned.",
      );
      await loadStudentDetail(
        selected.id,
      );
      await search(
        page,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Enrollment could not be assigned.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startEnrollment() {
    if (
      !selected ||
      !schoolId ||
      !endpoint
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const action =
        faceStatus ===
        "COMPLETE"
          ? "BIOMETRIC_REENROLL"
          : "BIOMETRIC_ENROLL";

      const grant =
        await obtainCasaInternalPasskeyStepUpGrant({
          schoolId,
          action,
        });

      const response =
        await fetch(
          `${endpoint}/students/${encodeURIComponent(
            selected.id,
          )}/biometrics/liveness/start`,
          {
            method:
              "POST",
            headers: {
              "x-casa-passkey-step-up":
                grant,
            },
            credentials:
              "same-origin",
            cache:
              "no-store",
          },
        );

      const body =
        await response.json();

      if (
        !response.ok ||
        !body?.liveness ||
        body.action !==
          action
      ) {
        throw new Error(
          typeof body?.message ===
            "string"
            ? body.message
            : "Face enrollment could not be started.",
        );
      }

      setLiveness(
        body.liveness as
          EnrollmentLiveness,
      );
      setFaceCapturePhase(
        "CAMERA",
      );
      setMessage(
        action ===
          "BIOMETRIC_ENROLL"
          ? "Face enrollment started. Complete the live camera check."
          : "Face re-enrollment started. Complete the live camera check.",
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Face enrollment could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function completeEnrollment() {
    if (
      !selected ||
      !liveness ||
      !endpoint ||
      completingFaceRef.current
    ) {
      return;
    }

    const current =
      liveness;

    completingFaceRef.current =
      true;
    setFaceCapturePhase(
      "VERIFYING",
    );
    setBusy(true);
    setError("");
    setMessage(
      "Camera check complete. CASA is verifying liveness and enrolling the face with AWS. This normally takes only a few seconds.",
    );

    try {
      let body: FaceCompletionResponse = {};
      let completed = false;

      for (
        let attempt = 1;
        attempt <=
        FACE_RESULT_RETRY_COUNT;
        attempt += 1
      ) {
        const response =
          await fetch(
            `${endpoint}/students/${encodeURIComponent(
              selected.id,
            )}/biometrics/liveness/complete`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              credentials:
                "same-origin",
              cache: "no-store",
              body: JSON.stringify({
                livenessSessionId:
                  current
                    .livenessSessionId,
              }),
            },
          );

        body =
          (await response
            .json()
            .catch(() => ({}))) as
            FaceCompletionResponse;

        if (response.ok) {
          completed = true;
          break;
        }

        const code =
          typeof body?.code ===
          "string"
            ? body.code
            : "";

        if (
          code ===
            "LIVENESS_NOT_COMPLETE" &&
          attempt <
            FACE_RESULT_RETRY_COUNT
        ) {
          setMessage(
            `AWS is finishing the liveness result. Verification check ${attempt + 1} of ${FACE_RESULT_RETRY_COUNT}...`,
          );
          await waitForFaceResultRetry();
          continue;
        }

        if (
          response.status === 503 &&
          (code ===
            "BIOMETRIC_POLICY_NOT_CONFIGURED" ||
            code ===
              "BIOMETRIC_POLICY_INVALID" ||
            code ===
              "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED" ||
            code ===
              "BIOMETRIC_PROVIDER_MODE_MISMATCH" ||
            code ===
              "AWS_BIOMETRIC_NOT_CONFIGURED" ||
            code ===
              "AWS_BIOMETRIC_INVALID_QUALITY_FILTER")
        ) {
          await cancelEnrollment(false);
          throw new Error(
            "AWS biometric runtime is not configured for this CASA staging deployment. The capture was not accepted. Configure the biometric runtime, then start one fresh capture.",
          );
        }

        throw new Error(
          typeof body?.message ===
            "string"
            ? `${body.message}${code ? ` (${code})` : ""}`
            : code ||
                "Face enrollment could not be completed.",
        );
      }

      if (!completed) {
        throw new Error(
          "AWS is taking longer than expected to finalize the liveness result. Cancel this capture and start one fresh session only if the student's face status still shows incomplete.",
        );
      }

      setLiveness(null);
      setFaceCapturePhase(
        "IDLE",
      );
      setMessage(
        "Face enrollment completed and the student's biometric readiness was updated.",
      );

      const refreshed =
        await loadStudentDetail(
          selected.id,
        );

      setDetail(refreshed);
      await search(page);
    } catch (caught) {
      setFaceCapturePhase(
        liveness
          ? "ERROR"
          : "IDLE",
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "Face enrollment could not be completed.",
      );
    } finally {
      completingFaceRef.current =
        false;
      setBusy(false);
    }
  }

  async function cancelEnrollment(
    showMessage:
      boolean,
  ) {
    if (
      !selected ||
      !liveness ||
      !endpoint
    ) {
      return;
    }

    const current =
      liveness;

    setLiveness(null);
    setFaceCapturePhase(
      "IDLE",
    );

    try {
      await fetch(
        `${endpoint}/students/${encodeURIComponent(
          selected.id,
        )}/biometrics/liveness/cancel`,
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
              livenessSessionId:
                current
                  .livenessSessionId,
            }),
        },
      );
    } finally {
      if (showMessage) {
        setMessage(
          "Face enrollment was cancelled. A fresh Passkey-authorized session can be started.",
        );
      }
    }
  }

  function submitSearch(
    event:
      FormEvent,
  ) {
    event.preventDefault();
    void search(1);
  }

  const detailStudent =
    detail?.student;

  const faceStatus =
    textValue(
      recordValue(
        detailStudent,
        "face_status",
        "faceStatus",
      ),
      textValue(
        selected
          ? summaryValue(
              selected,
              "faceStatus",
              "face_status",
            )
          : undefined,
        "NEEDED",
      ),
    );

  const cardNeed =
    textValue(
      recordValue(
        detailStudent,
        "card_production_need",
        "cardProductionNeed",
      ),
      textValue(
        selected
          ? summaryValue(
              selected,
              "cardProductionNeed",
              "card_production_need",
            )
          : undefined,
        "NEEDED",
      ),
    );

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black/15">
        <div className="casa-container grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <section className="border-b border-black/15 px-5 py-6 sm:px-8 lg:border-r lg:border-b-0 lg:px-10 lg:py-8">
            <div className="flex items-center justify-between gap-5">
              <p className="casa-kicker">CASA</p>
              <a href={returnHref} className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/45 underline underline-offset-4">Back to organization</a>
            </div>
            <p className="casa-kicker mt-12 text-black/40">Identity operations</p>
            <h1 className="casa-display-compact mt-4 max-w-[9ch]">
              CAPTURE
              <br />
              OPS
            </h1>
          </section>

          <section className="flex flex-col justify-between bg-white px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
            <div>
              <p className="casa-kicker text-black/40">CASA / Internal</p>
              <h2 className="mt-4 max-w-[13ch] text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Search. Register. Onboard.
              </h2>
            </div>
            <div className="mt-10 border-l border-black/20 pl-4 font-mono text-[10px] uppercase leading-5 tracking-[0.12em]">
            <div>
              {actorName}
            </div>
              <div className="text-black/45">
                {role}
              </div>
            </div>
          </section>
        </div>
      </header>

      <div className="casa-container grid bg-white lg:grid-cols-[minmax(0,0.92fr)_minmax(430px,1.08fr)]">
        <section className="border-b border-black p-5 sm:p-8 lg:border-b-0 lg:border-r">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="casa-label">
              <span>
                Assigned school
              </span>
              <select
                className="casa-field"
                disabled={
                  Boolean(
                    initialSchoolId,
                  ) ||
                  busy ||
                  Boolean(
                    liveness,
                  )
                }
                onChange={(event) => {
                  setSchoolId(
                    event.target.value,
                  );
                  setSelected(null);
                  setDetail(null);
                  setPage(1);
                }}
                value={schoolId}
              >
                {schools.map(
                  (school) => (
                    <option
                      key={
                        school.id
                      }
                      value={
                        school.id
                      }
                    >
                      {school.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <form
              className="flex self-end border border-black"
              onSubmit={
                submitSearch
              }
            >
              <label className="min-w-0 flex-1">
                <span className="casa-sr-only">
                  Search students
                </span>
                <input
                  className="min-h-11 w-full bg-transparent px-3 outline-none"
                  onChange={(event) =>
                    setQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Name, CASA ID, admission, class, guardian"
                  value={query}
                />
              </label>
              <button
                className="border-l border-black bg-black px-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#f2f2ef]"
                type="submit"
                disabled={busy}
              >
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <select
              className="casa-field font-mono text-[10px] uppercase"
              onChange={(event) => {
                setSection(
                  event.target.value,
                );
                setPage(1);
              }}
              value={section}
              aria-label="Section filter"
            >
              <option value="ALL">
                All sections
              </option>
              <option value="PRIMARY">
                Primary
              </option>
              <option value="SECONDARY">
                Secondary
              </option>
            </select>

            <select
              className="casa-field font-mono text-[10px] uppercase"
              onChange={(event) => {
                setFace(
                  event.target.value,
                );
                setPage(1);
              }}
              value={face}
              aria-label="Face status filter"
            >
              <option value="ALL">
                All faces
              </option>
              <option value="NEEDED">
                Face needed
              </option>
              <option value="COMPLETE">
                Face complete
              </option>
              <option value="REVIEW">
                Face review
              </option>
            </select>

            <select
              className="casa-field font-mono text-[10px] uppercase"
              onChange={(event) => {
                setCompletion(
                  event.target.value,
                );
                setPage(1);
              }}
              value={completion}
              aria-label="Onboarding completion filter"
            >
              <option value="ALL">
                All
              </option>
              <option value="INCOMPLETE">
                Incomplete
              </option>
              <option value="COMPLETE">
                Complete
              </option>
            </select>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-3 border-y border-black py-3">
            <div>
              <strong className="block text-2xl tracking-[-0.04em]">
                {pagination.total}
              </strong>
              <span className="casa-kicker mt-1 block text-black/45">
                Matching students
              </span>
            </div>

            <button
              className="casa-button"
              type="button"
              disabled={
                busy ||
                pagination.total ===
                  0
              }
              onClick={() =>
                void chooseNextIncomplete()
              }
            >
              Next incomplete’
            </button>
          </div>

          <div className="border-b border-black">
            {students.map(
              (student) => {
                const first =
                  textValue(
                    summaryValue(
                      student,
                      "firstName",
                      "first_name",
                    ),
                  );
                const last =
                  textValue(
                    summaryValue(
                      student,
                      "lastName",
                      "last_name",
                    ),
                  );
                const casaId =
                  textValue(
                    summaryValue(
                      student,
                      "casaStudentId",
                      "casa_student_id",
                    ),
                    "â€”",
                  );
                const classLabel =
                  [
                    summaryValue(
                      student,
                      "classLevelName",
                      "class_level_name",
                    ),
                    summaryValue(
                      student,
                      "classArmName",
                      "class_arm_name",
                    ),
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  "No class";
                const studentFace =
                  textValue(
                    summaryValue(
                      student,
                      "faceStatus",
                      "face_status",
                    ),
                    "NEEDED",
                  );
                const complete =
                  Boolean(
                    summaryValue(
                      student,
                      "onboardingComplete",
                      "onboarding_complete",
                    ),
                  );
                const lockHolder =
                  textValue(
                    student.lock_holder_name,
                  );

                return (
                  <button
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-black/20 py-4 text-left ${
                      selected?.id ===
                      student.id
                        ? "border-l-4 border-l-black pl-3"
                        : ""
                    }`}
                    key={
                      student.id
                    }
                    onClick={() =>
                      void chooseStudent(
                        student,
                      )
                    }
                    type="button"
                    aria-current={
                      selected?.id ===
                      student.id
                        ? "true"
                        : undefined
                    }
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-base">
                        {first} {last}
                      </strong>
                      <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-black/50">
                        {casaId} · {classLabel}
                      </span>
                      {lockHolder ? (
                        <span className="mt-2 block text-[10px] text-[var(--casa-warning)]">
                          Currently handled by {lockHolder}
                        </span>
                      ) : null}
                    </span>

                    <span className="text-right">
                      <span
                        className={`casa-status ${
                          studentFace ===
                          "COMPLETE"
                            ? "casa-status-positive"
                            : studentFace ===
                                "REVIEW"
                              ? "casa-status-warning"
                              : ""
                        }`}
                      >
                        Face / {studentFace}
                      </span>
                      <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                        {complete
                          ? "Complete"
                          : "Needs work"}
                      </span>
                    </span>
                  </button>
                );
              },
            )}

            {students.length ===
            0 ? (
              <p
                className="py-10 text-sm text-black/55"
                role="status"
              >
                {busy
                  ? "Searching..."
                  : "No students match these filters."}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              className="casa-button-secondary"
              type="button"
              disabled={
                busy ||
                pagination.page <=
                  1
              }
              onClick={() =>
                void search(
                  Math.max(
                    1,
                    pagination.page -
                      1,
                  ),
                )
              }
            >
              Previous
            </button>

            <span className="font-mono text-[9px] uppercase tracking-[0.09em] text-black/45">
              Page {pagination.page} / {pagination.pages}
            </span>

            <button
              className="casa-button-secondary"
              type="button"
              disabled={
                busy ||
                pagination.page >=
                  pagination.pages
              }
              onClick={() =>
                void search(
                  Math.min(
                    pagination.pages,
                    pagination.page +
                      1,
                  ),
                )
              }
            >
              Next’
            </button>
          </div>

          <details className="mt-8 border-t border-black pt-4">
            <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Register student before capture day
            </summary>

            <p className="mt-3 max-w-xl text-xs leading-5 text-black/50">
              Enter the paper-form details before the student reaches the face
              capture desk. The same data model is used by school-side
              registration.
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
                  className="casa-field"
                  name="admissionNumber"
                />
              </label>
              <label className="casa-label">
                <span>
                  First name
                </span>
                <input
                  className="casa-field"
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
                  name="middleName"
                />
              </label>
              <label className="casa-label">
                <span>
                  Preferred name
                </span>
                <input
                  className="casa-field"
                  name="preferredName"
                />
              </label>
              <label className="casa-label">
                <span>
                  Date of birth
                </span>
                <input
                  className="casa-field"
                  name="dateOfBirth"
                  required
                  type="date"
                />
              </label>
              <label className="casa-label">
                <span>
                  Sex
                </span>
                <select
                  className="casa-field"
                  defaultValue="UNSPECIFIED"
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
              <label className="casa-label sm:col-span-2">
                <span>
                  Campus
                </span>
                <select
                  className="casa-field"
                  key={academicOptions.branches
                    .map(
                      (branch) =>
                        branch.id,
                    )
                    .join("|")}
                  name="branchId"
                  defaultValue={
                    academicOptions.branches.length ===
                    1
                      ? academicOptions.branches[0]
                          ?.id
                      : ""
                  }
                  required={
                    academicOptions.branches.length >
                    1
                  }
                >
                  <option
                    value=""
                    disabled={
                      academicOptions.branches.length >
                      1
                    }
                  >
                    {academicOptions.branches.length ===
                    1
                      ? "Only campus selected automatically"
                      : "Select campus"}
                  </option>
                  {academicOptions.branches.map(
                    (
                      branch,
                    ) => (
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
                <span className="mt-1 text-[10px] leading-4 text-black/45">
                  One-campus schools are assigned automatically. Multi-campus schools require a campus.
                </span>
              </label>

              <label className="casa-label sm:col-span-2">
                <span>
                  Admission date
                </span>
                <input
                  className="casa-field"
                  name="admissionDate"
                  required
                  type="date"
                />
              </label>
              <button
                className="casa-button sm:col-span-2"
                disabled={busy}
                type="submit"
              >
                Register student
              </button>
            </form>
          </details>
        </section>

        <section className="p-5 sm:p-8">
          {!selected ||
          !detailStudent ? (
            <div className="min-h-[420px] border-t border-black pt-6">
              <p className="casa-kicker">
                Capture-day workspace
              </p>
              <h2 className="casa-display-compact mt-5 max-w-xl">
                Search or register a student for this selected school.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-black/55">
                Search first, acquire the lightweight operator lock, complete
                the missing details, guardian and class work, then hand off to
                the school-authorized face workflow.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black pb-5">
                <div>
                  <p className="casa-kicker">
                    Currently handling
                  </p>
                  <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">
                    {textValue(
                      recordValue(
                        detailStudent,
                        "first_name",
                        "firstName",
                      ),
                    )}{" "}
                    {textValue(
                      recordValue(
                        detailStudent,
                        "last_name",
                        "lastName",
                      ),
                    )}
                  </h2>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.09em] text-black/45">
                    {textValue(
                      recordValue(
                        detailStudent,
                        "casa_student_id",
                        "casaStudentId",
                      ),
                      "â€”",
                    )}
                    {recordValue(
                      detailStudent,
                      "admission_number",
                      "admissionNumber",
                    )
                      ? ` · ${String(
                          recordValue(
                            detailStudent,
                            "admission_number",
                            "admissionNumber",
                          ),
                        )}`
                      : ""}
                  </p>
                </div>

                <button
                  className="casa-button-secondary"
                  onClick={() =>
                    void releaseStudent()
                  }
                  type="button"
                  disabled={busy}
                >
                  Release
                </button>
              </div>

              <div className="grid grid-cols-2 border-l border-t border-black sm:grid-cols-4">
                <div className="border-b border-r border-black p-3">
                  <span className="casa-kicker text-black/45">
                    Details
                  </span>
                  <strong className="mt-2 block text-lg">
                    Loaded
                  </strong>
                </div>
                <div className="border-b border-r border-black p-3">
                  <span className="casa-kicker text-black/45">
                    Guardians
                  </span>
                  <strong className="mt-2 block text-lg">
                    {detail.guardians?.length ??
                      0}
                  </strong>
                </div>
                <div className="border-b border-r border-black p-3">
                  <span className="casa-kicker text-black/45">
                    Face
                  </span>
                  <strong className="mt-2 block text-sm">
                    {faceStatus}
                  </strong>
                </div>
                <div className="border-b border-r border-black p-3">
                  <span className="casa-kicker text-black/45">
                    Card
                  </span>
                  <strong className="mt-2 block text-sm">
                    {cardNeed}
                  </strong>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`casa-status ${
                    detail.onboardingComplete
                      ? "casa-status-positive"
                      : "casa-status-warning"
                  }`}
                >
                  {detail.onboardingComplete
                    ? "Onboarding complete"
                    : "Onboarding incomplete"}
                </span>
                {selectedSchool ? (
                  <span className="casa-status">
                    {selectedSchool.name}
                  </span>
                ) : null}
              </div>

              <div className="mt-6 border-t border-black pt-5">
                <p className="casa-kicker">
                  Operator lock
                </p>
                <p className="mt-2 text-sm leading-6">
                  {textValue(
                    recordValue(
                      detail.lock ??
                        undefined,
                      "holder_name",
                      "actor_name",
                    ),
                  ) ||
                    `Locked to ${actorName} for this work session.`}
                </p>
              </div>

              <details
                className="mt-6 border-t border-black pt-4"
                open
              >
                <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                  Student details
                </summary>

                <form
                  key={
                    selected.id
                  }
                  className="mt-5 grid gap-3 sm:grid-cols-2"
                  onSubmit={
                    updateStudent
                  }
                >
                  <label className="casa-label sm:col-span-2">
                    <span>
                      Admission number / optional
                    </span>
                    <input
                      className="casa-field"
                      defaultValue={
                        textValue(
                          recordValue(
                            detailStudent,
                            "admission_number",
                            "admissionNumber",
                          ),
                        )
                      }
                      name="admissionNumber"
                    />
                  </label>
                  <label className="casa-label">
                    <span>
                      First name
                    </span>
                    <input
                      className="casa-field"
                      defaultValue={
                        textValue(
                          recordValue(
                            detailStudent,
                            "first_name",
                            "firstName",
                          ),
                        )
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
                        textValue(
                          recordValue(
                            detailStudent,
                            "last_name",
                            "lastName",
                          ),
                        )
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
                        textValue(
                          recordValue(
                            detailStudent,
                            "middle_name",
                            "middleName",
                          ),
                        )
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
                        textValue(
                          recordValue(
                            detailStudent,
                            "preferred_name",
                            "preferredName",
                          ),
                        )
                      }
                      name="preferredName"
                    />
                  </label>
                  <label className="casa-label">
                    <span>
                      Date of birth
                    </span>
                    <input
                      className="casa-field"
                      defaultValue={
                        textValue(
                          recordValue(
                            detailStudent,
                            "date_of_birth",
                            "dateOfBirth",
                          ),
                        )
                      }
                      name="dateOfBirth"
                      required
                      type="date"
                    />
                  </label>
                  <label className="casa-label">
                    <span>
                      Sex
                    </span>
                    <select
                      className="casa-field"
                      defaultValue={
                        textValue(
                          recordValue(
                            detailStudent,
                            "sex",
                          ),
                          "UNSPECIFIED",
                        )
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
                  <label className="casa-label sm:col-span-2">
                    <span>
                      Admission date
                    </span>
                    <input
                      className="casa-field"
                      defaultValue={
                        textValue(
                          recordValue(
                            detailStudent,
                            "admission_date",
                            "admissionDate",
                          ),
                        )
                      }
                      name="admissionDate"
                      required
                      type="date"
                    />
                  </label>

                  <button
                    className="casa-button sm:col-span-2"
                    disabled={busy}
                    type="submit"
                  >
                    Save details
                  </button>
                </form>
              </details>

              <details className="mt-6 border-t border-black pt-4">
                <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                  Guardian
                </summary>

                {detail.guardians &&
                detail.guardians.length >
                  0 ? (
                  <div className="mt-4 border-t border-black/25">
                    {detail.guardians.map(
                      (
                        guardian,
                        index,
                      ) => (
                        <div
                          className="border-b border-black/20 py-3"
                          key={
                            textValue(
                              guardian.id,
                              String(
                                index,
                              ),
                            )
                          }
                        >
                          <strong className="text-sm">
                            {textValue(
                              recordValue(
                                guardian,
                                "full_name",
                                "fullName",
                              ),
                              "Guardian",
                            )}
                          </strong>
                          <p className="mt-1 text-xs text-black/50">
                            {textValue(
                              recordValue(
                                guardian,
                                "relationship_label",
                                "relationshipLabel",
                              ),
                            )}
                            {booleanValue(
                              recordValue(
                                guardian,
                                "is_primary",
                                "isPrimary",
                              ),
                            )
                              ? " · Primary"
                              : ""}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-black/50">
                    No guardian linked yet.
                  </p>
                )}

                <form
                  className="mt-5 grid gap-3"
                  onSubmit={
                    addGuardian
                  }
                >
                  <label className="casa-label">
                    <span>
                      Guardian name
                    </span>
                    <input
                      className="casa-field"
                      name="fullName"
                      required
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="casa-label">
                      <span>
                        Email
                      </span>
                      <input
                        className="casa-field"
                        name="email"
                        type="email"
                      />
                    </label>
                    <label className="casa-label">
                      <span>
                        Phone
                      </span>
                      <input
                        className="casa-field"
                        name="phone"
                      />
                    </label>
                  </div>
                  <label className="casa-label">
                    <span>
                      Relationship
                    </span>
                    <input
                      className="casa-field"
                      name="relationshipLabel"
                      placeholder="e.g. Mother"
                      required
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      [
                        "isPrimary",
                        "Primary",
                        false,
                      ],
                      [
                        "isEmergencyContact",
                        "Emergency",
                        false,
                      ],
                      [
                        "pickupAuthorized",
                        "Pickup authorized",
                        false,
                      ],
                      [
                        "receivesNotifications",
                        "Notifications",
                        true,
                      ],
                    ].map(
                      ([
                        name,
                        label,
                        checked,
                      ]) => (
                        <label
                          className="flex items-center gap-2 border border-black/25 p-2"
                          key={
                            String(name)
                          }
                        >
                          <input
                            type="checkbox"
                            name={
                              String(name)
                            }
                            defaultChecked={
                              Boolean(
                                checked,
                              )
                            }
                          />
                          {label}
                        </label>
                      ),
                    )}
                  </div>
                  <button
                    className="casa-button-secondary"
                    disabled={busy}
                    type="submit"
                  >
                    Create & link guardian
                  </button>
                </form>
              </details>

              <details className="mt-6 border-t border-black pt-4">
                <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                  Class enrollment
                </summary>

                {detail.enrollments &&
                detail.enrollments.length >
                  0 ? (
                  <div className="mt-4 border-t border-black/25">
                    {detail.enrollments.map(
                      (
                        enrollment,
                        index,
                      ) => (
                        <div
                          className="border-b border-black/20 py-3"
                          key={
                            textValue(
                              enrollment.id,
                              String(
                                index,
                              ),
                            )
                          }
                        >
                          <strong className="text-sm">
                            {textValue(
                              recordValue(
                                enrollment,
                                "class_level_name",
                                "classLevelName",
                              ),
                            )}{" "}
                            ·{" "}
                            {textValue(
                              recordValue(
                                enrollment,
                                "class_arm_name",
                                "classArmName",
                              ),
                            )}
                          </strong>
                          <p className="mt-1 text-xs text-black/50">
                            {textValue(
                              recordValue(
                                enrollment,
                                "academic_session_name",
                                "academicSessionName",
                              ),
                            )}{" "}
                            ·{" "}
                            {textValue(
                              recordValue(
                                enrollment,
                                "status",
                              ),
                            )}{" "}
                            · {textValue(
                              recordValue(
                                enrollment,
                                "branch_name",
                                "branchName",
                              ),
                            )}{" "}
                            · {textValue(
                              recordValue(
                                enrollment,
                                "arrival_method",
                                "arrivalMethod",
                              ),
                            )}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-black/50">
                    No class enrollment yet.
                  </p>
                )}

                {academicOptions.sessions.length >
                  0 &&
                academicOptions.classArms.length >
                  0 &&
                academicOptions.branches.length >
                  0 ? (
                  <form
                    className="mt-5 grid gap-3"
                    onSubmit={
                      assignEnrollment
                    }
                  >
                    <label className="casa-label">
                      <span>
                        Academic session
                      </span>
                      <select
                        className="casa-field"
                        defaultValue=""
                        name="academicSessionId"
                        required
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
                        Branch
                      </span>
                      <select
                        className="casa-field"
                        defaultValue=""
                        name="branchId"
                        required
                      >
                        <option value="" disabled>
                          Select branch
                        </option>
                        {academicOptions.branches.map(
                          (branch) => (
                            <option
                              key={branch.id}
                              value={branch.id}
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

                    <label className="casa-label">
                      <span>
                        Class
                      </span>
                      <select
                        className="casa-field"
                        defaultValue=""
                        name="classArmId"
                        required
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
                              {arm.branchName} · {arm.classLevelName} · {arm.name}
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
                        className="casa-field"
                        defaultValue=""
                        name="arrivalMethod"
                        required
                      >
                        <option value="" disabled>
                          Select arrival method
                        </option>
                        <option value="SCHOOL_BUS">
                          School bus
                        </option>
                        <option value="INDEPENDENT">
                          Independent
                        </option>
                      </select>
                    </label>

                    <label className="casa-label">
                      <span>
                        Starts on
                      </span>
                      <input
                        className="casa-field"
                        name="startsOn"
                        required
                        type="date"
                      />
                    </label>

                    <button
                      className="casa-button"
                      disabled={busy}
                      type="submit"
                    >
                      Assign class
                    </button>
                  </form>
                ) : (
                  <p className="casa-notice mt-4 text-[var(--casa-warning)]">
                    Academic setup is not ready yet. This does not block CASA
                    from completing the student&apos;s identity and guardian/contact
                    record. Ask the School Admin to finish session, terms, class
                    and branch setup; then return here to assign the student.
                  </p>
                )}
              </details>

              <div className="mt-6 border-t border-black pt-5">
                <div className="mb-5 border border-black bg-[var(--casa-paper)] p-4">
                  <p className="casa-kicker">Onboarding order</p>
                  <p className="mt-2 text-xs leading-5 text-black/60">
                    CASA can complete student identity and guardian/contact data
                    before the school creates a session or class. School setup
                    comes next: session + three terms, classes/branches, calendar
                    and holidays, attendance policy and terminal. Then assign the
                    student academically, capture the face, produce/print the card,
                    and let the school confirm physical handover to activate it.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <p className="casa-kicker">
                      Face capture
                    </p>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-black/55">
                      Face capture remains provider-gated by the configured
                      AWS biometric mode. CASA capture operations now use the
                      same real AWS Face Liveness engine as school Identity
                      Operations. A fresh
                      human Passkey step-up is required before every enrollment
                      or re-enrollment. No biometric success is inferred from
                      the frontend.
                    </p>
                  </div>

                  {!liveness ? (
                    <button
                      className="casa-button"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void startEnrollment()
                      }
                    >
                      {faceCapturePhase ===
                      "ERROR"
                        ? "Start fresh face capture with Passkey"
                        : faceStatus ===
                            "COMPLETE"
                          ? "Re-enroll face with Passkey"
                          : "Capture face with Passkey"}
                    </button>
                  ) : null}
                </div>

                {faceCapturePhase ===
                "ERROR" &&
                !liveness ? (
                  <div
                    className="casa-notice mt-5 border border-black p-5"
                    role="alert"
                  >
                    <p className="casa-kicker">
                      Face capture needs a fresh session
                    </p>
                    <p className="mt-3 text-sm leading-6">
                      The previous AWS liveness session was cancelled after
                      CASA rejected the runtime configuration. It cannot be
                      safely resumed. Once System Health shows the biometric
                      configuration as complete, use â€œStart fresh face capture
                      with Passkeyâ€ once. A new Passkey step-up is required
                      because this is a genuinely new biometric session.
                    </p>
                  </div>
                ) : null}

                {liveness &&
                credentialProvider ? (
                  <div className="mt-5">
                    {faceCapturePhase ===
                    "VERIFYING" ? (
                      <div className="casa-notice border border-black p-5" role="status">
                        <p className="casa-kicker">Verifying face</p>
                        <p className="mt-3 text-sm leading-6">
                          Camera capture is complete. CASA is waiting for AWS
                          liveness results and securely enrolling the student&apos;s
                          face. Keep this page open; you will not be asked for
                          another Passkey unless a genuinely new capture session
                          is required.
                        </p>
                      </div>
                    ) : (
                    <div className="min-h-[28rem] overflow-hidden border border-black bg-black">
                      <ThemeProvider>
                        <FaceLivenessDetectorCore
                          sessionId={
                            liveness
                              .providerSessionId
                          }
                          region={
                            liveness
                              .streaming
                              .region
                          }
                          onAnalysisComplete={
                            completeEnrollment
                          }
                          onUserCancel={() =>
                            void cancelEnrollment(
                              true,
                            )
                          }
                          onError={() =>
                            void cancelEnrollment(
                              true,
                            )
                          }
                          config={{
                            credentialProvider,
                          }}
                        />
                      </ThemeProvider>
                    </div>
                    )}

                    <button
                      className="casa-button-secondary mt-4"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void cancelEnrollment(
                          true,
                        )
                      }
                    >
                      Cancel face enrollment
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                className="casa-button mt-7"
                type="button"
                disabled={busy}
                onClick={() =>
                  void chooseNextIncomplete()
                }
              >
                Release & next incomplete ’
              </button>
            </div>
          )}

          {message ? (
            <p
              className="casa-notice mt-6"
              role="status"
            >
              {message}
            </p>
          ) : null}

          {error ? (
            <p
              className="casa-error mt-6"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
