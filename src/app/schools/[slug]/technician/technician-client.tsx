"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ThemeProvider,
} from "@aws-amplify/ui-react";
import type {
  AwsCredentialProvider,
} from "@aws-amplify/ui-react-liveness";

import {
  obtainPasskeyStepUpGrant,
} from "@/client/passkey-step-up";
import {
  biometricEnrollmentAction,
  terminalActionNeedsReason,
  terminalPasskeyAction,
  type TerminalLifecycleAction,
} from "@/technician/operations";

import styles from "./technician.module.css";

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
        <div
          className={
            styles.notice
          }
        >
          Preparing face cameraâ€¦
        </div>
      ),
    },
  );

interface StudentRow {
  id: string;
  casaStudentId: string;
  admissionNumber:
    string | null;
  firstName: string;
  middleName:
    string | null;
  lastName: string;
  preferredName:
    string | null;
  status: string;
  classArmName:
    string | null;
  classLevelName:
    string | null;
}

interface StudentListResponse {
  students:
    StudentRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

interface BiometricProfile {
  id: string;
  provider: string;
  status: string;
  enrolledAt: string;
  revokedAt:
    string | null;
}

interface BiometricStatus {
  activeProfile:
    BiometricProfile | null;
  profiles:
    BiometricProfile[];
}

interface StudentCard {
  id: string;
  serialNumber: string;
  status: string;
  issuedAt: string;
  expiresAt:
    string | null;
  deactivatedAt:
    string | null;
}

interface CardStatus {
  cards:
    StudentCard[];
}

interface EnrollmentLiveness {
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
}

interface Terminal {
  id: string;
  name: string;
  terminalCode: string;
  status:
    | "ACTIVE"
    | "SUSPENDED"
    | "REVOKED";
  credentialVersion: number;
  lastSeenAt:
    string | null;
  createdAt: string;
  updatedAt: string;
}

interface OneTimeCredential {
  terminalId: string;
  terminalName: string;
  token: string;
  kind:
    | "PROVISIONED"
    | "ROTATED";
}

function fullName(
  student:
    StudentRow,
): string {
  return [
    student.firstName,
    student.middleName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function messageFromUnknown(
  value:
    unknown,
  fallback:
    string,
): string {
  if (
    typeof value ===
      "object" &&
    value !==
      null &&
    "message" in value &&
    typeof value.message ===
      "string"
  ) {
    return value.message;
  }

  if (
    typeof value ===
      "object" &&
    value !==
      null &&
    "code" in value &&
    typeof value.code ===
      "string"
  ) {
    return value.code;
  }

  return fallback;
}

export default function TechnicianClient(
  {
    slug,
    schoolName,
  }: {
    slug: string;
    schoolName: string;
  },
) {
  const [
    students,
    setStudents,
  ] =
    useState<
      StudentRow[]
    >([]);

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    pages,
    setPages,
  ] =
    useState(1);

  const [
    total,
    setTotal,
  ] =
    useState(0);

  const [
    queryInput,
    setQueryInput,
  ] =
    useState("");

  const [
    activeQuery,
    setActiveQuery,
  ] =
    useState("");

  const [
    selected,
    setSelected,
  ] =
    useState<
      StudentRow | null
    >(null);

  const [
    biometric,
    setBiometric,
  ] =
    useState<
      BiometricStatus | null
    >(null);

  const [
    cards,
    setCards,
  ] =
    useState<
      CardStatus | null
    >(null);

  const [
    liveness,
    setLiveness,
  ] =
    useState<
      EnrollmentLiveness | null
    >(null);

  const [
    terminals,
    setTerminals,
  ] =
    useState<
      Terminal[]
    >([]);

  const [
    terminalName,
    setTerminalName,
  ] =
    useState("");

  const [
    terminalReasons,
    setTerminalReasons,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    oneTimeCredential,
    setOneTimeCredential,
  ] =
    useState<
      OneTimeCredential | null
    >(null);

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

  const loadStudents =
    useCallback(
      async (
        targetPage:
          number,
        targetQuery:
          string,
      ) => {
        const params =
          new URLSearchParams({
            page:
              String(
                targetPage,
              ),
          });

        if (
          targetQuery.trim()
        ) {
          params.set(
            "q",
            targetQuery.trim(),
          );
        }

        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/registry/students?${params.toString()}`,
            {
              credentials:
                "same-origin",
              cache:
                "no-store",
            },
          );

        const body:
          unknown =
            await response.json();

        if (!response.ok) {
          throw new Error(
            messageFromUnknown(
              body,
              "Students could not be loaded.",
            ),
          );
        }

        const data =
          body as
            StudentListResponse;

        setStudents(
          data.students,
        );
        setPage(
          data.pagination.page,
        );
        setPages(
          data.pagination.pages,
        );
        setTotal(
          data.pagination.total,
        );
        setActiveQuery(
          targetQuery.trim(),
        );
      },
      [
        slug,
      ],
    );

  const loadTerminals =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/terminals`,
            {
              credentials:
                "same-origin",
              cache:
                "no-store",
            },
          );

        const body:
          unknown =
            await response.json();

        if (!response.ok) {
          throw new Error(
            messageFromUnknown(
              body,
              "Terminals could not be loaded.",
            ),
          );
        }

        const data =
          body as {
            terminals:
              Terminal[];
          };

        setTerminals(
          data.terminals,
        );
      },
      [
        slug,
      ],
    );

  const loadSelectedOperations =
    useCallback(
      async (
        student:
          StudentRow,
      ) => {
        const base =
          `/api/schools/${encodeURIComponent(
            slug,
          )}/registry/students/${encodeURIComponent(
            student.id,
          )}`;

        const [
          biometricResponse,
          cardResponse,
        ] =
          await Promise.all([
            fetch(
              `${base}/biometrics`,
              {
                credentials:
                  "same-origin",
                cache:
                  "no-store",
              },
            ),
            fetch(
              `${base}/cards`,
              {
                credentials:
                  "same-origin",
                cache:
                  "no-store",
              },
            ),
          ]);

        const biometricBody:
          unknown =
            await biometricResponse.json();

        const cardBody:
          unknown =
            await cardResponse.json();

        if (
          !biometricResponse.ok
        ) {
          throw new Error(
            messageFromUnknown(
              biometricBody,
              "Biometric status could not be loaded.",
            ),
          );
        }

        if (
          !cardResponse.ok
        ) {
          throw new Error(
            messageFromUnknown(
              cardBody,
              "Card status could not be loaded.",
            ),
          );
        }

        setBiometric(
          biometricBody as
            BiometricStatus,
        );
        setCards(
          cardBody as
            CardStatus,
        );
      },
      [
        slug,
      ],
    );

  useEffect(
    () => {
      const initial =
        window.setTimeout(
          () => {
            void Promise.all([
              loadStudents(
                1,
                "",
              ),
              loadTerminals(),
            ]).catch(
              (
                caught,
              ) => {
                setError(
                  caught instanceof
                    Error
                    ? caught.message
                    : "Technician operations could not be loaded.",
                );
              },
            );
          },
          0,
        );

      const terminalRefresh =
        window.setInterval(
          () => {
            void loadTerminals()
              .catch(
                () => {
                  // The next refresh retries.
                },
              );
          },
          30_000,
        );

      return () => {
        window.clearTimeout(
          initial,
        );
        window.clearInterval(
          terminalRefresh,
        );
      };
    },
    [
      loadStudents,
      loadTerminals,
    ],
  );

  const activeCard =
    cards?.cards.find(
      (card) =>
        card.status ===
        "ACTIVE",
    ) ??
    null;

  const enrollmentAction =
    biometricEnrollmentAction(
      Boolean(
        biometric
          ?.activeProfile,
      ),
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

  async function chooseStudent(
    student:
      StudentRow,
  ) {
    setSelected(
      student,
    );
    setBiometric(
      null,
    );
    setCards(
      null,
    );
    setLiveness(
      null,
    );
    setError(
      null,
    );
    setNotice(
      null,
    );

    try {
      await loadSelectedOperations(
        student,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Student identity readiness could not be loaded.",
      );
    }
  }

  async function searchStudents() {
    setError(
      null,
    );

    try {
      await loadStudents(
        1,
        queryInput,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Student search failed.",
      );
    }
  }

  async function startEnrollment() {
    if (!selected) {
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
      const action =
        biometricEnrollmentAction(
          Boolean(
            biometric
              ?.activeProfile,
          ),
        );

      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action,
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/registry/students/${encodeURIComponent(
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

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          messageFromUnknown(
            body,
            "Face enrollment could not be started.",
          ),
        );
      }

      const data =
        body as {
          action:
            string;
          liveness:
            EnrollmentLiveness;
        };

      if (
        !data.liveness ||
        data.action !==
          action
      ) {
        throw new Error(
          "CASA returned an unexpected biometric enrollment state.",
        );
      }

      setLiveness(
        data.liveness,
      );
      setNotice(
        action ===
          "BIOMETRIC_ENROLL"
          ? "Face enrollment started."
          : "Face re-enrollment started.",
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Face enrollment could not be started.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function completeEnrollment() {
    if (
      !selected ||
      !liveness
    ) {
      return;
    }

    const current =
      liveness;

    setBusy(
      true,
    );
    setError(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/registry/students/${encodeURIComponent(
            selected.id,
          )}/biometrics/liveness/complete`,
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

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          messageFromUnknown(
            body,
            "Face enrollment could not be completed.",
          ),
        );
      }

      setLiveness(
        null,
      );
      setNotice(
        "The student's active face identity has been updated.",
      );

      await loadSelectedOperations(
        selected,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Face enrollment could not be completed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function cancelEnrollment(
    showNotice:
      boolean,
  ) {
    if (
      !selected ||
      !liveness
    ) {
      return;
    }

    const current =
      liveness;

    setLiveness(
      null,
    );

    try {
      await fetch(
        `/api/schools/${encodeURIComponent(
          slug,
        )}/registry/students/${encodeURIComponent(
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
      if (showNotice) {
        setNotice(
          "Face enrollment was cancelled. You can start a fresh session immediately.",
        );
      }
    }
  }

  async function provisionTerminal() {
    const name =
      terminalName.trim();

    if (!name) {
      setError(
        "Enter a clear scanner name.",
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
    setOneTimeCredential(
      null,
    );

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action:
            "TERMINAL_PROVISION",
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/terminals`,
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
                name,
              }),
          },
        );

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          messageFromUnknown(
            body,
            "Scanner could not be provisioned.",
          ),
        );
      }

      const data =
        body as {
          terminal: {
            id:
              string;
            name:
              string;
          };
          credential: {
            token:
              string;
            shownOnce:
              boolean;
          };
        };

      if (
        !data.credential
          ?.token ||
        data.credential
          .shownOnce !==
          true
      ) {
        throw new Error(
          "CASA did not return the expected one-time scanner credential.",
        );
      }

      setOneTimeCredential({
        terminalId:
          data.terminal.id,
        terminalName:
          data.terminal.name,
        token:
          data.credential.token,
        kind:
          "PROVISIONED",
      });

      setTerminalName(
        "",
      );
      setNotice(
        "Scanner provisioned. Transfer the one-time credential directly to that device.",
      );

      await loadTerminals();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Scanner could not be provisioned.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function mutateTerminal(
    terminal:
      Terminal,
    action:
      TerminalLifecycleAction,
  ) {
    const reason =
      terminalReasons[
        terminal.id
      ]?.trim() ??
      "";

    if (
      terminalActionNeedsReason(
        action,
      ) &&
      !reason
    ) {
      setError(
        "A reason is required before revoking a scanner.",
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
    setOneTimeCredential(
      null,
    );

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug:
            slug,
          action:
            terminalPasskeyAction(
              action,
            ),
        });

      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/terminals/${encodeURIComponent(
            terminal.id,
          )}`,
          {
            method:
              "PATCH",
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
                action,
                reason:
                  reason ||
                  null,
              }),
          },
        );

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          messageFromUnknown(
            body,
            "Scanner lifecycle action failed.",
          ),
        );
      }

      const data =
        body as {
          terminal: {
            id:
              string;
            status:
              string;
          };
          credential?: {
            token:
              string;
            shownOnce:
              boolean;
          };
        };

      if (
        action ===
          "ROTATE_CREDENTIAL"
      ) {
        if (
          !data.credential
            ?.token ||
          data.credential
            .shownOnce !==
            true
        ) {
          throw new Error(
            "CASA did not return the replacement scanner credential.",
          );
        }

        setOneTimeCredential({
          terminalId:
            terminal.id,
          terminalName:
            terminal.name,
          token:
            data.credential.token,
          kind:
            "ROTATED",
        });
      }

      setNotice(
        action ===
          "ROTATE_CREDENTIAL"
          ? "Scanner credential rotated. The old credential no longer authenticates."
          : `Scanner ${action.toLowerCase().replace(
              "_",
              " ",
            )} completed.`,
      );

      await loadTerminals();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Scanner lifecycle action failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function copyCredential() {
    if (
      !oneTimeCredential
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        oneTimeCredential.token,
      );

      setNotice(
        "One-time scanner credential copied.",
      );
    } catch {
      setError(
        "Your browser could not copy the credential. Select the value manually.",
      );
    }
  }

  return (
    <main
      className={
        styles.shell
      }
    >
      <header
        className={
          styles.top
        }
      >
        <h1
          className={
            styles.title
          }
        >
          IDENTITY
          <br />
          OPERATIONS
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
          School Technician workbench
        </div>
      </header>

      <nav
        className={
          styles.nav
        }
      >
        <Link
          href={
            `/schools/${slug}/registry`
          }
        >
          Registry
        </Link>
        <Link
          href={
            `/schools/${slug}/attendance`
          }
        >
          Attendance
        </Link>
        <Link
          href="/scanner"
        >
          Scanner PWA
        </Link>
      </nav>

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

      <div
        className={
          styles.grid
        }
      >
        <aside
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
                styles.caption
              }
            >
              {total} records
            </span>
          </div>

          <div
            className={
              styles.search
            }
          >
            <input
              className={
                styles.input
              }
              value={
                queryInput
              }
              placeholder="Name, CASA ID, school number"
              onChange={
                (
                  event,
                ) =>
                  setQueryInput(
                    event.target.value,
                  )
              }
              onKeyDown={
                (
                  event,
                ) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    void searchStudents();
                  }
                }
              }
            />

            <button
              type="button"
              className={
                styles.button
              }
              onClick={
                () =>
                  void searchStudents()
              }
            >
              Search
            </button>
          </div>

          <div
            className={
              styles.studentList
            }
          >
            {students.map(
              (
                student,
              ) => (
                <button
                  key={
                    student.id
                  }
                  type="button"
                  className={
                    styles.studentButton
                  }
                  aria-current={
                    selected?.id ===
                    student.id
                      ? "true"
                      : undefined
                  }
                  onClick={
                    () =>
                      void chooseStudent(
                        student,
                      )
                  }
                >
                  <span
                    className={
                      styles.studentName
                    }
                  >
                    {fullName(
                      student,
                    )}
                  </span>
                  <span
                    className={
                      styles.studentMeta
                    }
                  >
                    {
                      student.casaStudentId
                    }
                    {student.admissionNumber
                      ? ` Â· ${student.admissionNumber}`
                      : ""}
                    <br />
                    {student.classLevelName ??
                      "No class"}
                    {student.classArmName
                      ? ` ${student.classArmName}`
                      : ""}
                  </span>
                </button>
              ),
            )}

            {students.length ===
              0 && (
              <p
                className={
                  styles.empty
                }
              >
                No students match this search.
              </p>
            )}
          </div>

          <div
            className={
              styles.pagination
            }
          >
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={
                page <= 1
              }
              onClick={
                () =>
                  void loadStudents(
                    page - 1,
                    activeQuery,
                  )
              }
            >
              Previous
            </button>

            <span
              className={
                styles.small
              }
            >
              {page}/{pages}
            </span>

            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={
                page >= pages
              }
              onClick={
                () =>
                  void loadStudents(
                    page + 1,
                    activeQuery,
                  )
              }
            >
              Next
            </button>
          </div>
        </aside>

        <div>
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
                Identity readiness
              </h2>
              <span
                className={
                  styles.caption
                }
              >
                Card identifies Â· face verifies
              </span>
            </div>

            {!selected ? (
              <p
                className={
                  styles.empty
                }
              >
                Select a student to inspect identity readiness.
              </p>
            ) : (
              <>
                <div
                  className={
                    styles.identityHero
                  }
                >
                  <h3
                    className={
                      styles.identityName
                    }
                  >
                    {fullName(
                      selected,
                    )}
                  </h3>
                  <div
                    className={
                      styles.identityCode
                    }
                  >
                    {
                      selected.casaStudentId
                    }
                    {selected.admissionNumber
                      ? ` Â· ${selected.admissionNumber}`
                      : ""}
                    {" Â· "}
                    {selected.classLevelName ??
                      "No class"}
                    {selected.classArmName
                      ? ` ${selected.classArmName}`
                      : ""}
                  </div>
                </div>

                <div
                  className={
                    styles.readiness
                  }
                >
                  <div
                    className={
                      styles.readinessCell
                    }
                  >
                    <span
                      className={
                        styles.readinessValue
                      }
                    >
                      {biometric
                        ?.activeProfile
                        ? "READY"
                        : "MISSING"}
                    </span>
                    <span
                      className={
                        styles.readinessLabel
                      }
                    >
                      Face identity
                    </span>
                  </div>

                  <div
                    className={
                      styles.readinessCell
                    }
                  >
                    <span
                      className={
                        styles.readinessValue
                      }
                    >
                      {activeCard
                        ? "ACTIVE"
                        : "MISSING"}
                    </span>
                    <span
                      className={
                        styles.readinessLabel
                      }
                    >
                      Student card
                    </span>
                  </div>
                </div>

                {biometric && (
                  <div
                    className={
                      styles.actionRow
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      disabled={
                        busy ||
                        Boolean(
                          liveness,
                        )
                      }
                      onClick={
                        () =>
                          void startEnrollment()
                      }
                    >
                      {enrollmentAction ===
                        "BIOMETRIC_ENROLL"
                        ? "Enroll face with Passkey"
                        : "Re-enroll face with Passkey"}
                    </button>

                    <Link
                      className={
                        styles.secondary
                      }
                      href={
                        `/schools/${slug}/registry`
                      }
                    >
                      Open Registry for card lifecycle
                    </Link>
                  </div>
                )}

                <p
                  className={
                    styles.small
                  }
                >
                  Card issuance remains available through the existing Registry workflow. This workbench does not expose the raw one-time student-card credential; the central personalized card-production pipeline is a separate next backend phase.
                </p>

                {liveness &&
                  credentialProvider && (
                  <>
                    <div
                      className={
                        styles.livenessFrame
                      }
                    >
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
                          onUserCancel={
                            () =>
                              void cancelEnrollment(
                                true,
                              )
                          }
                          onError={
                            () =>
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

                    <div
                      className={
                        styles.actionRow
                      }
                    >
                      <button
                        type="button"
                        className={
                          styles.secondary
                        }
                        onClick={
                          () =>
                            void cancelEnrollment(
                              true,
                            )
                        }
                      >
                        Cancel face enrollment
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>

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
                Scanner terminals
              </h2>
              <span
                className={
                  styles.caption
                }
              >
                Human Passkey step-up
              </span>
            </div>

            <div
              className={
                styles.search
              }
            >
              <input
                className={
                  styles.input
                }
                value={
                  terminalName
                }
                placeholder="e.g. Main Gate Tablet"
                onChange={
                  (
                    event,
                  ) =>
                    setTerminalName(
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
                  busy
                }
                onClick={
                  () =>
                    void provisionTerminal()
                }
              >
                Provision with Passkey
              </button>
            </div>

            {oneTimeCredential && (
              <div
                className={
                  styles.credential
                }
              >
                <strong>
                  {oneTimeCredential.kind ===
                    "PROVISIONED"
                    ? "One-time scanner credential"
                    : "Replacement scanner credential"}
                </strong>
                <p
                  className={
                    styles.small
                  }
                >
                  Transfer this directly to {oneTimeCredential.terminalName}. CASA will not be able to reconstruct it later. Do not put it in school spreadsheets, chat groups, URLs, or analytics.
                </p>
                <div
                  className={
                    styles.credentialValue
                  }
                >
                  {
                    oneTimeCredential.token
                  }
                </div>
                <div
                  className={
                    styles.actionRow
                  }
                >
                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () =>
                        void copyCredential()
                    }
                  >
                    Copy credential
                  </button>
                  <button
                    type="button"
                    className={
                      styles.secondary
                    }
                    onClick={
                      () =>
                        setOneTimeCredential(
                          null,
                        )
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div
              className={
                styles.terminals
              }
            >
              {terminals.map(
                (
                  terminal,
                ) => (
                  <div
                    key={
                      terminal.id
                    }
                    className={
                      styles.terminal
                    }
                  >
                    <div
                      className={
                        styles.terminalHead
                      }
                    >
                      <div>
                        <div
                          className={
                            styles.terminalName
                          }
                        >
                          {terminal.name}
                        </div>
                        <div
                          className={
                            styles.terminalCode
                          }
                        >
                          {
                            terminal.terminalCode
                          }
                          {" Â· "}
                          {
                            terminal.status
                          }
                          {" Â· credential v"}
                          {
                            terminal.credentialVersion
                          }
                        </div>
                      </div>

                      <span
                        className={
                          styles.caption
                        }
                      >
                        {terminal.lastSeenAt
                          ? `Seen ${new Date(
                              terminal.lastSeenAt,
                            ).toLocaleString()}`
                          : "Never seen"}
                      </span>
                    </div>

                    {terminal.status !==
                      "REVOKED" && (
                      <>
                        <input
                          className={
                            `${styles.input} ${styles.reason}`
                          }
                          value={
                            terminalReasons[
                              terminal.id
                            ] ??
                            ""
                          }
                          placeholder="Optional reason; required for revoke"
                          onChange={
                            (
                              event,
                            ) =>
                              setTerminalReasons(
                                (
                                  current,
                                ) => ({
                                  ...current,
                                  [terminal.id]:
                                    event
                                      .target
                                      .value,
                                }),
                              )
                          }
                        />

                        <div
                          className={
                            styles.terminalActions
                          }
                        >
                          <button
                            type="button"
                            className={
                              styles.secondary
                            }
                            disabled={
                              busy
                            }
                            onClick={
                              () =>
                                void mutateTerminal(
                                  terminal,
                                  "ROTATE_CREDENTIAL",
                                )
                            }
                          >
                            Rotate credential
                          </button>

                          {terminal.status ===
                            "ACTIVE" && (
                            <button
                              type="button"
                              className={
                                styles.secondary
                              }
                              disabled={
                                busy
                              }
                              onClick={
                                () =>
                                  void mutateTerminal(
                                    terminal,
                                    "SUSPEND",
                                  )
                              }
                            >
                              Suspend
                            </button>
                          )}

                          {terminal.status ===
                            "SUSPENDED" && (
                            <button
                              type="button"
                              className={
                                styles.secondary
                              }
                              disabled={
                                busy
                              }
                              onClick={
                                () =>
                                  void mutateTerminal(
                                    terminal,
                                    "REACTIVATE",
                                  )
                              }
                            >
                              Reactivate
                            </button>
                          )}

                          <button
                            type="button"
                            className={
                              styles.danger
                            }
                            disabled={
                              busy
                            }
                            onClick={
                              () =>
                                void mutateTerminal(
                                  terminal,
                                  "REVOKE",
                                )
                            }
                          >
                            Revoke
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ),
              )}

              {terminals.length ===
                0 && (
                <p
                  className={
                    styles.empty
                  }
                >
                  No Scanner terminal has been provisioned for this school.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}