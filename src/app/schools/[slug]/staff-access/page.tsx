import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import StaffAccessClient from "./staff-access-client";

interface StaffAccessPageProps {
  params:
    Promise<{
      slug:
        string;
    }>;
}

export default async function StaffAccessPage(
  {
    params,
  }:
    StaffAccessPageProps,
) {
  const {
    slug,
  } =
    await params;

  let access:
    Awaited<
      ReturnType<
        typeof requireSchoolRole
      >
    > | null =
      null;

  let accessDenied =
    false;

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
      accessDenied =
        true;
    } else {
      throw error;
    }
  }

  if (
    accessDenied ||
    !access
  ) {
    return (
      <main className="casa-shell min-h-screen px-5 py-10">
        <div className="mx-auto max-w-3xl border-t border-black pt-6">
          <p className="casa-kicker text-black/45">
            CASA / Staff & Access
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em]">
            Owner or Admin access required.
          </h1>
        </div>
      </main>
    );
  }

  return (
    <StaffAccessClient
      slug={
        access.school.slug
      }
      schoolName={
        access.school.name
      }
      canCreateAdmin={
        access.roles.includes(
          "OWNER",
        )
      }
    />
  );
}
