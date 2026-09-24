"use client";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  schoolName?: string | null;
  branchName?: string | null;
};

type Endpoint =
  | { get: string; center: string }
  | null;

type FloatingPosition = {
  left: number;
  top: number;
};

function endpointForPath(pathname: string): Endpoint {
  if (
    pathname === "/internal/login" ||
    pathname.startsWith("/guardian-notifications/") ||
    pathname === "/scanner"
  ) {
    return null;
  }

  if (pathname.startsWith("/internal")) {
    if (pathname === "/internal/notifications") return null;
    return {
      get: "/api/internal/notifications",
      center: "/internal/notifications",
    };
  }

  const match = pathname.match(/^\/schools\/([^/]+)/);
  if (!match?.[1]) return null;

  const slug = decodeURIComponent(match[1]);
  if (pathname.endsWith("/notifications")) return null;

  return {
    get: `/api/schools/${encodeURIComponent(slug)}/notifications`,
    center: `/schools/${encodeURIComponent(slug)}/notifications`,
  };
}

export default function CasaInAppNotificationStack() {
  const pathname = usePathname();
  const router = useRouter();
  const asideRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const endpoint = useMemo(
    () => endpointForPath(pathname),
    [pathname],
  );

  const [items, setItems] = useState<Notice[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!endpoint) {
      setItems([]);
      return;
    }

    try {
      const response = await fetch(endpoint.get, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const body = await response.json() as { notifications?: Notice[] };
      setItems((body.notifications ?? []).filter((item) => !item.readAt));
    } catch {
      // Best effort: floating notifications must never disturb the active page.
    }
  }, [endpoint]);

  useEffect(() => {
    if (!endpoint) return;

    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const interval = window.setInterval(() => {
      void refresh();
    }, 20_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [endpoint, refresh]);

  const floatingItems = useMemo(
    () => items.filter((item) => !hiddenIds.has(item.id)),
    [items, hiddenIds],
  );

  function hideNotification(notificationId: string) {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(notificationId);
      return next;
    });
  }

  function hideAllFloating() {
    setHiddenIds((current) => {
      const next = new Set(current);
      for (const item of floatingItems) next.add(item.id);
      return next;
    });
    setExpanded(false);
  }

  async function markRead(item: Notice) {
    if (!endpoint) return;

    setBusyId(item.id);
    try {
      await fetch(endpoint.get, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ notificationId: item.id }),
      });
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function viewDetails(item: Notice) {
    await markRead(item);
    if (item.actionUrl) {
      router.push(item.actionUrl);
    } else if (endpoint) {
      router.push(endpoint.center);
    }
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const aside = asideRef.current;
    if (!aside) return;

    const rect = aside.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = dragRef.current;
    const aside = asideRef.current;
    if (!state || !aside || state.pointerId !== event.pointerId) return;

    const rect = aside.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(
      8,
      window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8,
    );

    setPosition({
      left: Math.min(maxLeft, Math.max(8, event.clientX - state.offsetX)),
      top: Math.min(maxTop, Math.max(8, event.clientY - state.offsetY)),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!endpoint || floatingItems.length === 0) return null;

  const visible = expanded
    ? floatingItems.slice(0, 8)
    : floatingItems.slice(0, 3);
  const hiddenCount = Math.max(0, floatingItems.length - visible.length);

  return (
    <aside
      ref={asideRef}
      aria-label="CASA notifications"
      className={`pointer-events-none fixed z-[120] w-[min(390px,calc(100vw-2rem))] ${position ? "" : "right-4 top-4"}`}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      <div className="pointer-events-auto mb-1 flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Drag notifications"
          title="Drag notifications"
          className="touch-none cursor-grab rounded-full border border-black/15 bg-white/95 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] shadow-sm active:cursor-grabbing"
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          Drag
        </button>

        {!expanded ? (
          <button
            type="button"
            aria-label="Hide all floating notifications"
            title="Hide all from the floating view · stays unread"
            className="rounded-full border border-black/15 bg-white/95 px-3 py-1.5 text-[10px] font-semibold shadow-sm"
            onClick={hideAllFloating}
          >
            Hide all
          </button>
        ) : null}
      </div>

      <div
        className={
          expanded
            ? "pointer-events-auto max-h-[75dvh] space-y-2 overflow-y-auto p-1"
            : "pointer-events-auto relative h-[168px]"
        }
      >
        {visible.map((item, index) => (
          <article
            key={item.id}
            className={
              expanded
                ? "relative rounded-[22px] border border-black/15 bg-white/95 p-4 shadow-xl backdrop-blur-xl"
                : "absolute inset-x-0 top-0 rounded-[22px] border border-black/15 bg-white/95 p-4 shadow-xl backdrop-blur-xl transition-transform"
            }
            style={
              expanded
                ? undefined
                : {
                    transform: `translateY(${index * 10}px) scale(${1 - index * 0.035})`,
                    transformOrigin: "top center",
                    zIndex: 30 - index,
                  }
            }
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  floatingItems.length > 1
                    ? setExpanded(true)
                    : void viewDetails(item)
                }
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-black/40">
                  {item.severity ? `${item.severity} · ` : ""}
                  {item.eventType.replaceAll("_", " ")}
                </p>
                <h2 className="mt-1 truncate text-sm font-semibold">
                  {item.title}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/60">
                  {item.body}
                </p>
                {!expanded && index === 0 && floatingItems.length > 1 ? (
                  <p className="mt-2 text-[10px] font-semibold text-black/45">
                    {floatingItems.length - 1} more notification
                    {floatingItems.length - 1 === 1 ? "" : "s"} · tap to expand
                  </p>
                ) : null}
              </button>

              <button
                type="button"
                aria-label="Hide notification from floating view"
                title="Hide from floating view · stays unread"
                disabled={busyId === item.id}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/15 text-lg leading-none disabled:opacity-40"
                onClick={() => hideNotification(item.id)}
              >
                ×
              </button>
            </div>

            {expanded ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <time className="text-[10px] text-black/40">
                  {new Date(item.createdAt).toLocaleString("en-NG")}
                </time>
                <button
                  type="button"
                  className="border-b border-black text-xs font-semibold"
                  onClick={() => void viewDetails(item)}
                >
                  View details
                </button>
              </div>
            ) : null}
          </article>
        ))}

        {expanded ? (
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <button
              type="button"
              className="text-xs text-black/55"
              onClick={() => setExpanded(false)}
            >
              Collapse
            </button>
            <button
              type="button"
              className="text-xs font-semibold"
              onClick={() => router.push(endpoint.center)}
            >
              {hiddenCount > 0
                ? `View all · +${hiddenCount}`
                : "View notification centre"}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
