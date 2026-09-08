import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import TechnicianClient from "./technician-client";

interface TechnicianPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function TechnicianPage(
  {
    params,
  }: TechnicianPageProps,
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
        `/schools/${encodeURIComponent(slug)}/technician`;
      redirect(
        `/login?school=${encodeURIComponent(slug)}&next=${encodeURIComponent(next)}`,
      );
    }
    throw error;
  }

  return (
    <TechnicianClient
      slug={
        slug
      }
      schoolName={
        access.school.name
      }
    />
  );
}
