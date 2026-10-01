import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import ProgressionClient from "./progression-client";

export default async function ProgressionPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const {
    slug,
  } = await params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );

    return (
      <ProgressionClient
        slug={slug}
        schoolName={
          access.school.name
        }
      />
    );
  } catch (error) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      redirect(
        `/login?school=${encodeURIComponent(
          slug,
        )}`,
      );
    }

    if (
      error instanceof
      SchoolAccessDeniedError
    ) {
      redirect(
        `/schools/${encodeURIComponent(
          slug,
        )}/registry`,
      );
    }

    throw error;
  }
}
