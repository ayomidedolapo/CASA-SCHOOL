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
    visibility.organizationAdmin;
  const canViewOrganization =
    visibility.organizationAdmin ||
    isTechnician;
  const canSuperviseAttendance =
    visibility.organizationAdmin ||
    visibility.branches.length > 0;

  if (
    !canViewOrganization &&
    visibility.branches.length === 0
  ) {
    throw new SchoolAccessDeniedError();
  }

  return (
    <AttendanceClient
      slug={slug}
      schoolName={
        visibility.access.school.name
      }
      canManage={canManage}
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
  );
}
