import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
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
        `/schools/${encodeURIComponent(slug)}/attendance`;
      redirect(
        `/login?school=${encodeURIComponent(slug)}&next=${encodeURIComponent(next)}`,
      );
    }
    throw error;
  }

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
