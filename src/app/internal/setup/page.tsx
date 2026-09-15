import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import InternalSetupClient from "./setup-client";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

export default async function InternalSetupPage() {
  const db = getDb();
  const result = await db.execute(sql`select count(*)::int as count from casa_internal_memberships where role = 'CASA_SUPER_ADMIN'`);
  if ((rowsOf<{ count: number }>(result)[0]?.count ?? 0) > 0) redirect("/internal/login");

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] px-5 py-8 text-[#0b0b0a] sm:px-8 lg:py-14">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden border border-black bg-white lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-black p-7 text-white sm:p-10 lg:p-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">CASA / First run</p>
          <h1 className="mt-10 max-w-[8ch] text-6xl font-semibold leading-[0.9] tracking-[-0.08em]">INITIAL<br />CONTROL</h1>
          <p className="mt-8 max-w-sm text-sm leading-6 text-white/55">This ceremony exists only before the first CASA Super Admin has been created. After successful setup, this route locks itself.</p>
        </section>
        <section className="p-7 sm:p-10 lg:p-12">
          <p className="casa-kicker text-black/45">One-time setup</p>
          <h2 className="mt-4 max-w-[13ch] text-4xl font-semibold tracking-[-0.06em]">Create the first trusted CASA administrator.</h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-black/50">The deployment setup key protects a fresh database from being claimed by an unauthorized visitor. It is never used for normal sign-in.</p>
          <InternalSetupClient />
          <Link href="/internal/login" className="mt-6 inline-block text-sm text-black/55 underline underline-offset-4">CASA internal sign-in</Link>
        </section>
      </div>
    </main>
  );
}
