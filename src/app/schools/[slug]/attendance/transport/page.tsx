import {
  redirect,
} from "next/navigation";

import Link from "next/link";

import {
  AuthRequiredError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import TransportClient from "./transport-client";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function AttendanceTransportPage({
  params,
}: PageProps) {
  const { slug } = await params;
  let access: Awaited<ReturnType<typeof requireSchoolRole>>;

  try {
    access =
      await requireSchoolRole(
      slug,
      ["OWNER", "ADMIN"],
      );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      const next =
        `/schools/${encodeURIComponent(slug)}/attendance/transport`;
      redirect(
        `/login?school=${encodeURIComponent(slug)}&next=${encodeURIComponent(next)}`,
      );
    }
    throw error;
  }

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black/15">
        <div className="mx-auto grid w-full max-w-[1700px] lg:grid-cols-[0.72fr_1.28fr]">
          <section className="border-b border-black/15 px-6 py-6 lg:border-r lg:border-b-0 lg:px-12 lg:py-9">
            <div className="flex items-center justify-between gap-5">
              <p className="casa-kicker">CASA</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">Attendance policy</p>
            </div>
            <p className="casa-kicker mt-14 text-black/40">Transport &amp; grace</p>
            <h1 className="mt-4 max-w-[11ch] text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
              POLICY, NOT GUESSWORK.
            </h1>
          </section>

          <section className="flex flex-col justify-between bg-white px-6 py-6 lg:px-12 lg:py-9">
            <div className="flex items-center justify-between gap-5">
              <p className="casa-kicker text-black/40">CASA / Attendance</p>
              <Link
                className="font-mono text-[9px] uppercase tracking-[0.1em] underline underline-offset-4"
                href={`/schools/${encodeURIComponent(slug)}/attendance`}
              >
                Back to attendance
              </Link>
            </div>
            <div className="mt-12">
              <h2 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Exact arrival grace by transport method.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-black/50">
                {access.school.name}. Configure explicit windows and effective-dated student transport assignments.
              </p>
            </div>
          </section>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1700px] bg-white">
        <TransportClient
          slug={slug}
          schoolName={access.school.name}
          schoolTimezone={access.school.timezone}
        />
      </div>
    </main>
  );
}
