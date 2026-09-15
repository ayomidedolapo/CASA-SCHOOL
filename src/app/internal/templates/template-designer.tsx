"use client";

import { ChangeEvent, MouseEvent, PointerEvent as ReactPointerEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CasaConfirmDialog } from "@/components/casa-confirm-dialog";

type Side = "FRONT" | "BACK";
type DynamicSource = "STUDENT_NAME" | "SCHOOL_NAME" | "SEX";
type DynamicField = { id: string; kind: "DYNAMIC"; source: DynamicSource; side: Side; x: number; y: number; fontSize: number; color: string; weight: "400" | "600" | "700" | "800" | "900" };
type StaticField = { id: string; kind: "STATIC_TEXT"; text: string; side: Side; x: number; y: number; fontSize: number; color: string; weight: "400" | "600" | "700" | "800" | "900" };
type ImageField = { id: string; kind: "IMAGE"; name: string; side: Side; x: number; y: number; width: number; height: number; file: File; url: string };
type QrField = { id: "QR"; kind: "QR"; side: Side; x: number; y: number; size: number };
type DesignField = DynamicField | StaticField | ImageField | QrField;
type SavedTemplate = { id: string; school_id: string; school_name: string; version_label: string; status: string; layout: unknown; created_at: string; updated_at: string; activated_at: string | null; version_count: number };
type LayoutText = { source?: DynamicSource; x?: number; y?: number; fontSize?: number; color?: string; weight?: "400" | "600" | "700" | "800" | "900" };
type LayoutPreview = { qr?: { side?: Side; x?: number; y?: number; size?: number }; frontText?: LayoutText[]; backText?: LayoutText[] };

const sample: Record<DynamicSource, string> = { STUDENT_NAME: "Dolapo Ayomide", SCHOOL_NAME: "Sample School", SEX: "M" };
const makeId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const defaults = (): DesignField[] => [
  { id: "student-name", kind: "DYNAMIC", source: "STUDENT_NAME", side: "FRONT", x: 0.08, y: 0.46, fontSize: 0.07, color: "#000000", weight: "700" },
  { id: "school-name", kind: "DYNAMIC", source: "SCHOOL_NAME", side: "FRONT", x: 0.28, y: 0.62, fontSize: 0.03, color: "#000000", weight: "400" },
  { id: "sex", kind: "DYNAMIC", source: "SEX", side: "FRONT", x: 0.86, y: 0.62, fontSize: 0.03, color: "#000000", weight: "400" },
  { id: "QR", kind: "QR", side: "BACK", x: 0.65, y: 0.52, size: 0.28 },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read an image used in this design."));
    image.src = url;
  });
}

async function flattenStaticArtwork(baseFile: File, side: Side, fields: DesignField[]): Promise<File> {
  const baseUrl = URL.createObjectURL(baseFile);
  try {
    const base = await loadImage(baseUrl);
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth || base.width;
    canvas.height = base.naturalHeight || base.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the card artwork.");
    context.drawImage(base, 0, 0, canvas.width, canvas.height);

    for (const field of fields.filter((entry) => entry.side === side)) {
      if (field.kind === "IMAGE") {
        const image = await loadImage(field.url);
        context.drawImage(image, Math.round(field.x * canvas.width), Math.round(field.y * canvas.height), Math.round(field.width * canvas.width), Math.round(field.height * canvas.height));
      }
      if (field.kind === "STATIC_TEXT") {
        context.save();
        context.fillStyle = field.color;
        context.font = `${field.weight} ${Math.max(8, Math.round(field.fontSize * canvas.width))}px Arial, Helvetica, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(field.text, Math.round(field.x * canvas.width), Math.round(field.y * canvas.height));
        context.restore();
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to prepare the flattened card artwork.")), "image/png"));
    return new File([blob], `${side.toLowerCase()}-card-template.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(baseUrl);
  }
}

export default function TemplateDesigner({ schools, templates }: { schools: Array<{ id: string; name: string }>; templates: SavedTemplate[] }) {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [version, setVersion] = useState("V1");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [fields, setFields] = useState<DesignField[]>(defaults);
  const [selectedId, setSelectedId] = useState("student-name");
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateStatus, setEditingTemplateStatus] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<SavedTemplate | null>(null);
  const frontUrl = useMemo(() => front ? URL.createObjectURL(front) : "", [front]);
  const backUrl = useMemo(() => back ? URL.createObjectURL(back) : "", [back]);
  const selected = fields.find((field) => field.id === selectedId) ?? null;
  const selectedSchool = schools.find((school) => school.id === schoolId) ?? null;

  function resetForSchool(nextSchoolId: string) {
    setSchoolId(nextSchoolId);
    setFront(null);
    setBack(null);
    setFields(defaults());
    setSelectedId("student-name");
    setVersion("V1");
    setEditingTemplateId(null);
    setEditingTemplateStatus(null);
    setError("");
    setNotice("");
  }

  function updateField(id: string, patch: Record<string, unknown>) {
    setFields((current) => current.map((field) => field.id === id ? ({ ...field, ...patch } as DesignField) : field));
  }

  function place(side: Side, event: MouseEvent<HTMLDivElement>) {
    if (!selected) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width));
    const clickY = Math.max(0, Math.min(1, (event.clientY - rectangle.top) / rectangle.height));
    if (selected.kind === "IMAGE") updateField(selected.id, { side, x: Math.max(0, Math.min(1 - selected.width, clickX - selected.width / 2)), y: Math.max(0, Math.min(1 - selected.height, clickY - selected.height / 2)) });
    else if (selected.kind === "QR") updateField(selected.id, { side, x: Math.max(0, Math.min(1 - selected.size, clickX - selected.size / 2)), y: Math.max(0, Math.min(1 - selected.size, clickY - selected.size / 2)) });
    else updateField(selected.id, { side, x: clickX, y: clickY });
  }

  function moveWithPointer(side: Side, event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingId) return;
    const field = fields.find((entry) => entry.id === draggingId);
    if (!field) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const pointerX = Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width));
    const pointerY = Math.max(0, Math.min(1, (event.clientY - rectangle.top) / rectangle.height));
    if (field.kind === "IMAGE") updateField(field.id, { side, x: Math.max(0, Math.min(1 - field.width, pointerX - field.width / 2)), y: Math.max(0, Math.min(1 - field.height, pointerY - field.height / 2)) });
    else if (field.kind === "QR") updateField(field.id, { side, x: Math.max(0, Math.min(1 - field.size, pointerX - field.size / 2)), y: Math.max(0, Math.min(1 - field.size, pointerY - field.size / 2)) });
    else updateField(field.id, { side, x: pointerX, y: pointerY });
  }

  function beginDrag(id: string, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault(); event.stopPropagation(); setSelectedId(id); setDraggingId(id);
  }

  async function editSaved(template: SavedTemplate) {
    setBusy(true); setError(""); setNotice("");
    try {
      const [frontResponse, backResponse] = await Promise.all([fetch(`/api/internal/operations/templates/${encodeURIComponent(template.id)}/preview?side=FRONT`, { cache: "no-store" }), fetch(`/api/internal/operations/templates/${encodeURIComponent(template.id)}/preview?side=BACK`, { cache: "no-store" })]);
      if (!frontResponse.ok || !backResponse.ok) throw new Error("CASA could not load the saved card artwork for editing.");
      const [frontBlob, backBlob] = await Promise.all([frontResponse.blob(), backResponse.blob()]);
      const layout = (template.layout ?? {}) as LayoutPreview;
      const dynamic: DynamicField[] = [];
      for (const [side, items] of [["FRONT", layout.frontText ?? []], ["BACK", layout.backText ?? []]] as const) {
        for (const item of items) if (item.source) dynamic.push({ id: makeId(), kind: "DYNAMIC", source: item.source, side, x: Number(item.x ?? 0.5), y: Number(item.y ?? 0.5), fontSize: Number(item.fontSize ?? (item.source === "STUDENT_NAME" ? 0.07 : 0.03)), color: item.color ?? "#000000", weight: item.weight ?? (item.source === "STUDENT_NAME" ? "700" : "400") });
      }
      const qr: QrField = { id: "QR", kind: "QR", side: layout.qr?.side ?? "BACK", x: Number(layout.qr?.x ?? 0.65), y: Number(layout.qr?.y ?? 0.52), size: Number(layout.qr?.size ?? 0.28) };
      setSchoolId(template.school_id); setFront(new File([frontBlob], `${template.version_label}-front.png`, { type: frontBlob.type || "image/png" })); setBack(new File([backBlob], `${template.version_label}-back.png`, { type: backBlob.type || "image/png" })); setFields([...dynamic, qr]); setSelectedId(dynamic[0]?.id ?? "QR"); setVersion(template.version_label); setEditingTemplateId(template.id); setEditingTemplateStatus(template.status);
      setNotice("Editing the current school design. Saving makes the edited design current. Older published versions stay in production history but remain hidden from the normal gallery. Static text and logos from the saved version are baked into its artwork; replace the base artwork if those need changing.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Saved template could not be loaded."); } finally { setBusy(false); }
  }

  async function deleteDraft(template: SavedTemplate) {
    if (template.status !== "DRAFT") return;
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch(`/api/internal/operations/templates/${encodeURIComponent(template.id)}`, { method: "DELETE" }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Template could not be deleted."); setNotice("Unused draft deleted."); setDraftToDelete(null); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Template could not be deleted."); } finally { setBusy(false); }
  }

  function addDynamic(source: DynamicSource) {
    const field: DynamicField = { id: makeId(), kind: "DYNAMIC", source, side: "FRONT", x: 0.5, y: 0.5, fontSize: source === "STUDENT_NAME" ? 0.07 : 0.03, color: "#000000", weight: source === "STUDENT_NAME" ? "700" : "400" };
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function addStaticText() {
    const field: StaticField = { id: makeId(), kind: "STATIC_TEXT", text: "Static text", side: "BACK", x: 0.5, y: 0.5, fontSize: 0.03, color: "#000000", weight: "600" };
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const field: ImageField = { id: makeId(), kind: "IMAGE", name: file.name, side: "BACK", x: 0.36, y: 0.28, width: 0.28, height: 0.28, file, url: URL.createObjectURL(file) };
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function removeSelected() {
    if (!selected || selected.kind === "QR") return;
    setFields((current) => current.filter((field) => field.id !== selected.id));
    setSelectedId("QR");
  }

  function overlay(side: Side) {
    return fields.filter((field) => field.side === side).map((field) => {
      const active = field.id === selectedId ? "ring-2 ring-black" : "";
      if (field.kind === "QR") return <div key={field.id} onPointerDown={(event) => beginDrag(field.id, event)} className={`absolute cursor-grab touch-none grid place-items-center border-2 border-black bg-white text-[9px] font-bold ${active}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.size * 100}%`, aspectRatio: "1 / 1" }}>QR</div>;
      if (field.kind === "IMAGE") return <img key={field.id} src={field.url} alt={field.name} onPointerDown={(event) => beginDrag(field.id, event)} className={`absolute cursor-grab touch-none object-contain ${active}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }} />;
      const value = field.kind === "STATIC_TEXT" ? field.text : sample[field.source];
      return <span key={field.id} onPointerDown={(event) => beginDrag(field.id, event)} className={`absolute cursor-grab touch-none -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1 ${active}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, color: field.color, fontWeight: Number(field.weight), fontSize: `${Math.max(8, field.fontSize * 300)}px` }}>{value}</span>;
    });
  }

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/internal/operations/templates/assets", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Template upload failed.");
    return String(body.key);
  }

  function nextRevisionLabel(base: string) {
    const cleaned = base.trim().slice(0, 52) || "CURRENT";
    const revision = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return `${cleaned}-R${revision}`.slice(0, 80);
  }

  async function save() {
    if (!schoolId || !front || !back) {
      setError("Choose a school and upload both card sides.");
      return;
    }
    const qr = fields.find((field): field is QrField => field.kind === "QR");
    if (!qr) {
      setError("The physical card must retain its QR field.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const [flatFront, flatBack] = await Promise.all([flattenStaticArtwork(front, "FRONT", fields), flattenStaticArtwork(back, "BACK", fields)]);
      const [frontSourceKey, backSourceKey] = await Promise.all([upload(flatFront), upload(flatBack)]);
      const dynamic = fields.filter((field): field is DynamicField => field.kind === "DYNAMIC");
      const toLayout = (field: DynamicField) => ({ source: field.source, x: field.x, y: field.y, fontSize: field.fontSize, color: field.color, align: "CENTER" as const, weight: field.weight, maxWidth: 0.8, maxLines: field.source === "SEX" ? 1 : 2, minFontSize: 0.018 });
      const layout = { qr: { side: qr.side, x: qr.x, y: qr.y, size: qr.size }, frontText: dynamic.filter((field) => field.side === "FRONT").map(toLayout), backText: dynamic.filter((field) => field.side === "BACK").map(toLayout) };
      const updateDraft = Boolean(editingTemplateId && editingTemplateStatus === "DRAFT");
      const versionLabel = editingTemplateId && editingTemplateStatus === "ACTIVE" ? nextRevisionLabel(version) : version.trim();
      if (!versionLabel) throw new Error("Enter a template version.");
      const endpoint = updateDraft ? `/api/internal/operations/templates/${encodeURIComponent(editingTemplateId!)}` : "/api/internal/operations/templates";
      const response = await fetch(endpoint, { method: updateDraft ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId, versionLabel, frontSourceKey, backSourceKey, layout, activate: true }) });
      const body = await response.json().catch(() => ({})) as { message?: string; template?: { id?: string; versionLabel?: string; status?: string } };
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Template save failed.");
      setEditingTemplateId(body.template?.id ?? editingTemplateId);
      setEditingTemplateStatus("ACTIVE");
      setNotice("Template changes saved and activated. The gallery keeps one current card per school; older published revisions remain in history only.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Card template setup failed.");
    } finally {
      setBusy(false);
    }
  }

  function galleryOverlay(template: SavedTemplate, side: Side) {
    const layout = (template.layout ?? {}) as LayoutPreview;
    const items = side === "FRONT" ? layout.frontText ?? [] : layout.backText ?? [];
    return <>{items.map((item, index) => item.source ? <span key={`${item.source}-${index}`} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white/70 px-1 text-[7px] font-bold" style={{ left: `${Number(item.x ?? 0.5) * 100}%`, top: `${Number(item.y ?? 0.5) * 100}%` }}>{sample[item.source]}</span> : null)}{layout.qr?.side === side && <div className="absolute grid place-items-center border border-black bg-white text-[6px] font-bold" style={{ left: `${Number(layout.qr.x ?? 0) * 100}%`, top: `${Number(layout.qr.y ?? 0) * 100}%`, width: `${Number(layout.qr.size ?? 0.2) * 100}%`, aspectRatio: "1 / 1" }}>QR</div>}</>;
  }

  return <div className="px-5 py-6 sm:px-8 lg:px-10">
    <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="border border-black bg-white p-5">
        <label className="casa-label"><span>School</span><select className="casa-field" value={schoolId} onChange={(event) => resetForSchool(event.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
        <p className="mt-2 text-[11px] leading-5 text-black/45">Changing school clears the working artwork and overlays so one school&apos;s logo/design cannot accidentally carry into another.</p>
        <label className="casa-label mt-4"><span>Template version</span><input className="casa-field" value={version} onChange={(event) => setVersion(event.target.value)} /></label>
        <label className="casa-label mt-4"><span>Front base artwork</span><input className="casa-field" type="file" accept="image/*" onChange={(event) => setFront(event.target.files?.[0] ?? null)} /></label>
        <label className="casa-label mt-4"><span>Back base artwork</span><input className="casa-field" type="file" accept="image/*" onChange={(event) => setBack(event.target.files?.[0] ?? null)} /></label>

        <div className="mt-6 border-t border-black/15 pt-5">
          <p className="casa-kicker text-black/40">Add field</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["STUDENT_NAME", "SCHOOL_NAME", "SEX"] as DynamicSource[]).map((source) => <button type="button" key={source} onClick={() => addDynamic(source)} className="border border-black/20 px-2 py-2 text-left text-[10px]">+ {source.replaceAll("_", " ")}</button>)}
            <button type="button" onClick={addStaticText} className="border border-black/20 px-2 py-2 text-left text-[10px]">+ STATIC TEXT</button>
            <label className="cursor-pointer border border-black/20 px-2 py-2 text-left text-[10px]">+ IMAGE / LOGO<input type="file" accept="image/*" onChange={addImage} className="hidden" /></label>
            <button type="button" onClick={() => setSelectedId("QR")} className="border border-black/20 px-2 py-2 text-left text-[10px]">QR FIELD</button>
          </div>
        </div>

        <div className="mt-5 max-h-52 space-y-2 overflow-auto border-t border-black/15 pt-5">
          {fields.map((field) => <button type="button" key={field.id} onClick={() => setSelectedId(field.id)} className={`w-full border px-3 py-2 text-left text-xs ${selectedId === field.id ? "border-black bg-black text-white" : "border-black/15"}`}>{field.kind === "DYNAMIC" ? field.source.replaceAll("_", " ") : field.kind === "STATIC_TEXT" ? `TEXT · ${field.text}` : field.kind === "IMAGE" ? `IMAGE · ${field.name}` : "QR"} · {field.side}</button>)}
        </div>

        {selected && <div className="mt-5 border-t border-black/15 pt-5">
          <p className="casa-kicker text-black/40">Selected field</p>
          {selected.kind === "STATIC_TEXT" && <label className="casa-label mt-3"><span>Text</span><input className="casa-field" value={selected.text} onChange={(event) => updateField(selected.id, { text: event.target.value })} /></label>}
          {(selected.kind === "STATIC_TEXT" || selected.kind === "DYNAMIC") && <><label className="casa-label mt-3"><span>Text size</span><input className="casa-field" type="range" min="0.015" max="0.12" step="0.005" value={selected.fontSize} onChange={(event) => updateField(selected.id, { fontSize: Number(event.target.value) })} /></label><label className="casa-label mt-3"><span>Text color</span><input className="casa-field h-11" type="color" value={selected.color} onChange={(event) => updateField(selected.id, { color: event.target.value })} /></label></>}
          {selected.kind === "IMAGE" && <><label className="casa-label mt-3"><span>Width</span><input className="casa-field" type="range" min="0.05" max="0.8" step="0.01" value={selected.width} onChange={(event) => updateField(selected.id, { width: Number(event.target.value) })} /></label><label className="casa-label mt-3"><span>Height</span><input className="casa-field" type="range" min="0.05" max="0.8" step="0.01" value={selected.height} onChange={(event) => updateField(selected.id, { height: Number(event.target.value) })} /></label></>}
          {selected.kind === "QR" && <label className="casa-label mt-3"><span>QR size</span><input className="casa-field" type="range" min="0.08" max="0.5" step="0.01" value={selected.size} onChange={(event) => updateField(selected.id, { size: Number(event.target.value) })} /></label>}
          {selected.kind !== "QR" && <button type="button" onClick={removeSelected} className="mt-3 text-xs underline">Remove selected field</button>}
          <p className="mt-3 text-xs leading-5 text-black/45">Drag the selected field directly on the FRONT or BACK preview. You can still click a position for precise placement.</p>
        </div>}

        {notice && <p className="mt-4 border-l-2 border-[#176b45] bg-[#e8f2ec] px-3 py-2 text-sm text-[#145a3b]">{notice}</p>}{error && <p className="mt-4 text-sm text-[#7e1d18]">{error}</p>}
        <button type="button" onClick={() => void save()} disabled={busy} className="casa-button-primary mt-5 w-full">{busy ? "Saving…" : `Save changes for ${selectedSchool?.name ?? "school"}`}</button>
      </aside>

      <div className="grid gap-5 xl:grid-cols-2">
        {(["FRONT", "BACK"] as Side[]).map((side) => {
          const url = side === "FRONT" ? frontUrl : backUrl;
          return <div key={side}><p className="casa-kicker mb-2 text-black/40">{side} · {selectedSchool?.name ?? "No school"}</p><div onClick={(event) => place(side, event)} onPointerMove={(event) => moveWithPointer(side, event)} onPointerUp={()=>setDraggingId(null)} onPointerCancel={()=>setDraggingId(null)} onPointerLeave={()=>setDraggingId(null)} className="relative aspect-[1.586/1] cursor-crosshair touch-none overflow-hidden border border-black bg-white">{url ? <img src={url} alt={`${side} card artwork`} className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-sm text-black/35">Upload {side.toLowerCase()} artwork</div>}{overlay(side)}</div></div>;
        })}
      </div>
    </section>

    <section className="mt-10 border-t border-black pt-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="casa-kicker text-black/40">Current template gallery</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">One visible card per school.</h2></div><p className="max-w-xl text-sm leading-6 text-black/45">Editing a published design updates the school&apos;s current visible card. CASA keeps older versions only as hidden production history so the gallery stays clean.</p></div>
      {templates.length === 0 ? <p className="mt-6 border border-black bg-white p-7 text-sm text-black/45">No saved card template yet.</p> : <div className="mt-6 grid gap-5 xl:grid-cols-2">{templates.map((template) => <article key={template.id} className="border border-black bg-white"><div className="flex items-start justify-between gap-4 border-b border-black/15 p-4"><div><p className="font-semibold">{template.school_name}</p><p className="mt-1 text-sm text-black/45">Current design{template.version_count > 1 ? ` · ${template.version_count} versions preserved` : ""}</p></div><span className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] ${template.status === "ACTIVE" ? "border-black bg-black text-white" : "border-black/20"}`}>{template.status}</span></div><div className="grid gap-3 p-4 sm:grid-cols-2">{(["FRONT", "BACK"] as Side[]).map((side) => <div key={side}><p className="mb-1 font-mono text-[8px] uppercase tracking-[0.08em] text-black/35">{side}</p><div className="relative aspect-[1.586/1] overflow-hidden border border-black/20 bg-black/[0.02]"><img src={`/api/internal/operations/templates/${encodeURIComponent(template.id)}/preview?side=${side}`} alt={`${template.school_name} ${side.toLowerCase()} template`} className="h-full w-full object-contain" />{galleryOverlay(template, side)}</div></div>)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/15 px-4 py-3 text-xs text-black/45"><span>{template.activated_at ? `Activated ${new Date(template.activated_at).toLocaleString()}` : `Created ${new Date(template.created_at).toLocaleString()}`}</span><span className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void editSaved(template)} className="casa-button">Edit template</button>{template.status === "DRAFT" && <button type="button" disabled={busy} onClick={()=>setDraftToDelete(template)} className="border border-[#a12620] px-3 py-2 text-[#7e1d18]">Delete draft</button>}</span></div></article>)}</div>}
    </section>
    <CasaConfirmDialog
      open={draftToDelete !== null}
      title="Delete unused draft?"
      message={draftToDelete ? `Delete unused draft ${draftToDelete.version_label} for ${draftToDelete.school_name}? This is allowed only because the draft has not been used for production.` : ""}
      confirmLabel="Delete draft"
      danger
      busy={busy}
      onCancel={() => setDraftToDelete(null)}
      onConfirm={() => { if (draftToDelete) void deleteDraft(draftToDelete); }}
    />
  </div>;
}
