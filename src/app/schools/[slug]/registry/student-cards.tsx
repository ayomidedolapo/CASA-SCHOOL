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
  publicUrl:
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

  const activeCard =
    cards.find(
      (card) =>
        card.status ===
        "ACTIVE",
    ) ??
    null;

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
          ]);

        const cardsBody:
          unknown =
            await cardsResponse.json();

        const productionBody:
          unknown =
            await productionResponse.json();

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

        const cardData =
          cardsBody as
            CardsResponse;

        const productionData =
          productionBody as
            ProductionResponse;

        setCards(
          cardData.cards,
        );
        setEvents(
          cardData.events,
        );
        setJobs(
          productionData.jobs,
        );
      },
      [
        endpoint,
        productionEndpoint,
      ],
    );

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
    const action =
      activeCard
        ? "CARD_REISSUE"
        : "CARD_ISSUE";

    const actionReason =
      reason.trim();

    if (
      activeCard &&
      actionReason.length <
        3
    ) {
      setError(
        "Enter a clear reason before card reissue.",
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
          "Unable to resolve the school for Passkey authorization.",
        );
      }

      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug,
          action,
        });

      const response =
        await fetch(
          productionEndpoint,
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
                reason:
                  activeCard
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
          ? "Replacement card rendered and queued for CASA production."
          : "Student card rendered and queued for CASA production.",
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
            CASA renders the personalized card server-side. The reusable QR
            credential is never returned to this browser or stored for later
            printing.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void produce()
          }
          className="casa-button"
        >
          {busy
            ? "Working..."
            : activeCard
              ? "Reissue with Passkey"
              : "Issue with Passkey"}
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
                  activeProduction.publicUrl
                }
                target="_blank"
                rel="noreferrer"
                className="casa-button-secondary"
              >
                View finished card
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
                placeholder="Required for reissue; optional for status changes"
                value={reason}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-black p-4">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void deactivate(
                  activeCard.id,
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
      ) : (
        <div className="mt-5 border-y border-black/25 py-5">
          <p className="casa-kicker text-black/45">
            Card status
          </p>
          <p className="mt-2 text-sm">
            No active student card.
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
                      job.publicUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] underline"
                  >
                    Finished card
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
