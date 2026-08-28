"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import QRCode from "qrcode";

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
  expiresAt: string | null;
  deactivatedAt: string | null;
}

interface CardCredential {
  token: string;
  payload: string;
}

interface CardsResponse {
  cards: CardRecord[];
  events: Array<{
    id: string;
    cardId: string;
    eventType: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export function StudentCards({
  apiBase,
  studentId,
}: StudentCardsProps) {
  const [cards, setCards] =
    useState<CardRecord[]>([]);
  const [events, setEvents] =
    useState<
      CardsResponse["events"]
    >([]);
  const [credential, setCredential] =
    useState<CardCredential | null>(
      null,
    );
  const [qrDataUrl, setQrDataUrl] =
    useState<string | null>(null);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const endpoint = useMemo(
    () =>
      `${apiBase}/students/${studentId}/cards`,
    [apiBase, studentId],
  );

  const activeCard = cards.find(
    (card) =>
      card.status === "ACTIVE",
  );

  useEffect(() => {
    let cancelled = false;

    void fetch(endpoint)
      .then(async (response) => {
        const body =
          (await response.json()) as
            CardsResponse & {
              message?: string;
            };

        if (!response.ok) {
          throw new Error(
            body.message ??
              "Unable to load ID cards.",
          );
        }

        if (!cancelled) {
          setCards(body.cards);
          setEvents(body.events);
        }
      })
      .catch(
        (cause: unknown) => {
          if (!cancelled) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to load ID cards.",
            );
          }
        },
      );

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    if (!credential) {
      return;
    }

    let cancelled = false;

    void QRCode.toDataURL(
      credential.payload,
      {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
      },
    )
      .then((value) => {
        if (!cancelled) {
          setQrDataUrl(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "The card was issued, but the QR preview could not be rendered.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [credential]);

  async function reload() {
    const response =
      await fetch(endpoint);

    const body =
      (await response.json()) as
        CardsResponse & {
          message?: string;
        };

    if (!response.ok) {
      throw new Error(
        body.message ??
          "Unable to reload ID cards.",
      );
    }

    setCards(body.cards);
    setEvents(body.events);
  }

  async function issue() {
    setBusy(true);
    setError(null);
    setCredential(null);
    setQrDataUrl(null);

    try {
      const response = await fetch(
        endpoint,
        {
          method: "POST",
        },
      );

      const body =
        (await response.json()) as {
          credential?: CardCredential;
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Unable to issue ID card.",
        );
      }

      if (!body.credential) {
        throw new Error(
          "Card issued without its one-time credential.",
        );
      }

      setCredential(
        body.credential,
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to issue ID card.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(
    cardId: string,
    status:
      | "LOST"
      | "REVOKED"
      | "EXPIRED",
  ) {
    const reason =
      window.prompt(
        `Optional reason for ${status.toLowerCase()}:`,
      );

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `${endpoint}/${cardId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status,
            reason:
              reason?.trim() ||
              null,
          }),
        },
      );

      const body =
        (await response.json()) as {
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Unable to update the ID card.",
        );
      }

      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update the ID card.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function replace(
    cardId: string,
  ) {
    const reason =
      window.prompt(
        "Optional reason for replacing this card:",
      );

    setBusy(true);
    setError(null);
    setCredential(null);
    setQrDataUrl(null);

    try {
      const response = await fetch(
        `${endpoint}/${cardId}/replace`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            reason:
              reason?.trim() ||
              null,
          }),
        },
      );

      const body =
        (await response.json()) as {
          credential?: CardCredential;
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Unable to replace the ID card.",
        );
      }

      if (!body.credential) {
        throw new Error(
          "Replacement card did not return its one-time credential.",
        );
      }

      setCredential(
        body.credential,
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to replace the ID card.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">
            School ID card
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            The QR identifies the student. Face verification will later verify the person.
          </p>
        </div>

        {!activeCard ? (
          <button
            disabled={busy}
            onClick={() =>
              void issue()
            }
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Issue card
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          {error}
        </div>
      ) : null}

      {credential ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            One-time card credential
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            Print or securely transfer this QR now. CASA stores only its SHA-256 hash; this raw token cannot be retrieved later.
          </p>

          {qrDataUrl ? (
            <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
              <Image
                src={qrDataUrl}
                alt="Student ID card QR code"
                width={260}
                height={260}
                unoptimized
              />
            </div>
          ) : null}

          <div className="mt-3 break-all rounded-lg bg-white p-3 font-mono text-[11px] text-slate-700">
            {credential.payload}
          </div>

          <button
            className="mt-3 text-xs font-semibold text-amber-950 underline"
            onClick={() => {
              setCredential(null);
              setQrDataUrl(null);
            }}
          >
            I have saved the card
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">
            No ID card issued yet.
          </p>
        ) : (
          cards.map((card) => (
            <div
              key={card.id}
              className="rounded-lg bg-slate-50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold">
                    {card.serialNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {card.status} Â·{" "}
                    {new Date(
                      card.issuedAt,
                    ).toLocaleDateString()}
                  </p>
                </div>

                {card.status ===
                "ACTIVE" ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void replace(
                          card.id,
                        )
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium"
                    >
                      Replace
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void deactivate(
                          card.id,
                          "LOST",
                        )
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium"
                    >
                      Mark lost
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void deactivate(
                          card.id,
                          "REVOKED",
                        )
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium"
                    >
                      Revoke
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {events.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Card history
          </summary>
          <div className="mt-2 space-y-2">
            {events
              .slice(0, 10)
              .map((event) => (
                <div
                  key={event.id}
                  className="text-xs text-slate-500"
                >
                  {event.eventType} Â·{" "}
                  {new Date(
                    event.createdAt,
                  ).toLocaleString()}
                  {event.reason
                    ? ` Â· ${event.reason}`
                    : ""}
                </div>
              ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}