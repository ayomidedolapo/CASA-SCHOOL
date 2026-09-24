"use client";

import Link from "next/link";
import {
  useRouter,
} from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Notice = {
  id: string;
  schoolId:
    string | null;
  schoolName:
    string | null;
  branchName:
    string | null;
  eventType: string;
  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL";
  category: string;
  title: string;
  body: string;
  actionUrl:
    string | null;
  readAt:
    string | null;
  createdAt: string;
};

function dayKey(
  value: string,
) {
  const date =
    new Date(
      value,
    );

  return `${date.getFullYear()}-${String(
    date.getMonth() +
      1,
  ).padStart(
    2,
    "0",
  )}-${String(
    date.getDate(),
  ).padStart(
    2,
    "0",
  )}`;
}

function dayLabel(
  key: string,
) {
  const today =
    new Date();
  const yesterday =
    new Date(
      today,
    );
  yesterday.setDate(
    today.getDate() -
      1,
  );

  if (
    key ===
    dayKey(
      today.toISOString(),
    )
  ) {
    return "Today";
  }

  if (
    key ===
    dayKey(
      yesterday.toISOString(),
    )
  ) {
    return "Yesterday";
  }

  const [
    year,
    month,
    day,
  ] =
    key
      .split("-")
      .map(
        Number,
      );

  return new Date(
    year,
    month -
      1,
    day,
  ).toLocaleDateString(
    "en-NG",
    {
      weekday:
        "long",
      day:
        "numeric",
      month:
        "long",
      year:
        "numeric",
    },
  );
}

export default function InternalNotificationsPage() {
  const router =
    useRouter();
  const [
    items,
    setItems,
  ] =
    useState<Notice[]>(
      [],
    );
  const [
    unread,
    setUnread,
  ] =
    useState(0);
  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const refresh =
    useCallback(
      async () => {
        const response =
          await fetch(
            "/api/internal/notifications",
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );

        if (
          response.status ===
            401 ||
          response.status ===
            403
        ) {
          router.replace(
            "/internal/login",
          );
          return;
        }

        if (!response.ok) {
          return;
        }

        const body =
          await response
            .json() as {
              notifications?:
                Notice[];
              unread?:
                number;
            };

        setItems(
          body.notifications ??
            [],
        );
        setUnread(
          body.unread ??
            0,
        );
      },
      [
        router,
      ],
    );

  useEffect(
    () => {
      const initial =
        window.setTimeout(
          () => {
            void refresh();
          },
          0,
        );
      const interval =
        window.setInterval(
          () => {
            void refresh();
          },
          30_000,
        );

      return () => {
        window.clearTimeout(
          initial,
        );
        window.clearInterval(
          interval,
        );
      };
    },
    [
      refresh,
    ],
  );

  const groups =
    useMemo(
      () => {
        const result =
          new Map<
            string,
            Notice[]
          >();

        for (
          const item of
            items
        ) {
          const key =
            dayKey(
              item.createdAt,
            );
          const list =
            result.get(
              key,
            ) ??
            [];
          list.push(
            item,
          );
          result.set(
            key,
            list,
          );
        }

        return [
          ...result.entries(),
        ];
      },
      [
        items,
      ],
    );

  async function mark(
    notificationId:
      string,
  ) {
    await fetch(
      "/api/internal/notifications",
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
            notificationId,
          }),
      },
    );

    await refresh();
  }

  async function markAll() {
    setBusy(
      true,
    );

    try {
      await fetch(
        "/api/internal/notifications",
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
              markAllRead:
                true,
            }),
        },
      );
      await refresh();
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function openContext(
    item:
      Notice,
  ) {
    if (!item.readAt) {
      await mark(
        item.id,
      );
    }

    router.push(
      item.actionUrl ??
        "/internal",
    );
  }

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] px-5 py-8 text-black sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black pb-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Internal
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">
              Notifications.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-black/50">
              Meaningful school and platform activity for CASA Operations. Routine student scans remain excluded.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="border border-black px-4 py-3 text-sm"
              href="/internal"
            >
              Platform control
            </Link>
            <button
              className="border border-black bg-black px-4 py-3 text-sm text-white disabled:opacity-40"
              disabled={
                busy ||
                unread ===
                  0
              }
              onClick={() =>
                void markAll()
              }
            >
              Mark all read · {unread}
            </button>
          </div>
        </header>

        {items.length ===
        0 ? (
          <section className="mt-6 border border-black bg-white p-6 text-sm text-black/50">
            No notifications yet.
          </section>
        ) : (
          groups.map(
            ([
              key,
              notices,
            ]) => (
              <section
                key={
                  key
                }
                className="mt-6"
              >
                <div className="mb-2 flex items-center gap-3">
                  <h2 className="text-sm font-semibold">
                    {dayLabel(
                      key,
                    )}
                  </h2>
                  <span className="font-mono text-[9px] text-black/35">
                    {notices.length}
                  </span>
                </div>

                <div className="border border-black bg-white">
                  {notices.map(
                    (
                      item,
                    ) => (
                      <article
                        key={
                          item.id
                        }
                        className={`border-b border-black/15 p-5 last:border-b-0 ${item.readAt ? "opacity-55" : ""}`}
                      >
                        <div className="flex flex-wrap justify-between gap-4">
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
                              {item.severity} ·{" "}
                              {item.category.replaceAll(
                                "_",
                                " ",
                              )}{" "}
                              ·{" "}
                              {item.eventType.replaceAll(
                                "_",
                                " ",
                              )}
                            </p>
                            <h3 className="mt-1 text-lg font-semibold">
                              {item.title}
                            </h3>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
                              {item.body}
                            </p>
                            <p className="mt-2 text-xs text-black/40">
                              {[
                                item.schoolName,
                                item.branchName,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " · ",
                                ) ||
                                "CASA platform"}
                            </p>
                          </div>
                          <time className="text-xs text-black/40">
                            {new Date(
                              item.createdAt,
                            ).toLocaleTimeString(
                              "en-NG",
                              {
                                hour:
                                  "2-digit",
                                minute:
                                  "2-digit",
                              },
                            )}
                          </time>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            className="border-b border-black text-sm font-semibold"
                            onClick={() =>
                              void openContext(
                                item,
                              )
                            }
                          >
                            Open context →
                          </button>
                          {!item.readAt ? (
                            <button
                              type="button"
                              className="text-sm text-black/45"
                              onClick={() =>
                                void mark(
                                  item.id,
                                )
                              }
                            >
                              Dismiss
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ),
                  )}
                </div>
              </section>
            ),
          )
        )}
      </div>
    </main>
  );
}
