"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Notice = { id: string; title: string; body: string; eventType: string; actionUrl: string | null; readAt: string | null; createdAt: string };

export default function NotificationsClient({ slug, schoolId, schoolName, canBrand }: { slug: string; schoolId: string; schoolName: string; canBrand: boolean }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [logoNonce, setLogoNonce] = useState(0);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/schools/${encodeURIComponent(slug)}/notifications`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const body = await response.json() as { notifications?: Notice[]; unread?: number };
    setItems(body.notifications ?? []);
    setUnread(body.unread ?? 0);
  }, [slug]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  async function markAll() {
    setBusy(true);
    try {
      await fetch(`/api/schools/${encodeURIComponent(slug)}/notifications`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ markAllRead: true }) });
      await refresh();
    } finally { setBusy(false); }
  }
  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLogoBusy(true);
    setLogoMessage("");
    try {
      const response = await fetch(`/api/schools/${encodeURIComponent(slug)}/notification-branding`, { method: "POST", credentials: "same-origin", body: data });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Unable to save notification logo.");
      setLogoMessage("Notification logo saved.");
      setLogoNonce((value) => value + 1);
      form.reset();
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Unable to save notification logo.");
    } finally {
      setLogoBusy(false);
    }
  }
  return <main className="min-h-screen bg-[#f2f2ef] px-5 py-8 text-black sm:px-8 lg:px-10">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black pb-5">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-black/45">CASA / {schoolName}</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Notifications</h1><p className="mt-2 text-sm text-black/50">Durable action-needed events only. Routine scans are not added here.</p></div>
        <div className="flex gap-2"><Link className="border border-black px-4 py-3 text-sm" href={`/schools/${encodeURIComponent(slug)}/attendance`}>Attendance</Link><button className="border border-black bg-black px-4 py-3 text-sm text-white disabled:opacity-40" disabled={busy || unread === 0} onClick={() => void markAll()}>Mark all read · {unread}</button></div>
      </div>
      {canBrand ? <section className="mt-6 grid gap-5 border border-black bg-white p-5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
        <div className="flex h-24 w-24 items-center justify-center border border-black/15 bg-[#f2f2ef]"><img className="max-h-20 max-w-20 object-contain" alt={`${schoolName} notification logo`} src={`/api/public/schools/${encodeURIComponent(schoolId)}/notification-logo?v=${logoNonce}`} /></div>
        <form onSubmit={(event) => void uploadLogo(event)}><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">Notification identity</p><h2 className="mt-1 text-lg font-semibold">School notification logo</h2><p className="mt-1 text-sm text-black/50">Used by the guardian notification experience where the platform allows school branding. PNG/JPEG/WebP, up to 3 MB.</p><div className="mt-4 flex flex-wrap items-center gap-3"><input required name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="max-w-full text-sm"/><button disabled={logoBusy} className="border border-black bg-black px-4 py-2 text-sm text-white disabled:opacity-40" type="submit">{logoBusy ? "Saving…" : "Save logo"}</button>{logoMessage ? <span className="text-sm text-black/55">{logoMessage}</span> : null}</div></form>
      </section> : null}
      <div className="mt-6 border border-black bg-white">
        {items.length === 0 ? <p className="p-6 text-sm text-black/50">No action-needed notifications.</p> : items.map((item) => <article key={item.id} className={`border-b border-black/15 p-5 last:border-b-0 ${item.readAt ? "opacity-60" : ""}`}><div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">{item.eventType.replaceAll("_", " ")}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">{item.body}</p></div><time className="text-xs text-black/40">{new Date(item.createdAt).toLocaleString()}</time></div>{item.actionUrl ? <Link className="mt-4 inline-block border-b border-black text-sm" href={item.actionUrl}>Open context →</Link> : null}</article>)}
      </div>
    </div>
  </main>;
}
