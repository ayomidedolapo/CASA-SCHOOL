"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

type BrandingBranch = {
  id: string;
  name: string;
  isHeadquarters: boolean;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  eventType: string;
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

export default function NotificationsClient(
  {
    slug,
    schoolId,
    schoolName,
    canBrand,
    organizationAdmin,
    brandingBranches,
  }: {
    slug: string;
    schoolId: string;
    schoolName: string;
    canBrand: boolean;
    organizationAdmin: boolean;
    brandingBranches: BrandingBranch[];
  },
) {
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
  const [
    logoBusy,
    setLogoBusy,
  ] =
    useState(false);
  const [
    logoMessage,
    setLogoMessage,
  ] =
    useState("");
  const [
    logoNonce,
    setLogoNonce,
  ] =
    useState(0);
  const [
    logoScope,
    setLogoScope,
  ] =
    useState(
      organizationAdmin
        ? "SCHOOL"
        : brandingBranches[0]?.id ??
          "SCHOOL",
    );

  const logoPreviewUrl =
    logoScope ===
      "SCHOOL"
      ? `/api/public/schools/${encodeURIComponent(
          schoolId,
        )}/notification-logo?v=${logoNonce}`
      : `/api/public/schools/${encodeURIComponent(
          schoolId,
        )}/notification-logo?branchId=${encodeURIComponent(
          logoScope,
        )}&v=${logoNonce}`;

  const endpoint =
    `/api/schools/${encodeURIComponent(
      slug,
    )}/notifications`;

  const refresh =
    useCallback(
      async () => {
        const response =
          await fetch(
            endpoint,
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );

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
        endpoint,
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
      endpoint,
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
        endpoint,
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
        `/schools/${encodeURIComponent(
          slug,
        )}/audit`,
    );
  }

  async function uploadLogo(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      event.currentTarget;
    const data =
      new FormData(
        form,
      );

    if (
      logoScope ===
        "SCHOOL"
    ) {
      data.set(
        "scope",
        "SCHOOL",
      );
      data.delete(
        "branchId",
      );
    } else {
      data.set(
        "scope",
        "BRANCH",
      );
      data.set(
        "branchId",
        logoScope,
      );
    }

    setLogoBusy(
      true,
    );
    setLogoMessage(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/notification-branding`,
          {
            method:
              "POST",
            credentials:
              "same-origin",
            body:
              data,
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => null,
          ) as {
            message?:
              string;
          } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Unable to save notification logo.",
        );
      }

      setLogoMessage(
        logoScope ===
          "SCHOOL"
          ? "Whole-school fallback logo saved."
          : "Campus notification logo saved.",
      );
      setLogoNonce(
        (value) =>
          value +
          1,
      );
      form.reset();
    } catch (
      error
    ) {
      setLogoMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to save notification logo.",
      );
    } finally {
      setLogoBusy(
        false,
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f2ef] px-5 py-8 text-black sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black pb-5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-black/45">
              CASA / {schoolName}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-black/50">
              School operations that matter, grouped by day. Routine individual attendance scans stay out of this centre.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="border border-black px-4 py-3 text-sm"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/attendance`}
            >
              Attendance
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
        </div>

        {canBrand ? (
          <section className="mt-6 grid gap-5 border border-black bg-white p-5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
            <div className="flex h-24 w-24 items-center justify-center border border-black/15 bg-[#f2f2ef]">
              <img
                className="max-h-20 max-w-20 object-contain"
                alt={`${schoolName} notification logo`}
                src={logoPreviewUrl}
              />
            </div>
            <form
              onSubmit={(event) =>
                void uploadLogo(
                  event,
                )
              }
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
                Notification identity
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Notification logo
              </h2>
              <p className="mt-1 text-sm text-black/50">
                Each campus can use its own logo. A branch logo is used first; the explicit whole-school logo is only the fallback. HQ logo is not automatically used by other campuses.
              </p>

              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">
                  Logo scope
                </span>
                <select
                  className="w-full border border-black bg-white px-3 py-2 text-sm"
                  value={logoScope}
                  onChange={(event) =>
                    setLogoScope(
                      event.target.value,
                    )
                  }
                >
                  {organizationAdmin ? (
                    <option value="SCHOOL">
                      Whole school fallback
                    </option>
                  ) : null}
                  {brandingBranches.map(
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

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  required
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="max-w-full text-sm"
                />
                <button
                  disabled={
                    logoBusy
                  }
                  className="border border-black bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
                  type="submit"
                >
                  {logoBusy
                    ? "Saving…"
                    : "Save logo"}
                </button>
                {logoMessage ? (
                  <span className="text-sm text-black/55">
                    {logoMessage}
                  </span>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

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
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
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
                            View details →
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
                              Mark read
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
