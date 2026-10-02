import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import NotificationBrandingClient from "./notification-branding-client";

export default async function NotificationBrandingPage({
  params,
}: {
  params:
    Promise<{
      slug: string;
    }>;
}) {
  const {
    slug,
  } =
    await params;

  let access:
    Awaited<
      ReturnType<
        typeof requireSchoolRole
      >
    >;

  try {
    access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
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

  return (
    <NotificationBrandingClient
      slug={
        access.school.slug
      }
      schoolName={
        access.school.name
      }
    />
  );
}
