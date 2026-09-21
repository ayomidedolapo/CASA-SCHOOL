"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  obtainPasskeyStepUpGrant,
} from "@/client/passkey-step-up";

type GuardianLink = {
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
  activeNotificationDevices: number;
  notificationInviteState:
    | "OPEN"
    | "CLAIMED"
    | "REPLACED"
    | "EXPIRED"
    | null;
};

type Enrollment = {
  id: string;
  academicSessionId: string;
  classArmId: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
  academicSessionName: string;
  classLevelName: string;
  classArmName: string;
};

type StudentDetail = {
  guardians: GuardianLink[];
  enrollments: Enrollment[];
};

type AcademicOptions = {
  sessions: Array<{
    id: string;
    name: string;
  }>;
  classArms: Array<{
    id: string;
    name: string;
    classLevelName: string;
  }>;
};

type GuardianOption = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
};

type ArrivalAssignment = {
  id: string;
  arrival_method:
    | "SCHOOL_BUS"
    | "INDEPENDENT";
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
};

async function jsonOrThrow<T>(
  response: Response,
): Promise<T> {
  const body =
    await response.json().catch(
      () => ({}),
    ) as {
      message?: string;
    } & T;

  if (!response.ok) {
    throw new Error(
      body.message ??
        "CASA could not complete this registry action.",
    );
  }

  return body;
}

export function RegistryM34AOperations({
  schoolSlug,
  studentId,
}: {
  schoolSlug: string;
  studentId: string;
}) {
  const apiBase = useMemo(
    () =>
      `/api/schools/${encodeURIComponent(
        schoolSlug,
      )}/registry`,
    [schoolSlug],
  );
  const [detail, setDetail] =
    useState<StudentDetail | null>(null);
  const [academic, setAcademic] =
    useState<AcademicOptions>({
      sessions: [],
      classArms: [],
    });
  const [guardianOptions, setGuardianOptions] =
    useState<GuardianOption[]>([]);
  const [arrivalMethod, setArrivalMethod] =
    useState<
      "SCHOOL_BUS" | "INDEPENDENT"
    >("INDEPENDENT");
  const [arrivalEffectiveFrom, setArrivalEffectiveFrom] =
    useState(
      () => new Date()
        .toISOString()
        .slice(0, 10),
    );
  const [arrivalReason, setArrivalReason] =
    useState("");
  const [inviteUrl, setInviteUrl] =
    useState("");
  const [inviteShareText, setInviteShareText] =
    useState("");
  const [inviteWhatsappUrl, setInviteWhatsappUrl] =
    useState<string | null>(null);
  const [inviteEmailStatus, setInviteEmailStatus] =
    useState<
      | "SENT"
      | "NO_EMAIL"
      | "NOT_CONFIGURED"
      | "FAILED"
      | ""
    >("");
  const [busy, setBusy] =
    useState(false);
  const [notice, setNotice] =
    useState("");
  const [error, setError] =
    useState("");

  const request = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit,
    ) =>
      jsonOrThrow<T>(
        await fetch(
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
            cache: "no-store",
          },
        ),
      ),
    [apiBase],
  );

  const load = useCallback(
    async () => {
      const [
        detailBody,
        academicBody,
        guardianBody,
        arrivalBody,
      ] = await Promise.all([
        request<StudentDetail>(
          `/students/${studentId}`,
        ),
        request<AcademicOptions>(
          "/academic-options",
        ),
        request<{
          guardians: GuardianOption[];
        }>(
          "/guardians?q=",
        ),
        request<{
          current:
            ArrivalAssignment | null;
        }>(
          `/students/${studentId}/arrival-method`,
        ),
      ]);

      setDetail(detailBody);
      setAcademic(academicBody);
      setGuardianOptions(
        guardianBody.guardians ?? [],
      );

      if (arrivalBody.current) {
        setArrivalMethod(
          arrivalBody.current.arrival_method,
        );
        setArrivalEffectiveFrom(
          arrivalBody.current.effective_from,
        );
      }
    },
    [request, studentId],
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(
      async () => {
        if (cancelled) {
          return;
        }

        setInviteUrl("");
        setInviteShareText("");
        setInviteWhatsappUrl(null);
        setInviteEmailStatus("");
        setNotice("");
        setError("");

        try {
          await load();
        } catch (cause) {
          if (cancelled) {
            return;
          }

          setError(
            cause instanceof Error
              ? cause.message
              : "CASA could not load registry corrections.",
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const refreshGuardians = () => {
      void load().catch(
        (cause: unknown) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "CASA could not refresh guardian records.",
          ),
      );
    };

    window.addEventListener(
      "casa:guardian-registry-changed",
      refreshGuardians,
    );

    return () => {
      window.removeEventListener(
        "casa:guardian-registry-changed",
        refreshGuardians,
      );
    };
  }, [load]);

  async function run(
    action: () => Promise<void>,
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "CASA could not complete this registry action.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveArrival(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    await run(async () => {
      await request(
        `/students/${studentId}/arrival-method`,
        {
          method: "PATCH",
          body: JSON.stringify({
            arrivalMethod,
            effectiveFrom:
              arrivalEffectiveFrom,
            reason:
              arrivalReason.trim() ||
              "Registry correction",
          }),
        },
      );
      setArrivalReason("");
      setNotice(
        "Arrival method saved.",
      );
      await load();
    });
  }

  async function saveEnrollment(
    event: FormEvent<HTMLFormElement>,
    enrollmentId: string,
  ) {
    event.preventDefault();
    const form =
      new FormData(
        event.currentTarget,
      );

    await run(async () => {
      const status =
        String(
          form.get("status"),
        );

      await request(
        `/students/${studentId}/enrollments/${enrollmentId}`,
        {
          method: "PATCH",
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
              form.get(
                "startsOn",
              ),
            endsOn:
              status === "ACTIVE"
                ? null
                : form.get(
                    "endsOn",
                  ) || null,
            status,
          }),
        },
      );
      setNotice(
        "Enrollment correction saved.",
      );
      await load();
    });
  }

  async function saveGuardian(
    event: FormEvent<HTMLFormElement>,
    guardianId: string,
  ) {
    event.preventDefault();
    const form =
      new FormData(
        event.currentTarget,
      );

    await run(async () => {
      await request(
        `/guardians/${guardianId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fullName:
              form.get("fullName"),
            email:
              form.get("email") || null,
            phone:
              form.get("phone") || null,
          }),
        },
      );
      setNotice(
        "Guardian details updated.",
      );
      await load();
    });
  }

  async function saveRelationship(
    event: FormEvent<HTMLFormElement>,
    linkId: string,
  ) {
    event.preventDefault();
    const form =
      new FormData(
        event.currentTarget,
      );

    await run(async () => {
      await request(
        `/students/${studentId}/guardians/${linkId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
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
      setNotice(
        "Guardian relationship updated.",
      );
      await load();
    });
  }

  async function linkGuardian(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );

    await run(async () => {
      await request(
        `/students/${studentId}/guardians`,
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
      formElement.reset();
      setNotice(
        "Guardian linked. Create a private notification link when they are ready to enable alerts.",
      );
      await load();
    });
  }

  async function createPushInvite(
    guardian:
      GuardianLink,
  ) {
    await run(async () => {
      const needsPasskey =
        guardian
          .notificationInviteState !==
          null ||
        guardian
          .activeNotificationDevices >
          0;
      const grant =
        needsPasskey
          ? await obtainPasskeyStepUpGrant({
              schoolSlug,
              action:
                "SECURITY_SETTINGS",
            })
          : null;

      const body =
        await request<{
          oneTimeUrl: string;
          expiresAt: string;
          shareText: string;
          whatsappUrl: string | null;
          emailDelivery:
            | "SENT"
            | "NO_EMAIL"
            | "NOT_CONFIGURED"
            | "FAILED";
        }>(
          `/students/${studentId}/guardians/${guardian.linkId}/push-invite`,
          {
            method:
              "POST",
            headers:
              grant
                ? {
                    "x-casa-passkey-step-up":
                      grant,
                  }
                : undefined,
          },
        );

      setInviteUrl(
        body.oneTimeUrl,
      );
      setInviteShareText(
        body.shareText,
      );
      setInviteWhatsappUrl(
        body.whatsappUrl,
      );
      setInviteEmailStatus(
        body.emailDelivery,
      );

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard
          .writeText(
            body.shareText,
          )
          .catch(
            () =>
              undefined,
          );
      }

      const deliveryNote =
        body.emailDelivery ===
          "SENT"
          ? " A branded school email was sent to the guardian."
          : body.emailDelivery ===
              "NO_EMAIL"
            ? " No email was provided; use the copy/WhatsApp option below."
            : body.emailDelivery ===
                "NOT_CONFIGURED"
              ? " Email delivery is not configured yet; the link is still ready for manual sharing."
              : " Email delivery did not complete; the link is still ready for manual sharing.";

      setNotice(
        (
          needsPasskey
            ? "Notification setup reset with Passkey. The new private link is valid for 48 hours; any previous unused link is now invalid. Existing enabled devices remain connected."
            : "Private guardian notification link created. It is valid for 48 hours."
        ) +
          deliveryNote,
      );
      await load();
    });
  }

  const availableGuardians =
    guardianOptions.filter(
      (guardian) =>
        !detail?.guardians.some(
          (linked) =>
            linked.guardianId ===
            guardian.id,
        ),
    );

  if (!detail) {
    return (
      <section className="mt-7 border-t border-black pt-5">
        <p className="text-sm text-black/50">
          Loading enrollment and guardian operations…
        </p>
        {error ? (
          <div className="casa-error mt-3">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-7 border-t border-black pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="casa-kicker">
            Enrollment & guardians
          </p>
          <p className="mt-2 text-xs leading-5 text-black/50">
            Correct enrollment details, arrival method and guardian relationships without recreating the student.
          </p>
        </div>
      </div>

      {notice ? (
        <div className="casa-notice mt-4" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="casa-error mt-4" role="alert">
          {error}
        </div>
      ) : null}

      <details className="mt-5 border border-black/20 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">
          Arrival method
        </summary>
        <form className="mt-4 grid gap-3" onSubmit={saveArrival}>
          <select
            className="casa-field"
            value={arrivalMethod}
            onChange={(event) =>
              setArrivalMethod(
                event.target.value as
                  | "SCHOOL_BUS"
                  | "INDEPENDENT",
              )
            }
          >
            <option value="INDEPENDENT">
              Independent arrival
            </option>
            <option value="SCHOOL_BUS">
              School bus
            </option>
          </select>
          <input
            className="casa-field"
            type="date"
            value={arrivalEffectiveFrom}
            onChange={(event) =>
              setArrivalEffectiveFrom(
                event.target.value,
              )
            }
            required
          />
          <input
            className="casa-field"
            value={arrivalReason}
            onChange={(event) =>
              setArrivalReason(
                event.target.value,
              )
            }
            placeholder="Reason for correction / optional"
          />
          <button className="casa-button-secondary" type="submit" disabled={busy}>
            Save arrival method
          </button>
        </form>
      </details>

      <details className="mt-3 border border-black/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Enrollment corrections
        </summary>
        <div className="mt-4 grid gap-3">
          {detail.enrollments.length === 0 ? (
            <p className="text-xs text-black/50">
              No enrollment exists yet.
            </p>
          ) : detail.enrollments.map((enrollment) => (
            <form
              key={enrollment.id}
              className="grid gap-2 border border-black/15 p-3"
              onSubmit={(event) =>
                void saveEnrollment(
                  event,
                  enrollment.id,
                )
              }
            >
              <select className="casa-field" name="academicSessionId" defaultValue={enrollment.academicSessionId} required>
                {academic.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
              <select className="casa-field" name="classArmId" defaultValue={enrollment.classArmId} required>
                {academic.classArms.map((arm) => (
                  <option key={arm.id} value={arm.id}>
                    {arm.classLevelName} · {arm.name}
                  </option>
                ))}
              </select>
              <input className="casa-field" type="date" name="startsOn" defaultValue={enrollment.startsOn} required />
              <select className="casa-field" name="status" defaultValue={enrollment.status}>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="TRANSFERRED">Transferred</option>
              </select>
              <input className="casa-field" type="date" name="endsOn" defaultValue={enrollment.endsOn ?? ""} />
              <button className="casa-button-secondary" type="submit" disabled={busy}>
                Save enrollment correction
              </button>
            </form>
          ))}
        </div>
      </details>

      <details className="mt-3 border border-black/20 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">
          Guardians & notifications
        </summary>
        <p className="mt-3 text-xs leading-5 text-black/50">
          Every linked guardian may enable notifications on their own devices. CASA does not limit attendance notifications to one guardian.
        </p>

        <div className="mt-4 grid gap-3">
          {detail.guardians.map((guardian) => (
            <article key={guardian.linkId} className="border border-black/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {guardian.fullName}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    {guardian.relationshipLabel}
                  </p>
                </div>
                <button
                  className="casa-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void createPushInvite(
                      guardian,
                    )
                  }
                >
                  {guardian.receivesNotifications &&
                  guardian.activeNotificationDevices > 0
                    ? "Add device / reset link with Passkey"
                    : guardian.notificationInviteState === "OPEN"
                      ? "Reset setup link with Passkey"
                      : guardian.notificationInviteState === "EXPIRED"
                        ? "Create new link with Passkey"
                        : guardian.notificationInviteState
                          ? "Reissue link with Passkey"
                          : "Create notification link"}
                </button>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                  {guardian.receivesNotifications &&
                  guardian.activeNotificationDevices > 0
                    ? `Notifications active · ${guardian.activeNotificationDevices} device${guardian.activeNotificationDevices === 1 ? "" : "s"}`
                    : guardian.notificationInviteState === "OPEN"
                      ? "Awaiting notification setup"
                      : guardian.notificationInviteState === "EXPIRED"
                        ? "Notification link expired"
                        : guardian.activeNotificationDevices > 0
                          ? "Notifications disabled"
                          : "Notifications not enabled"}
                </span>
              </div>

              <details className="mt-3 border-t border-black/15 pt-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  Edit guardian details
                </summary>
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) =>
                    void saveGuardian(
                      event,
                      guardian.guardianId,
                    )
                  }
                >
                  <input className="casa-field" name="fullName" defaultValue={guardian.fullName} required />
                  <input className="casa-field" name="email" type="email" defaultValue={guardian.email ?? ""} placeholder="Email / optional" />
                  <input className="casa-field" name="phone" defaultValue={guardian.phone ?? ""} placeholder="+234... / optional" />
                  <button className="casa-button-secondary" type="submit" disabled={busy}>
                    Save guardian details
                  </button>
                </form>
              </details>

              <details className="mt-3 border-t border-black/15 pt-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  Edit relationship
                </summary>
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) =>
                    void saveRelationship(
                      event,
                      guardian.linkId,
                    )
                  }
                >
                  <input className="casa-field" name="relationshipLabel" defaultValue={guardian.relationshipLabel} required />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="isPrimary" defaultChecked={guardian.isPrimary} /> Primary guardian
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="isEmergencyContact" defaultChecked={guardian.isEmergencyContact} /> Emergency contact
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="pickupAuthorized" defaultChecked={guardian.pickupAuthorized} /> Pickup authorized
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="receivesNotifications" defaultChecked={guardian.receivesNotifications} /> Notifications
                  </label>
                  <button className="casa-button-secondary" type="submit" disabled={busy}>
                    Save relationship
                  </button>
                </form>
              </details>
            </article>
          ))}
        </div>

        {inviteUrl ? (
          <div className="casa-notice mt-4">
            <p className="text-xs font-semibold">
              Private guardian notification link
            </p>
            <p className="mt-2 break-all font-mono text-[10px]">
              {inviteUrl}
            </p>
            <p className="mt-2 text-xs text-black/45">
              The raw link stays visible for manual fallback. The trusted share message includes the school name, purpose and safety context so the guardian does not receive an unexplained link.
            </p>
            {inviteEmailStatus ? (
              <p className="mt-2 text-xs font-semibold">
                Email: {inviteEmailStatus.replaceAll("_", " ")}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="casa-button-secondary"
                onClick={() => {
                  if (
                    inviteShareText &&
                    typeof navigator !== "undefined" &&
                    navigator.clipboard
                  ) {
                    void navigator.clipboard.writeText(
                      inviteShareText,
                    );
                  }
                }}
              >
                Copy message + link
              </button>
              {inviteWhatsappUrl ? (
                <a
                  className="casa-button-secondary"
                  href={inviteWhatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open WhatsApp
                </a>
              ) : null}
            </div>
            {inviteShareText ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  Preview share message
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-black/60">
                  {inviteShareText}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        <form className="mt-5 grid gap-2 border-t border-black/20 pt-4" onSubmit={linkGuardian}>
          <p className="text-xs font-semibold">
            Link another guardian
          </p>
          <select className="casa-field" name="guardianId" defaultValue="" required disabled={availableGuardians.length === 0}>
            <option value="" disabled>
              {availableGuardians.length === 0
                ? "No unlinked guardian records"
                : "Select guardian"}
            </option>
            {availableGuardians.map((guardian) => (
              <option key={guardian.id} value={guardian.id}>
                {guardian.fullName}
              </option>
            ))}
          </select>
          <input className="casa-field" name="relationshipLabel" placeholder="Relationship, e.g. Mother" required />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="isPrimary" /> Primary guardian
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="isEmergencyContact" /> Emergency contact
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="pickupAuthorized" /> Pickup authorized
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="receivesNotifications" /> Notifications
          </label>
          <button className="casa-button-secondary" type="submit" disabled={busy || availableGuardians.length === 0}>
            Link guardian
          </button>
        </form>
      </details>
    </section>
  );
}
