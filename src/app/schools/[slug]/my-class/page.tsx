import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import MyClassClient from "./my-class-client";

interface MyClassPageProps {
  params:
    Promise<{
      slug:
        string;
    }>;
}

export default async function MyClassPage(
  {
    params,
  }:
    MyClassPageProps,
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
          "STAFF",
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
            CASA / My Class
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em]">
            Teacher assignment required.
          </h1>
          <p className="mt-5 text-sm leading-6 text-black/55">
            Ask the school Owner or Admin to assign your Staff account to a class and academic session.
          </p>
        </div>
      </main>
    );
  }

  return (
    <MyClassClient
      slug={
        access.school.slug
      }
      schoolName={
        access.school.name
      }
      staffName={
        access.session
          .fullName
      }
    />
  );
}
