import {
  redirect,
} from "next/navigation";

import Link from "next/link";

import {
  AuthRequiredError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import TechnicianAttendanceClient from "./technician-attendance-client";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function TechnicianAttendancePage({
  params,
}: PageProps) {
  const { slug } = await params;
  let access: Awaited<ReturnType<typeof requireSchoolRole>>;

  try {
    access =
      await requireSchoolRole(
      slug,
      [
        "OWNER",
        "ADMIN",
        "SCHOOL_TECHNICIAN",
      ],
      );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      const next =
        `/schools/${encodeURIComponent(slug)}/technician/attendance`;
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
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">Technical / attendance</p>
            </div>
            <p className="casa-kicker mt-14 text-black/40">Operator view</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.065em] sm:text-7xl">TODAY.</h1>
          </section>

          <section className="flex flex-col justify-between bg-white px-6 py-6 lg:px-12 lg:py-9">
            <div className="flex items-center justify-between gap-5">
              <p className="casa-kicker text-black/40">CASA / Technical</p>
              <Link
                className="font-mono text-[9px] uppercase tracking-[0.1em] underline underline-offset-4"
                href={`/schools/${encodeURIComponent(slug)}/technician`}
              >
                Back to technical
              </Link>
            </div>
            <div className="mt-12">
              <h2 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Attendance status without administrative clutter.
              </h2>
              <p className="mt-4 text-sm text-black/50">{access.school.name}</p>
            </div>
          </section>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1700px] bg-white">
        <TechnicianAttendanceClient
        slug={slug}
        canManageLifecycle={
          access.roles.some(
            (role) =>
              role === "OWNER" ||
              role === "ADMIN",
          )
        }
      />
      </div>
    </main>
  );
}
