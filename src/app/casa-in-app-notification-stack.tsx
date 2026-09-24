"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

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
  severity?:
    "INFO" |
    "WARNING" |
    "CRITICAL";
  schoolName?:
    string | null;
  branchName?:
    string | null;
};

type Endpoint =
  | {
      get: string;
      center: string;
    }
  | null;

function endpointForPath(
  pathname: string,
): Endpoint {
  if (
    pathname ===
      "/internal/login" ||
    pathname.startsWith(
      "/guardian-notifications/",
    ) ||
    pathname ===
      "/scanner"
  ) {
    return null;
  }

  if (
    pathname.startsWith(
      "/internal",
    )
  ) {
    if (
      pathname ===
      "/internal/notifications"
    ) {
      return null;
    }

    return {
      get:
        "/api/internal/notifications",
      center:
        "/internal/notifications",
    };
  }

  const match =
    pathname.match(
      /^\/schools\/([^/]+)/,
    );

  if (!match?.[1]) {
    return null;
  }

  const slug =
    decodeURIComponent(
      match[1],
    );

  if (
    pathname.endsWith(
      "/notifications",
    )
  ) {
    return null;
  }

  return {
    get:
      `/api/schools/${encodeURIComponent(
        slug,
      )}/notifications`,
    center:
      `/schools/${encodeURIComponent(
        slug,
      )}/notifications`,
  };
}

export default function CasaInAppNotificationStack() {
  const pathname =
    usePathname();
  const router =
    useRouter();
  const endpoint =
    useMemo(
      () =>
        endpointForPath(
          pathname,
        ),
      [
        pathname,
      ],
    );
  const [
    items,
    setItems,
  ] =
    useState<Notice[]>(
      [],
    );
  const [
    expanded,
    setExpanded,
  ] =
    useState(false);
  const [
    busyId,
    setBusyId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const refresh =
    useCallback(
      async () => {
        if (!endpoint) {
          setItems([]);
          return;
        }

        try {
          const response =
            await fetch(
              endpoint.get,
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
              };

          setItems(
            (
              body
                .notifications ??
              []
            ).filter(
              (item) =>
                !item.readAt,
            ),
          );
        } catch {
          // Notification polling is best effort and must not disturb the active page.
        }
      },
      [
        endpoint,
      ],
    );

  useEffect(
    () => {
      if (!endpoint) {
        return;
      }

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
          20_000,
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
      endpoint,
      refresh,
    ],
  );

  async function markRead(
    item:
      Notice,
  ) {
    if (!endpoint) {
      return;
    }

    setBusyId(
      item.id,
    );

    try {
      await fetch(
        endpoint.get,
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
              notificationId:
                item.id,
            }),
        },
      );

      setItems(
        (current) =>
          current.filter(
            (candidate) =>
              candidate.id !==
              item.id,
          ),
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  async function open(
    item:
      Notice,
  ) {
    await markRead(
      item,
    );

    if (
      item.actionUrl
    ) {
      router.push(
        item.actionUrl,
      );
    } else if (
      endpoint
    ) {
      router.push(
        endpoint.center,
      );
    }
  }

  if (
    !endpoint ||
    items.length ===
      0
  ) {
    return null;
  }

  const visible =
    expanded
      ? items.slice(
          0,
          8,
        )
      : items.slice(
          0,
          3,
        );
  const hiddenCount =
    Math.max(
      0,
      items.length -
        visible.length,
    );

  return (
    <aside
      aria-label="CASA notifications"
      className="pointer-events-none fixed right-4 top-4 z-[120] w-[min(390px,calc(100vw-2rem))]"
    >
      <div
        className={
          expanded
            ? "pointer-events-auto max-h-[75dvh] space-y-2 overflow-y-auto rounded-[26px] border border-black/15 bg-black/5 p-2 backdrop-blur-xl"
            : "pointer-events-auto relative h-[168px]"
        }
      >
        {visible.map(
          (
            item,
            index,
          ) => (
            <article
              key={
                item.id
              }
              className={
                expanded
                  ? "relative rounded-[22px] border border-black/15 bg-white/95 p-4 shadow-xl backdrop-blur-xl"
                  : "absolute inset-x-0 top-0 rounded-[22px] border border-black/15 bg-white/95 p-4 shadow-xl backdrop-blur-xl transition-transform"
              }
              style={
                expanded
                  ? undefined
                  : {
                      transform:
                        `translateY(${index * 10}px) scale(${1 - index * 0.035})`,
                      transformOrigin:
                        "top center",
                      zIndex:
                        30 -
                        index,
                    }
              }
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    items.length >
                    1
                      ? setExpanded(
                          true,
                        )
                      : void open(
                          item,
                        )
                  }
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-black/40">
                    {item.severity
                      ? `${item.severity} · `
                      : ""}
                    {item.eventType.replaceAll(
                      "_",
                      " ",
                    )}
                  </p>
                  <h2 className="mt-1 truncate text-sm font-semibold">
                    {item.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/60">
                    {item.body}
                  </p>
                  {!expanded &&
                  index ===
                    0 &&
                  items.length >
                    1 ? (
                    <p className="mt-2 text-[10px] font-semibold text-black/45">
                      {items.length -
                        1}{" "}
                      more notification
                      {items.length -
                        1 ===
                      1
                        ? ""
                        : "s"}{" "}
                      · tap to expand
                    </p>
                  ) : null}
                </button>

                <button
                  type="button"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                  disabled={
                    busyId ===
                    item.id
                  }
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/15 text-lg leading-none disabled:opacity-40"
                  onClick={() =>
                    void markRead(
                      item,
                    )
                  }
                >
                  ×
                </button>
              </div>

              {expanded ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <time className="text-[10px] text-black/40">
                    {new Date(
                      item.createdAt,
                    ).toLocaleString(
                      "en-NG",
                    )}
                  </time>
                  <button
                    type="button"
                    className="border-b border-black text-xs font-semibold"
                    onClick={() =>
                      void open(
                        item,
                      )
                    }
                  >
                    Open
                  </button>
                </div>
              ) : null}
            </article>
          ),
        )}

        {expanded ? (
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <button
              type="button"
              className="text-xs text-black/55"
              onClick={() =>
                setExpanded(
                  false,
                )
              }
            >
              Collapse
            </button>
            <button
              type="button"
              className="text-xs font-semibold"
              onClick={() =>
                router.push(
                  endpoint.center,
                )
              }
            >
              {hiddenCount >
              0
                ? `View all · +${hiddenCount}`
                : "View notification centre"}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
