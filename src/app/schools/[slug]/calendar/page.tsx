import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import CalendarClient from "./calendar-client";

async function requireCalendarAccess(slug: string) {
  try {
    return await requireSchoolRole(slug, ["OWNER", "ADMIN"]);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirect(`/login?school=${encodeURIComponent(slug)}`);
    }

    if (error instanceof SchoolAccessDeniedError) {
      redirect(`/schools/${encodeURIComponent(slug)}/registry`);
    }

    throw error;
  }
}

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireCalendarAccess(slug);

  return <CalendarClient slug={slug} schoolName={access.school.name} />;
}
