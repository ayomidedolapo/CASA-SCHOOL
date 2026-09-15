import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import { RegistryClient } from "./registry-client";

interface RegistryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function RegistryPage({
  params,
}: RegistryPageProps) {
  const { slug } =
    await params;

  let access;

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
      return (
        <main className="casa-shell">
          <div className="casa-container min-h-screen border-x border-black p-6 sm:p-10 lg:p-12">
            <p className="casa-kicker">
              CASA / Registry
            </p>
            <h1 className="casa-display-compact mt-5 max-w-4xl">
              Registry access denied.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-black/55">
              Your current school membership was not authorized for Registry operations. Owner, Admin and School Technician roles are permitted. Creating the basic student record does not require an academic session or class first; those are only required when the student is enrolled.
            </p>
          </div>
        </main>
      );
    }

    throw error;
  }

  return (
    <RegistryClient
      school={{
        slug:
          access.school.slug,
        name:
          access.school.name,
      }}
      user={{
        fullName:
          access.session.fullName,
      }}
      roles={
        access.roles
      }
    />
  );
}
