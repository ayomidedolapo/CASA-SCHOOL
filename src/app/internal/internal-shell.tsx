import Link from "next/link";
import type { ReactNode } from "react";
import InternalLogoutButton from "./logout-button";

const baseNav = [
  ["/internal", "Overview", "overview"],
  ["/internal/schools", "Schools", "schools"],
  ["/internal/operations", "Operations", "operations"],
  ["/internal/notifications", "Notifications", "notifications"],
  ["/security/passkeys", "Security", "security"],
] as const;
const superNav = [
  ["/internal/templates", "Card Templates", "templates"],
  ["/internal/finance", "Finance", "finance"],
  ["/internal/health", "System Health", "health"],
  ["/internal/audit", "Audit", "audit"],
  ["/internal/team", "CASA Team", "team"],
] as const;
type Active = "overview" | "schools" | "operations" | "notifications" | "security" | "templates" | "finance" | "health" | "audit" | "team";

export default function InternalShell({actorName,role,active,children}:{actorName:string;role:string;active:Active;children:ReactNode}) {
  const nav = role === "CASA_SUPER_ADMIN" ? [...baseNav, ...superNav] : baseNav;
  return <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]"><div className="mx-auto grid min-h-screen w-full max-w-[1800px] lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="flex flex-col border-b border-black/15 bg-black px-5 py-6 text-white lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:px-6 lg:py-7"><div><Link href="/internal" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">CASA</Link><p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Platform control</p></div><nav className="mt-8 grid gap-1 sm:grid-cols-4 lg:grid-cols-1">{nav.map(([href,label,key])=><Link key={key} href={href} className={`border px-4 py-3 text-sm transition ${active===key?"border-white bg-white text-black":"border-white/15 text-white/70 hover:border-white/45 hover:text-white"}`}>{label}</Link>)}</nav><div className="mt-8 border-t border-white/15 pt-5 lg:mt-auto"><p className="truncate text-sm font-semibold">{actorName}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">{role.replaceAll("_"," ")}</p><InternalLogoutButton/></div></aside><section className="min-w-0">{children}</section></div></main>;
}
