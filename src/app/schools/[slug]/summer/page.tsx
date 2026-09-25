import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

import SummerClient from "./summer-client";

export default async function SummerPage(
  {
    params,
  }: {
    params:
      Promise<{
        slug:
          string;
      }>;
  },
) {
  const {
    slug,
  } =
    await params;

  try {
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
      redirect(
        `/schools/${encodeURIComponent(
          slug,
        )}/registry`,
      );
    }

    throw error;
  }

  const visible =
    await listVisibleBranches(
      slug,
    );

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Summer Programme
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              Summer attendance
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-black/50">
              School Admins and School Technicians register Summer participants and mark Summer attendance. Summer does not depend on the normal class teacher.
            </p>
          </div>
          <nav className="flex gap-3">
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/attendance`}
            >
              Attendance
            </Link>
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/registry`}
            >
              Registry
            </Link>
          </nav>
        </div>
      </header>
      <SummerClient
        slug={
          slug
        }
        branches={
          (
            visible.branches as
              Array<{
                id:
                  string;
                name:
                  string;
                is_headquarters?:
                  boolean;
              }>
          ).map(
            (
              branch,
            ) => ({
              id:
                branch.id,
              name:
                branch.name,
              isHeadquarters:
                Boolean(
                  branch.is_headquarters,
                ),
            }),
          )
        }
      />
    </main>
  );
}
