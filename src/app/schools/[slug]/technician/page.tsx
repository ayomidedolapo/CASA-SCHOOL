import {
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

  const access =
    await requireSchoolRole(
      slug,
      [
        "OWNER",
        "ADMIN",
        "SCHOOL_TECHNICIAN",
      ],
    );

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