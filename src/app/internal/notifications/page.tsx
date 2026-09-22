"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Notice = {
  id: string;
  schoolId: string | null;
  schoolName: string | null;
  branchName: string | null;
  eventType: string;
  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL";
  category: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function InternalNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/internal/notifications", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      router.replace("/internal/login");
      return;
    }
    if (!response.ok) return;
    const body = await response.json() as { notifications?: Notice[]; unread?: number };
    setItems(body.notifications ?? []);
    setUnread(body.unread ?? 0);
  }, [router]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      window.clearTimeout(
        initialTimer,
      );
      window.clearInterval(
        refreshTimer,
      );
    };
  }, [refresh]);

  async function markAll() {
    setBusy(true);
    try {
      await fetch("/api/internal/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ markAllRead: true }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return <main className="casa-noise min-h-screen bg-[#f2f2ef] px-5 py-8 text-black sm:px-8 lg:px-10">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black pb-5">
        <div><p className="casa-kicker text-black/45">CASA / Internal</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Notifications.</h1><p className="mt-2 max-w-2xl text-sm text-black/50">Action-needed platform and school events. Routine attendance scans are intentionally excluded.</p></div>
        <div className="flex gap-2"><Link className="border border-black px-4 py-3 text-sm" href="/internal">Platform control</Link><button className="border border-black bg-black px-4 py-3 text-sm text-white disabled:opacity-40" disabled={busy || unread === 0} onClick={() => void markAll()}>Mark all read · {unread}</button></div>
      </header>
      <section className="mt-6 border border-black bg-white">
        {items.length === 0 ? <p className="p-6 text-sm text-black/50">No action-needed notifications.</p> : items.map((item) => <article key={item.id} className={`border-b border-black/15 p-5 last:border-b-0 ${item.readAt ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">{item.severity} · {item.category.replaceAll("_", " ")} · {item.eventType.replaceAll("_", " ")}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">{item.body}</p><p className="mt-2 text-xs text-black/40">{[item.schoolName, item.branchName].filter(Boolean).join(" · ") || "CASA platform"}</p></div><time className="text-xs text-black/40">{new Date(item.createdAt).toLocaleString()}</time></div>
          {item.actionUrl ? <Link className="mt-4 inline-block border-b border-black text-sm" href={item.actionUrl}>Open context →</Link> : null}
        </article>)}
      </section>
    </div>
  </main>;
}
