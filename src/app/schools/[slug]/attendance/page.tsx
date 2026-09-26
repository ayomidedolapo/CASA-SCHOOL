import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

import AttendanceClient from "./attendance-client";

interface AttendancePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function AttendancePage(
  {
    params,
  }: AttendancePageProps,
) {
  const { slug } = await params;

  let visibility:
    Awaited<ReturnType<typeof listVisibleBranches>>;

  try {
    visibility =
      await listVisibleBranches(slug);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      const next =
        `/schools/${encodeURIComponent(slug)}/attendance`;
      redirect(
        `/login?school=${encodeURIComponent(slug)}&next=${encodeURIComponent(next)}`,
      );
    }
    throw error;
  }

  const isTechnician =
    visibility.access.roles.includes(
      "SCHOOL_TECHNICIAN",
    );
  const canManage =
    visibility.organizationAdmin ||
    (!isTechnician && visibility.branches.length > 0);
  const canManageLifecycle =
    visibility.access.roles.includes(
      "OWNER",
    ) ||
    visibility.access.roles.includes(
      "ADMIN",
    );
  const canManageSessions =
    visibility.branches.length > 0 &&
    (
      canManage ||
      isTechnician
    );
  // Ordinary attendance is always campus-bound. HQ operates HQ only;
  // a Branch Admin and School Technician operate only their assigned campus.
  const canViewOrganization = false;
  const canSuperviseAttendance =
    canManageSessions;

  if (
    !canViewOrganization &&
    visibility.branches.length === 0
  ) {
    throw new SchoolAccessDeniedError();
  }

  return (
    <>
      {canManage ? (
        <div className="border-b border-black bg-[#f2f2ef] px-5 py-3 sm:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">
              School setup & attendance
            </p>
            <nav className="flex flex-wrap gap-3 text-xs">
              <Link
                className="border-b border-black"
                href={`/schools/${encodeURIComponent(slug)}/academic`}
              >
                Academic setup
              </Link>
              <Link
                className="border-b border-black"
                href={`/schools/${encodeURIComponent(slug)}/calendar`}
              >
                Calendar & holidays
              </Link>
              <Link
                className="border-b border-black"
                href={`/schools/${encodeURIComponent(slug)}/audit`}
              >
                Audit trail
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <AttendanceClient
        slug={slug}
        schoolName={
          visibility.access.school.name
        }
        canManage={canManage}
        canManageSessions={
          canManageSessions
        }
        canManageLifecycle={
          canManageLifecycle
        }
        canViewOrganization={
          canViewOrganization
        }
        canSuperviseAttendance={
          canSuperviseAttendance
        }
        branches={
          visibility.branches.map(
            (branch) => ({
              id: String(
                (branch as { id: unknown }).id,
              ),
              name: String(
                (branch as { name: unknown }).name,
              ),
              code: String(
                (branch as { code: unknown }).code,
              ),
              isHeadquarters: Boolean(
                (branch as { is_headquarters?: unknown })
                  .is_headquarters,
              ),
            }),
          )
        }
      />
    </>
  );
}
