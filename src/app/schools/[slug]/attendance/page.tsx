import {
  requireSchoolRole,
} from "@/server/auth/authorization";

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
  const {
    slug,
  } =
    await params;

  const access =
    await requireSchoolRole(
      slug,
      [
        "OWNER",
        "ADMIN",
        "SCHOOL_TECHNICIAN",
      ],
    );

  const canManage =
    access.roles.some(
      (role) =>
        role ===
          "OWNER" ||
        role ===
          "ADMIN",
    );

  return (
    <AttendanceClient
      slug={
        slug
      }
      schoolName={
        access.school.name
      }
      canManage={
        canManage
      }
    />
  );
}