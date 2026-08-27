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
        ["OWNER", "ADMIN"],
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
        <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950">
          <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8">
            <p className="text-sm font-medium text-slate-500">
              CASA School
            </p>
            <h1 className="mt-3 text-2xl font-semibold">
              Registry access denied
            </h1>
            <p className="mt-3 text-slate-600">
              Your current school role does not permit registry administration.
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
        slug: access.school.slug,
        name: access.school.name,
      }}
      user={{
        fullName:
          access.session.fullName,
      }}
      roles={access.roles}
    />
  );
}