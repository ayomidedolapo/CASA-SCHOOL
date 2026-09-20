"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CasaInputDialog } from "@/components/casa-input-dialog";

type School = { id: string; name: string; slug: string };
type Branch = { id: string; school_id: string; name: string };
type Template = { id: string; school_id: string; school_name: string; version_label: string; status: string; activated_at: string | null; created_at: string };
type Snapshot = { schoolName?: string; studentName?: string; casaStudentId?: string; admissionNumber?: string | null; className?: string | null; cardSerial?: string; branchId?: string | null; branchName?: string | null };
type Job = { id: string; schoolId: string; status: "READY" | "EXPORTED" | "PRINTED"; publicLinkRevision: number; renderSnapshot: Snapshot; queuedAt: string; exportedAt: string | null; printedAt: string | null; templateVersion: string; publicUrl: string };

function fmt(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }

export default function CardProductionClient({ schools, branches, templates }: { schools: School[]; branches: Branch[]; templates: Template[] }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotateJob, setRotateJob] = useState<Job | null>(null);
  const availableBranches = useMemo(() => branches.filter((branch) => !schoolId || branch.school_id === schoolId), [branches, schoolId]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "250" });
    if (status) params.set("status", status);
    if (schoolId) params.set("schoolId", schoolId);
    if (branchId) params.set("branchId", branchId);
    const response = await fetch(`/api/internal/operations/card-production/jobs?${params}`, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => null) as { jobs?: Job[]; message?: string } | null;
    if (!response.ok) throw new Error(body?.message ?? "Unable to load card production queue.");
    setError(null);
    setJobs(body?.jobs ?? []);
  }, [status, schoolId, branchId]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "250" });
    if (status) params.set("status", status);
    if (schoolId) params.set("schoolId", schoolId);
    if (branchId) params.set("branchId", branchId);

    void fetch(`/api/internal/operations/card-production/jobs?${params}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as {
          jobs?: Job[];
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(
            body?.message ?? "Unable to load card production queue.",
          );
        }

        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setError(null);
        setJobs(body?.jobs ?? []);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load queue.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [status, schoolId, branchId]);
  const counts = useMemo(() => ({ ready: jobs.filter((job) => job.status === "READY").length, exported: jobs.filter((job) => job.status === "EXPORTED").length, printed: jobs.filter((job) => job.status === "PRINTED").length }), [jobs]);

  async function action(job: Job, kind: "MARK_PRINTED" | "ROTATE_PUBLIC_LINK", reason = "") {
    if (kind === "ROTATE_PUBLIC_LINK" && reason.trim().length < 3) {
      setRotateJob(job);
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/internal/operations/card-production/jobs/${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: kind, reason: reason.trim() || null }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Card production action failed.");
      setMessage(kind === "MARK_PRINTED" ? "Production job marked printed." : "Public card link rotated.");
      setRotateJob(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Card production action failed."); } finally { setBusy(false); }
  }

  async function exportManifest() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/internal/operations/card-production/manifest", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ status: status || null, schoolId: schoolId || null, branchId: branchId || null, limit: 1000 }) });
      if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "Manifest export failed."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `casa-card-production-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Manifest exported with School, Branch and exact Template Version. READY jobs included in the export are now EXPORTED.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Manifest export failed."); } finally { setBusy(false); }
  }

  return <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
    <section className="grid border border-black bg-white sm:grid-cols-3">{[["Ready to print", counts.ready], ["Printing / exported", counts.exported], ["Printed", counts.printed]].map(([label, value]) => <div key={String(label)} className="border-b border-black/15 p-5 sm:border-r sm:border-b-0 sm:last:border-r-0"><p className="casa-kicker text-black/40">{label}</p><p className="mt-7 text-4xl font-semibold tracking-[-0.06em]">{value}</p></div>)}</section>
    <section className="mt-8 border border-black bg-white">
      <div className="grid gap-3 border-b border-black p-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setBranchId(""); }} className="h-12 border border-black/20 bg-white px-3"><option value="">All organizations</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-12 border border-black/20 bg-white px-3"><option value="">All branches</option>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{schoolId ? "" : ` · ${schools.find((school) => school.id === branch.school_id)?.name ?? ""}`}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 border border-black/20 bg-white px-3"><option value="">All statuses</option><option>READY</option><option>EXPORTED</option><option>PRINTED</option></select>
        <button type="button" onClick={() => void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Reload failed."))} className="border border-black px-4 py-3 text-sm">Reload</button>
        <button type="button" disabled={busy || jobs.length === 0} onClick={() => void exportManifest()} className="casa-button-primary disabled:opacity-40">Export XLSX</button>
      </div>
      {(error || message) && <div className={`border-b border-black/15 px-5 py-4 text-sm ${error ? "text-red-700" : "text-black/60"}`}>{error ?? message}</div>}
      {jobs.length === 0 ? <p className="p-8 text-sm text-black/50">No card production jobs match this view.</p> : <div className="divide-y divide-black/15">{jobs.map((job, index) => <article key={job.id} className="grid gap-4 p-5 xl:grid-cols-[3rem_1.3fr_0.8fr_0.7fr_auto] xl:items-center"><span className="font-mono text-[10px] text-black/30">{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold">{job.renderSnapshot?.studentName ?? "Student"}</h3><p className="mt-1 text-sm text-black/50">{job.renderSnapshot?.schoolName ?? schools.find((school) => school.id === job.schoolId)?.name ?? "Organization"}{job.renderSnapshot?.branchName ? ` · ${job.renderSnapshot.branchName}` : ""}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-black/35">{job.renderSnapshot?.casaStudentId ?? job.renderSnapshot?.cardSerial ?? job.id}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em]">{job.status}</p><p className="mt-2 text-xs text-black/40">Template {job.templateVersion}</p></div><div className="text-xs text-black/45"><p>Queued {fmt(job.queuedAt)}</p><p className="mt-1">Printed {fmt(job.printedAt)}</p></div><div className="flex flex-wrap gap-2"><a href={`/api/internal/operations/card-production/jobs/${encodeURIComponent(job.id)}/preview`} target="_blank" rel="noreferrer" className="border border-black px-3 py-2 text-xs">Preview</a>{job.status !== "PRINTED" && <button disabled={busy} onClick={() => void action(job, "MARK_PRINTED")} className="border border-black px-3 py-2 text-xs disabled:opacity-40">Mark printed</button>}<button disabled={busy} onClick={() => void action(job, "ROTATE_PUBLIC_LINK")} className="border border-black/25 px-3 py-2 text-xs disabled:opacity-40">Rotate link</button></div></article>)}</div>}
    </section>
    <section className="mt-8 border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Master templates</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Registered school templates</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">Every version is visibly tied to one school. The Templates workspace provides the full front/back gallery.</p></div>{templates.length === 0 ? <p className="p-8 text-sm text-black/50">No master card template is registered yet.</p> : <div className="divide-y divide-black/15">{templates.map((template) => <div key={template.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto]"><div><p className="font-semibold">{template.school_name}</p><p className="mt-1 text-sm text-black/45">{template.version_label}</p></div><span className="font-mono text-[10px] uppercase tracking-[0.1em]">{template.status}</span><span className="text-xs text-black/40">{template.activated_at ? `Activated ${fmt(template.activated_at)}` : `Created ${fmt(template.created_at)}`}</span></div>)}</div>}</section>
    <CasaInputDialog open={rotateJob !== null} title="Rotate public card link" message="Enter the reason for rotating this public card link. The reason is retained in the production audit history." label="Reason" minLength={3} maxLength={240} confirmLabel="Rotate link" busy={busy} onCancel={() => setRotateJob(null)} onConfirm={(reason) => { if (rotateJob) void action(rotateJob, "ROTATE_PUBLIC_LINK", reason); }} />
  </div>;
}
