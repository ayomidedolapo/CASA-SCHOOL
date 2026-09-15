import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import AcademicClient from "./academic-client";

async function requireAcademicSetupAccess(slug: string) {
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

export default async function AcademicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireAcademicSetupAccess(slug);

  return <AcademicClient slug={slug} schoolName={access.school.name} />;
}
