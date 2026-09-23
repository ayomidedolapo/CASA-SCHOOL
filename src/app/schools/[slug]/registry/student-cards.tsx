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

interface StudentCardsProps {
  apiBase: string;
  studentId: string;
}

interface CardRecord {
  id: string;
  serialNumber: string;
  status:
    | "READY_FOR_ACTIVATION"
    | "ACTIVE"
    | "LOST"
    | "REVOKED"
    | "REPLACED"
    | "EXPIRED";
  issuedAt: string;
  expiresAt:
    string | null;
  deactivatedAt:
    string | null;
}

interface CardEvent {
  id: string;
  cardId: string;
  eventType: string;
  reason:
    string | null;
  createdAt: string;
}

interface ProductionJob {
  id: string;
  cardId: string;
  status:
    | "READY"
    | "EXPORTED"
    | "PRINTED";
  publicLinkRevision:
    number;
  queuedAt: string;
  exportedAt:
    string | null;
  printedAt:
    string | null;
  templateVersion:
    string;
    schoolPreviewUrl:
    string;
}

interface CardsResponse {
  cards:
    CardRecord[];
  events:
    CardEvent[];
}

interface ProductionResponse {
  jobs:
    ProductionJob[];
}

interface BiometricResponse {
  activeProfile:
    | {
        id: string;
        status: string;
      }
    | null;
}

interface ReplacementCase {
  id: string;
  status: string;
  replacement_reason:
    | "LOST"
    | "DAMAGED";
  payment_status:
    | "UNPAID"
    | "PAID";
  paid_at:
    string | null;
  payment_reference:
    string | null;
  batch_eligible_on:
    string | null;
  reported_lost_on: string;
  replacement_requested_at:
    string | null;
}

interface ReplacementResponse {
  replacementCase:
    ReplacementCase | null;
}

function errorMessage(
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

export function StudentCards({
  apiBase,
  studentId,
}: StudentCardsProps) {
  const [
    cards,
    setCards,
  ] =
    useState<
      CardRecord[]
    >([]);

  const [
    events,
    setEvents,
  ] =
    useState<
      CardEvent[]
    >([]);

  const [
    jobs,
    setJobs,
  ] =
    useState<
      ProductionJob[]
    >([]);

  const [
    faceReady,
    setFaceReady,
  ] =
    useState(false);

    const [
      replacementCase,
      setReplacementCase,
    ] =
      useState<ReplacementCase | null>(
        null,
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
    reason,
    setReason,
  ] =
    useState("");

  const endpoint =
    useMemo(
      () =>
        `${apiBase}/students/${studentId}/cards`,
      [
        apiBase,
        studentId,
      ],
    );

  const productionEndpoint =
    useMemo(
      () =>
        `${endpoint}/production`,
      [
        endpoint,
      ],
    );

  const biometricEndpoint =
    useMemo(
      () =>
        `${apiBase}/students/${studentId}/biometrics`,
      [
        apiBase,
        studentId,
      ],
    );

  const replacementEndpoint =
    useMemo(
      () =>
        `${apiBase}/students/${studentId}/card-replacement`,
      [
        apiBase,
        studentId,
      ],
    );

  const activeCard =
    cards.find(
      (card) =>
        card.status ===
        "ACTIVE",
    ) ??
    null;

  const pendingCard =
    cards.find(
      (card) =>
        card.status ===
        "READY_FOR_ACTIVATION",
    ) ??
    null;

    const reissueRequired =
      !activeCard &&
      !pendingCard &&
      !replacementCase &&
      cards.length > 0;

  const pendingProduction =
    pendingCard
      ? jobs.find(
          (job) =>
            job.cardId ===
            pendingCard.id,
        ) ?? null
      : null;

  const activeProduction =
    activeCard
      ? jobs.find(
          (job) =>
            job.cardId ===
            activeCard.id,
        ) ??
        null
      : null;

  const reload =
    useCallback(
      async () => {
                const [
                  cardsResponse,
                  productionResponse,
                  biometricResponse,
                  replacementResponse,
                ] =
                  await Promise.all([
            fetch(
              endpoint,
              {
                credentials:
                  "same-origin",
                cache:
                  "no-store",
              },
            ),
            fetch(
              productionEndpoint,
              {
                credentials:
                  "same-origin",
                cache:
                  "no-store",
              },
            ),
                        fetch(
                          biometricEndpoint,
                          {
                            credentials:
                              "same-origin",
                            cache:
                              "no-store",
                          },
                        ),
                        fetch(
                          replacementEndpoint,
                          {
                            credentials:
                              "same-origin",
                            cache:
                              "no-store",
                          },
                        ),
                      ]);

        const cardsBody:
          unknown =
            await cardsResponse.json();

        const productionBody:
          unknown =
            await productionResponse.json();

                const biometricBody:
                  unknown =
                    await biometricResponse.json();

                const replacementBody:
                  unknown =
                    await replacementResponse.json();

        if (
          !cardsResponse.ok
        ) {
          throw new Error(
            errorMessage(
              cardsBody,
              "Unable to load ID cards.",
            ),
          );
        }

        if (
          !productionResponse.ok
        ) {
          throw new Error(
            errorMessage(
              productionBody,
              "Unable to load card-production status.",
            ),
          );
        }

                if (
                  !biometricResponse.ok
                ) {
                  throw new Error(
                    errorMessage(
                      biometricBody,
                      "Unable to load face-enrollment readiness.",
                    ),
                  );
                }

                if (
                  !replacementResponse.ok
                ) {
                  throw new Error(
                    errorMessage(
                      replacementBody,
                      "Unable to load card-replacement status.",
                    ),
                  );
                }

                const cardData =
          cardsBody as
            CardsResponse;

        const productionData =
          productionBody as
            ProductionResponse;

                const biometricData =
                  biometricBody as
                    BiometricResponse;

                const replacementData =
                  replacementBody as
                    ReplacementResponse;

                setReplacementCase(
                  replacementData
                    .replacementCase ??
                  null,
                );

                setCards(
          cardData.cards,
        );
        setEvents(
          cardData.events,
        );
        setJobs(
          productionData.jobs,
        );
        setFaceReady(
          Boolean(
            biometricData.activeProfile &&
              biometricData.activeProfile.status ===
                "ACTIVE",
          ),
        );
      },
      [
        endpoint,
        productionEndpoint,
                biometricEndpoint,
                replacementEndpoint,
              ],
            );

  useEffect(() => {
    const handleCardChanged =
      () => {
        void reload().catch(
          (caught: unknown) =>
            setError(
              caught instanceof
                Error
                ? caught.message
                : "Unable to refresh card status.",
            ),
        );
      };

    window.addEventListener(
      "casa:student-card-changed",
      handleCardChanged,
    );

    return () => {
      window.removeEventListener(
        "casa:student-card-changed",
        handleCardChanged,
      );
    };
  }, [reload]);

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void reload()
              .catch(
                (
                  caught,
                ) => {
                  setError(
                    caught instanceof
                      Error
                      ? caught.message
                      : "Unable to load student-card status.",
                  );
                },
              );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    },
    [
      reload,
    ],
  );

    async function produce() {
      if (replacementCase) {
        setError(
          "This replacement is managed through the scheduled CASA batch. The school cannot create a one-off replacement card.",
        );
        return;
      }

      if (pendingCard) {
      setError(
        "A produced card is already awaiting physical handover. Activate it before producing another card.",
      );
      return;
    }

    const actionReason =
      reason.trim();

    if (
      (activeCard ||
        reissueRequired) &&
      actionReason.length <
        3
    ) {
      setError(
        "Enter a clear lost, damaged, or security reason before card replacement.",
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
      const schoolSlug =
        decodeURIComponent(
          apiBase
            .split(
              "/api/schools/",
            )[1]
            ?.split(
              "/",
            )[0] ??
            "",
        );

      if (!schoolSlug) {
        throw new Error(
          "Unable to resolve the school for card production.",
        );
      }

      const grant =
        activeCard ||
        reissueRequired
          ? await obtainPasskeyStepUpGrant({
              schoolSlug,
              action:
                "CARD_REISSUE",
            })
          : null;

      const response =
        await fetch(
          productionEndpoint,
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
              JSON.stringify({
                reason:
                  activeCard ||
                  reissueRequired
                    ? actionReason
                    : null,
              }),
          },
        );

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          errorMessage(
            body,
            "Student card could not be produced.",
          ),
        );
      }

      setNotice(
        activeCard
          ? "Exceptional replacement card rendered and queued for CASA production."
          : "Missing first digital card created from the active enrollment. No per-student Passkey was required.",
      );
      setReason("");

      await reload();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Student card could not be produced.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function activateHandover() {
    if (!pendingCard) {
      return;
    }

    if (!faceReady) {
      setError(
        "Complete face enrollment before activating this card.",
      );
      return;
    }

    if (
      pendingProduction?.status !==
      "PRINTED"
    ) {
      setError(
        "CASA production must mark the physical card PRINTED before handover activation.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const schoolSlug =
        decodeURIComponent(
          apiBase
            .split(
              "/api/schools/",
            )[1]
            ?.split(
              "/",
            )[0] ??
            "",
        );

      if (!schoolSlug) {
        throw new Error(
          "Unable to resolve the school for Passkey authorization.",
        );
      }

      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug,
          action:
            "CARD_BULK_ACTIVATE",
        });

      const response =
        await fetch(
          `${endpoint}/${pendingCard.id}/activate`,
          {
            method: "POST",
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
                confirmPhysicalHandover:
                  true,
                reason:
                  reason.trim() ||
                  null,
              }),
          },
        );
      const body: unknown =
        await response.json();

      if (!response.ok) {
        throw new Error(
          errorMessage(
            body,
            "Physical handover activation failed.",
          ),
        );
      }

      setNotice(
        "Physical handover confirmed. The new card is now active for Scanner use.",
      );
      setReason("");
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Physical handover activation failed.",
      );
    } finally {
      setBusy(false);
    }
  }


async function reportReplacement(
  replacementReason:
    | "LOST"
    | "DAMAGED",
) {
  const actionReason =
    reason.trim();

  if (
    actionReason.length <
    3
  ) {
    setError(
      `Enter a clear ${replacementReason === "DAMAGED" ? "damage" : "loss"} reason before continuing.`,
    );
    return;
  }

  setBusy(true);
  setError(null);
  setNotice(null);

  try {
    const response =
      await fetch(
        replacementEndpoint,
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
              action:
                replacementReason ===
                  "DAMAGED"
                  ? "REPORT_DAMAGED"
                  : "REPORT_LOST",
              reason:
                actionReason,
            }),
        },
      );

    const body =
      await response
        .json()
        .catch(
          () => ({}),
        ) as {
          message?: string;
          code?: string;
        };

    if (!response.ok) {
      throw new Error(
        body.message ??
        body.code ??
        "Card replacement case could not be opened.",
      );
    }

    setNotice(
      replacementReason ===
        "DAMAGED"
        ? "Damaged card permanently deactivated and replacement case opened."
        : "Lost card permanently deactivated and replacement case opened.",
    );
    setReason("");
    await reload();
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Card replacement case could not be opened.",
    );
  } finally {
    setBusy(false);
  }
}

async function markReplacementPaid() {
  if (!replacementCase) {
    return;
  }

  const entered =
    window.prompt(
      "Optional payment reference/receipt number. Leave blank if none is available.",
      replacementCase.payment_reference ??
        "",
    );

  if (entered === null) {
    return;
  }

  setBusy(true);
  setError(null);
  setNotice(null);

  try {
    const slugPart =
      apiBase
        .split(
          "/api/schools/",
        )[1]
        ?.split(
          "/",
        )[0] ??
      "";

    const schoolSlug =
      decodeURIComponent(
        slugPart,
      );

    if (!schoolSlug) {
      throw new Error(
        "Unable to resolve the school for payment authorization.",
      );
    }

    const grant =
      await obtainPasskeyStepUpGrant({
        schoolSlug,
        action:
          "CARD_REPLACEMENT_PAYMENT",
      });

    const response =
      await fetch(
        replacementEndpoint,
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
              action:
                "MARK_PAID",
              paymentReference:
                entered.trim() ||
                null,
            }),
        },
      );

    const body =
      await response
        .json()
        .catch(
          () => ({}),
        ) as {
          message?: string;
          code?: string;
        };

    if (!response.ok) {
      throw new Error(
        body.message ??
        body.code ??
        "Replacement payment could not be recorded.",
      );
    }

    setNotice(
      "Replacement payment recorded with Passkey audit. The card is now waiting for the scheduled CASA batch.",
    );
    await reload();
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Replacement payment could not be recorded.",
    );
  } finally {
    setBusy(false);
  }
}

  async function deactivate(
    cardId:
      string,
    status:
      "LOST" |
      "REVOKED" |
      "EXPIRED",
  ) {
    const actionReason =
      reason.trim() ||
      null;

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
          `${endpoint}/${cardId}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                status,
                reason:
                  actionReason,
              }),
          },
        );

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          errorMessage(
            body,
            "Unable to update ID card.",
          ),
        );
      }

      setNotice(
        `Card marked ${status.toLowerCase()}.`,
      );
      setReason("");

      await reload();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Unable to update ID card.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <section className="mt-7 border-t border-black pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="casa-kicker">
            Student ID card
          </p>
          <h4 className="mt-2 text-lg font-semibold">
            Card production & lifecycle
          </h4>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-black/50">
            CASA creates the first digital card automatically after the
            student receives an active enrollment. No individual Passkey is
            required for first-card creation. The campus can later activate all
            eligible first cards with one Passkey ceremony after printing and
            face enrollment. Replacement remains Passkey-protected.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || Boolean(pendingCard)}
          onClick={() =>
            void produce()
          }
          className="casa-button"
        >
          {busy
            ? "Working..."
            : pendingCard
              ? "Awaiting handover"
              : activeCard ||
                  reissueRequired
                ? "Reissue card with Passkey"
                : "Create missing first card"}
        </button>
      </div>

      {error ? (
        <p
          className="casa-error mt-4"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="casa-notice mt-4 text-[var(--casa-positive)]"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {pendingCard ? (
        <div className="mt-5 border border-black bg-[var(--casa-paper)]">
          <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="casa-kicker text-black/45">
                Ready for activation
              </p>
              <p className="mt-2 font-mono text-sm font-semibold">
                {pendingCard.serialNumber}
              </p>
              <p className="mt-2 text-xs leading-5 text-black/55">
                Production status: {pendingProduction?.status ?? "Unknown"}.
                Face enrollment: {faceReady ? "READY" : "REQUIRED"}.
                This card becomes Scanner-usable only after the physical card
                is PRINTED, the student&apos;s face is enrolled, and an authorized
                                operator confirms handover.
              </p>
              {pendingProduction ? (
                <a
                  href={
                    pendingProduction.schoolPreviewUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="casa-button-secondary mt-3 inline-flex"
                >
                  View watermarked school preview
                </a>
              ) : null}
              {!faceReady ? (
                <p className="mt-2 text-xs font-semibold text-[var(--casa-warning)]">
                  Activation locked: complete face enrollment first.
                </p>
              ) : pendingProduction?.status !== "PRINTED" ? (
                <p className="mt-2 text-xs font-semibold text-[var(--casa-warning)]">
                  Activation locked: CASA production must mark this physical card PRINTED.
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-[var(--casa-positive)]">
                  Ready for physical handover confirmation.
                </p>
              )}
            </div>
            <button
              type="button"
              className="casa-button"
              disabled={
                busy ||
                !faceReady ||
                pendingProduction?.status !==
                  "PRINTED"
              }
              onClick={() =>
                void activateHandover()
              }
            >
              Confirm handover with Passkey
            </button>
          </div>
        </div>
      ) : null}

      {activeCard ? (
        <div className="mt-5 border border-black">
          <div className="grid sm:grid-cols-2">
            <div className="border-b border-black p-4 sm:border-b-0 sm:border-r">
              <p className="casa-kicker text-black/45">
                Active card
              </p>
              <p className="mt-3 font-mono text-sm font-semibold">
                {activeCard.serialNumber}
              </p>
              <p className="mt-2 text-xs text-black/50">
                Issued{" "}
                {new Date(
                  activeCard.issuedAt,
                ).toLocaleString()}
              </p>
            </div>

            <div className="p-4">
              <p className="casa-kicker text-black/45">
                Production
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`casa-status ${
                    activeProduction
                      ? "casa-status-positive"
                      : "casa-status-warning"
                  }`}
                >
                  {activeProduction?.status ??
                    "Legacy card"}
                </span>
                {activeProduction ? (
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                    Template{" "}
                    {
                      activeProduction.templateVersion
                    }
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {activeProduction ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black p-4">
              <a
                href={
                  activeProduction.schoolPreviewUrl
                }
                target="_blank"
                rel="noreferrer"
                className="casa-button-secondary"
              >
                View watermarked school preview
              </a>

              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                Public link revision{" "}
                {
                  activeProduction.publicLinkRevision
                }
              </span>
            </div>
          ) : (
            <p className="border-t border-black p-4 text-xs leading-5 text-[var(--casa-warning)]">
              This card predates the production engine. It remains valid for
              Scanner identity resolution, but no CASA-rendered production
              artifact exists for it.
            </p>
          )}

          <div className="border-t border-black p-4">
            <label className="casa-label">
              <span>
                Card action reason
              </span>
              <input
                className="casa-field"
                onChange={(event) =>
                  setReason(
                    event.target.value,
                  )
                }
                placeholder="Required for lost/damaged/security replacement; optional for status changes"
                value={reason}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-black p-4">
            <button
              type="button"
              disabled={busy}
                onClick={() =>
                  void reportReplacement(
                    "LOST",
                  )
                }
                className="casa-button-secondary"
              >
                Mark lost
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void reportReplacement(
                    "DAMAGED",
                  )
                }
                className="casa-button-secondary"
              >
                Mark damaged
              </button>

              <button
              type="button"
              disabled={busy}
              onClick={() =>
                void deactivate(
                  activeCard.id,
                  "REVOKED",
                )
              }
              className="casa-button-danger"
            >
              Revoke
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void deactivate(
                  activeCard.id,
                  "EXPIRED",
                )
              }
              className="casa-button-secondary"
            >
              Mark expired
            </button>
          </div>
        </div>
      ) : replacementCase ? (
              <div className="mt-5 border border-black p-4">
                <p className="casa-kicker text-black/45">
                  {replacementCase.replacement_reason === "DAMAGED"
                    ? "Damaged card"
                    : "Lost card"}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {replacementCase.payment_status === "PAID"
                    ? "Replacement paid · awaiting scheduled CASA batch"
                    : "Replacement unpaid"}
                </p>
                <p className="mt-2 text-xs leading-5 text-black/55">
                  The old card stays permanently inactive.
                  {replacementCase.payment_status === "PAID"
                    ? ` Assisted attendance remains available while the replacement waits for the scheduled batch.${replacementCase.batch_eligible_on ? ` Batch eligible from ${replacementCase.batch_eligible_on}.` : ""}`
                    : " Assisted attendance is limited to three instructional grace days; payment must be recorded after grace expires."}
                </p>
                {replacementCase.payment_status !== "PAID" ? (
                  <button
                    type="button"
                    className="casa-button mt-4"
                    disabled={busy}
                    onClick={() =>
                      void markReplacementPaid()
                    }
                  >
                    Mark replacement paid with Passkey
                  </button>
                ) : null}
              </div>
            ) : reissueRequired ? (
              <div className="mt-5 border border-black p-4">
          <p className="casa-kicker text-black/45">
            Reissue required
          </p>
          <p className="mt-2 text-xs leading-5 text-black/55">
            This student has card history but no current active card. CASA will not treat this as a first-card issue. Enter the replacement reason and use the Passkey-protected reissue action.
          </p>
          <label className="casa-label mt-4">
            <span>Replacement reason</span>
            <input
              className="casa-field"
              onChange={(event) =>
                setReason(
                  event.target.value,
                )
              }
              placeholder="Lost, damaged, expired, revoked, or other security reason"
              value={reason}
            />
          </label>
        </div>
      ) : (
        <div className="mt-5 border-y border-black/25 py-5">
          <p className="casa-kicker text-black/45">
            Card status
          </p>
          <p className="mt-2 text-sm">
            No student card yet. CASA creates the first digital card automatically after active enrollment.
          </p>
        </div>
      )}

      {jobs.length > 0 ? (
        <div className="mt-6">
          <p className="casa-kicker">
            Production history
          </p>

          <div className="mt-3 border-t border-black">
            {jobs.map(
              (job) => (
                <div
                  key={job.id}
                  className="grid gap-3 border-b border-black/20 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <strong className="text-xs">
                      {job.status}
                    </strong>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.07em] text-black/45">
                      {job.templateVersion} ·{" "}
                      {new Date(
                        job.queuedAt,
                      ).toLocaleString()}
                    </p>
                  </div>

                  <a
                    href={
                      job.schoolPreviewUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] underline"
                  >
                    Watermarked preview
                  </a>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}

      {events.length > 0 ? (
        <details className="mt-6 border-t border-black pt-4">
          <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
            Card lifecycle history
          </summary>

          <div className="mt-3 border-t border-black/25">
            {events.map(
              (event) => (
                <div
                  key={event.id}
                  className="border-b border-black/20 py-3 text-xs text-black/55"
                >
                  {event.eventType} ·{" "}
                  {new Date(
                    event.createdAt,
                  ).toLocaleString()}
                  {event.reason
                    ? ` · ${event.reason}`
                    : ""}
                </div>
              ),
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}
