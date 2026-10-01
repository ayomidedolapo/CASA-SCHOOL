import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import TransfersClient from "./transfers-client";

export default async function TransfersPage({
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
      <TransfersClient
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
