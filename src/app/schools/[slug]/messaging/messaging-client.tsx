"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type DeliveryState =
  | "PENDING"
  | "PROCESSING"
  | "RETRY"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

interface MessagingData {
  provider: {
    mode:
      string;
    ready:
      boolean;
    apiKeyConfigured:
      boolean;
    serverIdConfigured:
      boolean;
    simSlotConfigured:
      boolean;
    simSlot:
      string |
      null;
  };
  settings: {
    displayName:
      string;
    note:
      string;
    enabled:
      boolean;
    activatedAt:
      string |
      null;
  };
  sender:
    null |
    {
      id:
        string;
      status:
        string;
    };
  delivery: {
    counts:
      Record<
        string,
        number
      >;
    guardianDestinationsMissing:
      number;
    recent:
      Array<{
        id:
          string;
        event_type:
          string;
        recipient_phone:
          string;
        template_key:
          string;
        status:
          DeliveryState;
        attempt_count:
          number;
        available_at:
          string;
        sent_at:
          string |
          null;
        provider_message_id:
          string |
          null;
        last_error_code:
          string |
          null;
        last_error_message:
          string |
          null;
        created_at:
          string;
      }>;
  };
}

async function jsonOrEmpty(
  response:
    Response,
) {
  return response
    .json()
    .catch(
      () => ({}),
    ) as Promise<
    Record<
      string,
      unknown
    >
  >;
}

function dateTime(
  value:
    string |
    null,
) {
  if (!value) {
    return "-";
  }

  const parsed =
    new Date(
      value,
    );

  return Number.isNaN(
    parsed.getTime(),
  )
    ? value
    : parsed.toLocaleString();
}

function preview(
  school:
    string,
  student:
    string,
  action:
    string,
  note:
    string,
) {
  return [
    `${school || "School"}: ${student} ${action}`,
    note.trim() ||
      null,
    "CASA - Do not reply.",
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .join(
      " ",
    );
}

export default function MessagingClient({
  slug,
  schoolName,
}: {
  slug:
    string;
  schoolName:
    string;
}) {
  const [
    data,
    setData,
  ] =
    useState<
      MessagingData |
      null
    >(
      null,
    );
  const [
    displayName,
    setDisplayName,
  ] =
    useState(
      schoolName,
    );
  const [
    note,
    setNote,
  ] =
    useState(
      "",
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const [
    error,
    setError,
  ] =
    useState(
      "",
    );
  const [
    notice,
    setNotice,
  ] =
    useState(
      "",
    );

  const endpoint =
    useMemo(
      () =>
        `/api/schools/${encodeURIComponent(
          slug,
        )}/messaging`,
      [
        slug,
      ],
    );

  const load =
    useCallback(
      async () => {
        const response =
          await fetch(
            endpoint,
            {
              cache:
                "no-store",
            },
          );
        const body =
          await jsonOrEmpty(
            response,
          );

        if (
          !response.ok
        ) {
          throw new Error(
            typeof body.message ===
              "string"
              ? body.message
              : "Messaging could not be loaded.",
          );
        }

        const next =
          body as unknown as
            MessagingData;

        setData(
          next,
        );
        setDisplayName(
          next.settings
            .displayName,
        );
        setNote(
          next.settings
            .note,
        );
      },
      [
        endpoint,
      ],
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void load().catch(
              (
                cause,
              ) => {
                setError(
                  cause instanceof
                    Error
                    ? cause.message
                    : "Messaging could not be loaded.",
                );
              },
            );
          },
          0,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [
      load,
    ],
  );

  async function action(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    setBusy(
      true,
    );
    setError(
      "",
    );
    setNotice(
      "",
    );

    try {
      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                payload,
              ),
          },
        );
      const body =
        await jsonOrEmpty(
          response,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Messaging action failed.",
        );
      }

      await load();
      return body;
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function saveSettings(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    try {
      await action({
        action:
          "SAVE_SMS_SETTINGS",
        displayName,
        note,
      });
      setNotice(
        "Guardian SMS settings saved and enabled.",
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "SMS settings could not be saved.",
      );
    }
  }

  async function disableSms() {
    try {
      await action({
        action:
          "DISABLE_SMS",
      });
      setNotice(
        "Guardian SMS disabled.",
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "SMS could not be disabled.",
      );
    }
  }

  async function dispatch() {
    setBusy(
      true,
    );
    setError(
      "",
    );
    setNotice(
      "",
    );

    try {
      const response =
        await fetch(
          `${endpoint}/dispatch`,
          {
            method:
              "POST",
          },
        );
      const body =
        await jsonOrEmpty(
          response,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Delivery run failed.",
        );
      }

      setNotice(
        `Delivery run: ${String(
          body.sent ??
            0,
        )} sent, ${String(
          body.retried ??
            0,
        )} scheduled for retry, ${String(
          body.failed ??
            0,
        )} failed.`,
      );
      await load();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Delivery run failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function retry(
    id:
      string,
  ) {
    try {
      await action({
        action:
          "RETRY_FAILED",
        outboxId:
          id,
      });
      setNotice(
        "SMS returned to the delivery queue.",
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Retry could not be scheduled.",
      );
    }
  }

  const count =
    (
      status:
        DeliveryState,
    ) =>
      data
        ?.delivery
        .counts[
          status
        ] ??
      0;

  const checkInPreview =
    preview(
      displayName,
      "Tobi Adeyemi",
      "checked in at 7:42 AM.",
      note,
    );
  const checkOutPreview =
    preview(
      displayName,
      "Tobi Adeyemi",
      "checked out at 3:18 PM.",
      note,
    );

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Guardian SMS
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              {schoolName}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              CASA queues attendance notifications independently of the attendance record and sends them through the configured SimHostNG SMS gateway.
            </p>
          </div>

          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/registry`}
            >
              Registry
            </Link>

            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/attendance`}
            >
              Attendance
            </Link>

            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/calendar`}
            >
              Calendar
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            Provider readiness
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            SimHostNG SMS
          </h2>

          <div className="mt-5 grid gap-2 text-sm">
            <p>
              Provider mode{" "}
              <strong>
                {data
                  ?.provider
                  .mode ??
                  "Loading"}
              </strong>
            </p>
            <p>
              API credential{" "}
              <strong>
                {data
                  ?.provider
                  .apiKeyConfigured
                  ? "Configured"
                  : "Missing"}
              </strong>
            </p>
            <p>
              Server ID{" "}
              <strong>
                {data
                  ?.provider
                  .serverIdConfigured
                  ? "Configured"
                  : "Missing"}
              </strong>
            </p>
            <p>
              SIM slot{" "}
              <strong>
                {data
                  ?.provider
                  .simSlotConfigured
                  ? `SIM ${data.provider.simSlot}`
                  : "Missing"}
              </strong>
            </p>
            <p>
              Runtime{" "}
              <strong>
                {data
                  ?.provider
                  .ready
                  ? "Ready"
                  : "Not ready"}
              </strong>
            </p>
          </div>

          <p className="mt-4 text-xs leading-5 text-black/45">
            The API key and Server ID are deployment configuration. School administrators never see or enter provider secrets.
          </p>
        </section>

        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            SMS state
          </p>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">
                {data
                  ?.settings
                  .enabled
                  ? "Guardian SMS active"
                  : "Guardian SMS inactive"}
              </h2>

              <p className="mt-2 text-sm text-black/50">
                {data
                  ?.settings
                  .enabled
                  ? "New eligible check-in and check-out events can queue SMS notifications."
                  : "Attendance continues normally, but new guardian SMS notifications are not queued."}
              </p>

              <p className="mt-2 text-xs text-black/40">
                Enabled:{" "}
                {dateTime(
                  data
                    ?.settings
                    .activatedAt ??
                    null,
                )}
              </p>
            </div>

            <span className="border border-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]">
              {data
                ?.settings
                .enabled
                ? "ACTIVE"
                : "OFF"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {data
              ?.settings
              .enabled && (
              <button
                className="casa-button"
                disabled={
                  busy
                }
                onClick={() =>
                  void disableSms()
                }
              >
                Disable SMS
              </button>
            )}

            {data
              ?.settings
              .enabled && (
              <button
                className="casa-button-primary"
                disabled={
                  busy
                }
                onClick={() =>
                  void dispatch()
                }
              >
                {busy
                  ? "Working..."
                  : "Process queue now"}
              </button>
            )}
          </div>
        </section>

        <form
          onSubmit={
            saveSettings
          }
          className="border border-black bg-white p-5 lg:col-span-2"
        >
          <p className="casa-kicker text-black/40">
            Message identity
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            Keep every attendance SMS short and recognisable
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-black/50">
            CASA inserts the student name and attendance time automatically. The school controls only its display name and one short optional note. Every message ends with CASA - Do not reply.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="casa-label">
              <span>
                School display name
              </span>

              <input
                className="casa-field"
                value={
                  displayName
                }
                maxLength={
                  40
                }
                required
                onChange={(
                  event,
                ) =>
                  setDisplayName(
                    event
                      .target
                      .value,
                  )
                }
              />

              <span className="mt-1 font-mono text-[9px] text-black/35">
                {displayName.length}/40
              </span>
            </label>

            <label className="casa-label">
              <span>
                Optional note
              </span>

              <input
                className="casa-field"
                value={
                  note
                }
                maxLength={
                  40
                }
                placeholder="Have a great school day."
                onChange={(
                  event,
                ) =>
                  setNote(
                    event
                      .target
                      .value,
                  )
                }
              />

              <span className="mt-1 font-mono text-[9px] text-black/35">
                {note.length}/40
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="border border-black/20 bg-[#f7f7f4] p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/40">
                Check-in preview / {checkInPreview.length} characters
              </p>

              <p className="mt-3 text-sm leading-6">
                {checkInPreview}
              </p>
            </div>

            <div className="border border-black/20 bg-[#f7f7f4] p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/40">
                Check-out preview / {checkOutPreview.length} characters
              </p>

              <p className="mt-3 text-sm leading-6">
                {checkOutPreview}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#7e5418]">
            Keep the school name and note plain and short. Long or Unicode-heavy messages may be split by the mobile network into multiple billable SMS segments.
          </p>

          <button
            className="casa-button-primary mt-5"
            disabled={
              busy ||
              !data
                ?.provider
                .ready
            }
          >
            {busy
              ? "Saving..."
              : data
                    ?.settings
                    .enabled
                ? "Save SMS settings"
                : "Save & enable SMS"}
          </button>
        </form>

        <section className="border border-black bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="casa-kicker text-black/40">
                Delivery control
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                Guardian SMS outbox
              </h2>
            </div>

            <p className="text-xs text-black/45">
              Eligible guardians missing a phone destination:{" "}
              {data
                ?.delivery
                .guardianDestinationsMissing ??
                0}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-px border border-black bg-black md:grid-cols-6">
            {(
              [
                "PENDING",
                "PROCESSING",
                "RETRY",
                "SENT",
                "FAILED",
                "CANCELLED",
              ] as DeliveryState[]
            ).map(
              (
                status,
              ) => (
                <div
                  key={
                    status
                  }
                  className="bg-white p-4"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                    {status}
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {count(
                      status,
                    )}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="mt-5 overflow-x-auto border border-black">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black bg-[#f2f2ef] font-mono text-[9px] uppercase tracking-[0.08em]">
                  <th className="p-3">
                    Event
                  </th>
                  <th className="p-3">
                    Guardian
                  </th>
                  <th className="p-3">
                    State
                  </th>
                  <th className="p-3">
                    Attempts
                  </th>
                  <th className="p-3">
                    Created / Sent
                  </th>
                  <th className="p-3">
                    Exception
                  </th>
                  <th className="p-3">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {(
                  data
                    ?.delivery
                    .recent ??
                  []
                ).map(
                  (
                    row,
                  ) => (
                    <tr
                      key={
                        row.id
                      }
                      className="border-b border-black/15 align-top last:border-b-0"
                    >
                      <td className="p-3">
                        <p className="font-medium">
                          {row.event_type.replaceAll(
                            "_",
                            " ",
                          )}
                        </p>

                        <p className="mt-1 font-mono text-[9px] text-black/40">
                          {row.template_key}
                        </p>
                      </td>

                      <td className="p-3 font-mono text-xs">
                        {row.recipient_phone}
                      </td>

                      <td className="p-3">
                        {row.status}
                      </td>

                      <td className="p-3">
                        {row.attempt_count}
                      </td>

                      <td className="p-3 text-xs">
                        <p>
                          {dateTime(
                            row.created_at,
                          )}
                        </p>

                        <p className="mt-1 text-black/45">
                          Sent:{" "}
                          {dateTime(
                            row.sent_at,
                          )}
                        </p>
                      </td>

                      <td className="max-w-72 p-3 text-xs">
                        <p className="font-mono">
                          {row.last_error_code ||
                            "-"}
                        </p>

                        {row.last_error_message && (
                          <p className="mt-1 text-black/50">
                            {row.last_error_message}
                          </p>
                        )}
                      </td>

                      <td className="p-3">
                        {row.status ===
                        "FAILED" ? (
                          <button
                            className="casa-button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              void retry(
                                row.id,
                              )
                            }
                          >
                            Retry
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ),
                )}

                {(
                  data
                    ?.delivery
                    .recent ??
                  []
                ).length ===
                  0 && (
                  <tr>
                    <td
                      className="p-5 text-sm text-black/45"
                      colSpan={
                        7
                      }
                    >
                      No guardian SMS has been queued yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {(notice ||
          error) && (
          <div className="lg:col-span-2">
            {notice && (
              <p className="border border-[#145a3b] bg-white p-4 text-sm text-[#145a3b]">
                {notice}
              </p>
            )}

            {error && (
              <p className="border border-[#7e1d18] bg-white p-4 text-sm text-[#7e1d18]">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
