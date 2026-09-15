"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface Session { id: string; name: string; starts_on: string; ends_on: string; status: string }
interface Term { id: string; academic_session_id: string; name: string; position: number; starts_on: string; ends_on: string; status: string }
interface Branch { id: string; name: string; code: string; is_headquarters: boolean; status: string }
interface Arm { section_id: string | null; section_name: string | null; level_id: string; level_name: string; level_code: string | null; arm_id: string; arm_name: string; arm_code: string | null; branch_id: string | null; branch_name: string | null }
interface Payload { sessions: Session[]; terms: Term[]; branches: Branch[]; classArms: Arm[] }

const empty: Payload = { sessions: [], terms: [], branches: [], classArms: [] };

export default function AcademicClient({ slug, schoolName }: { slug: string; schoolName: string }) {
  const [data, setData] = useState<Payload>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/schools/${encodeURIComponent(slug)}/academic/setup`;

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Academic setup could not be loaded.");
    setData(body as Payload);
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Academic setup could not be loaded.",
        );
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  async function post(body: unknown) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : "Academic setup could not be saved.");
    return result;
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(""); setNotice("");
    try {
      await post({
        action: "CREATE_SESSION",
        name: form.get("name"),
        startsOn: form.get("startsOn"),
        endsOn: form.get("endsOn"),
        terms: [1,2,3].map((position) => ({ name: form.get(`term${position}Name`), startsOn: form.get(`term${position}Start`), endsOn: form.get(`term${position}End`) })),
      });
      formElement.reset();
      setNotice("Academic session and all three terms created.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Academic session could not be created."); }
    finally { setBusy(false); }
  }

  async function createArm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(""); setNotice("");
    try {
      await post({ action: "CREATE_CLASS_ARM", sectionName: form.get("sectionName"), levelName: form.get("levelName"), levelCode: form.get("levelCode") || null, armName: form.get("armName"), armCode: form.get("armCode") || null, branchId: form.get("branchId") });
      formElement.reset();
      setNotice("Class arm created and assigned to its campus.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Class arm could not be created."); }
    finally { setBusy(false); }
  }

  async function assign(classArmId: string, branchId: string) {
    setBusy(true); setError(""); setNotice("");
    try { await post({ action: "ASSIGN_CLASS_ARM", classArmId, branchId }); setNotice("Campus assignment updated."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Campus assignment could not be updated."); }
    finally { setBusy(false); }
  }

  return <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
    <header className="border-b border-black bg-white px-5 py-6 sm:px-8"><div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5"><div><p className="casa-kicker text-black/45">CASA / Academic Setup</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{schoolName}</h1><p className="mt-2 max-w-2xl text-sm text-black/50">Create the three-term academic session, then build class levels and arms and map each arm to the campus where it operates.</p></div><nav className="flex flex-wrap gap-3 text-sm"><Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/registry`}>Registry</Link><Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/calendar`}>Calendar & holidays</Link><Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/attendance`}>Attendance</Link></nav></div></header>
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
      {notice && <div className="mb-5 border border-black bg-[#e8f2ec] p-4 text-sm">{notice}</div>}{error && <div className="mb-5 border border-[#8b221d] bg-[#f6e8e6] p-4 text-sm text-[#7e1d18]">{error}</div>}
      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={createSession} className="border border-black bg-white p-5"><p className="casa-kicker text-black/40">Academic year</p><h2 className="mt-2 text-2xl font-semibold">Create session + three terms</h2><p className="mt-2 text-xs leading-5 text-black/45">CASA treats one academic session as exactly three terms. Breaks between terms are allowed; term dates must not overlap.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="casa-label sm:col-span-2"><span>Session name</span><input className="casa-field" name="name" placeholder="2026/2027" required/></label><label className="casa-label"><span>Session starts</span><input className="casa-field" type="date" name="startsOn" required/></label><label className="casa-label"><span>Session ends</span><input className="casa-field" type="date" name="endsOn" required/></label>{[1,2,3].map((term) => <div key={term} className="grid gap-3 border border-black/15 p-3 sm:col-span-2 sm:grid-cols-3"><label className="casa-label"><span>Term {term} name</span><input className="casa-field" name={`term${term}Name`} defaultValue={`${term === 1 ? "First" : term === 2 ? "Second" : "Third"} Term`} required/></label><label className="casa-label"><span>Starts</span><input className="casa-field" type="date" name={`term${term}Start`} required/></label><label className="casa-label"><span>Ends</span><input className="casa-field" type="date" name={`term${term}End`} required/></label></div>)}</div><button disabled={busy} className="casa-button-primary mt-5">Create academic session</button></form>
        <form onSubmit={createArm} className="border border-black bg-white p-5"><p className="casa-kicker text-black/40">Class structure</p><h2 className="mt-2 text-2xl font-semibold">Add a class arm</h2><p className="mt-2 text-xs leading-5 text-black/45">Example: Section = Primary, Level = Primary 1, Arm = A. Every class arm belongs to exactly one campus.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="casa-label"><span>Section</span><input className="casa-field" name="sectionName" placeholder="Primary" required/></label><label className="casa-label"><span>Class level</span><input className="casa-field" name="levelName" placeholder="Primary 1" required/></label><label className="casa-label"><span>Level code</span><input className="casa-field" name="levelCode" placeholder="PRI1"/></label><label className="casa-label"><span>Arm</span><input className="casa-field" name="armName" placeholder="A" required/></label><label className="casa-label"><span>Arm code</span><input className="casa-field" name="armCode" placeholder="A"/></label><label className="casa-label"><span>Campus</span><select className="casa-field" name="branchId" required defaultValue=""><option value="" disabled>Select campus</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_headquarters ? " · HQ" : ""}</option>)}</select></label></div><button disabled={busy || data.branches.length === 0} className="casa-button-primary mt-5">Create class arm</button></form>
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2"><div className="border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Sessions</p><h2 className="mt-2 text-2xl font-semibold">Academic calendar structure</h2></div>{data.sessions.length === 0 ? <p className="p-5 text-sm text-black/45">No academic session has been configured yet.</p> : data.sessions.map((session) => <div key={session.id} className="border-b border-black/15 p-5 last:border-b-0"><div className="flex items-center justify-between gap-4"><p className="font-semibold">{session.name}</p><span className="font-mono text-[9px] uppercase">{session.status}</span></div><p className="mt-1 text-xs text-black/45">{session.starts_on} → {session.ends_on}</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{data.terms.filter((term) => term.academic_session_id === session.id).map((term) => <div key={term.id} className="border border-black/15 p-3"><p className="text-sm font-medium">{term.name}</p><p className="mt-1 text-[10px] text-black/45">{term.starts_on} → {term.ends_on}</p></div>)}</div></div>)}</div>
      <div className="border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Classes</p><h2 className="mt-2 text-2xl font-semibold">Class arms & campuses</h2></div>{data.classArms.length === 0 ? <p className="p-5 text-sm text-black/45">No class arms have been configured yet.</p> : data.classArms.map((arm) => <div key={arm.arm_id} className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 sm:grid-cols-[1fr_220px] sm:items-center"><div><p className="font-semibold">{arm.level_name} · {arm.arm_name}</p><p className="mt-1 text-xs text-black/45">{arm.section_name ?? "No section"}</p></div><select disabled={busy} className="casa-field" value={arm.branch_id ?? ""} onChange={(event) => void assign(arm.arm_id, event.target.value)}><option value="" disabled>Assign campus</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_headquarters ? " · HQ" : ""}</option>)}</select></div>)}</div></section>
    </div>
  </main>;
}
