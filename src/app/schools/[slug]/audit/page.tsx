import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import {
  listSchoolAuditEvents,
} from "@/server/school-operations/audit";

export const dynamic =
  "force-dynamic";

export default async function SchoolAuditPage(
  {
    params,
  }: {
    params:
      Promise<{
        slug: string;
      }>;
  },
) {
  const {
    slug,
  } =
    await params;

  let result:
    Awaited<
      ReturnType<
        typeof listSchoolAuditEvents
      >
    >;

  try {
    result =
      await listSchoolAuditEvents({
        slug,
        limit:
          200,
      });
  } catch (error) {
    if (
      error instanceof
        AuthRequiredError
    ) {
      const next =
        `/schools/${encodeURIComponent(
          slug,
        )}/audit`;

      redirect(
        `/login?school=${encodeURIComponent(
          slug,
        )}&next=${encodeURIComponent(
          next,
        )}`,
      );
    }

    if (
      error instanceof
        SchoolAccessDeniedError
    ) {
      return (
        <main className="casa-shell min-h-screen px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-4xl border-t border-black pt-6">
            <p className="casa-kicker text-black/45">
              CASA / Audit
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
              Audit access is limited to School Admins and assigned Branch Admins.
            </h1>
          </div>
        </main>
      );
    }

    throw error;
  }

  const scopeLabel =
    result.scope
      .organizationWide
      ? "School-wide"
      : result.scope.branches
          .map(
            (branch) =>
              branch.name,
          )
          .join(", ");

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Audit
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              Who did what, and when.
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-black/50">
              Read-only operational history from CASA&apos;s authoritative structure, scanner, biometric, Attendance and progression records.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-black/45">
              Scope / {scopeLabel}
            </p>
          </div>

          <Link
            className="casa-button"
            href={`/schools/${encodeURIComponent(
              slug,
            )}/attendance`}
          >
            Attendance
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
        <div className="border-t border-black bg-white">
          {result.events.length ===
          0 ? (
            <p className="p-6 text-sm text-black/50">
              No auditable operational events are available in this scope yet.
            </p>
          ) : (
            result.events.map(
              (event) => (
                <article
                  key={
                    event.id
                  }
                  className="grid gap-3 border-b border-black/20 p-4 md:grid-cols-[180px_190px_minmax(0,1fr)]"
                >
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-black/45">
                      {new Date(
                        event.occurredAt,
                      ).toLocaleString(
                        "en-NG",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-black/50">
                      {event.branchName ??
                        "School-wide"}
                    </p>
                  </div>

                  <div>
                    <strong className="block text-sm">
                      {event.actorName}
                    </strong>
                    {event.actorEmail ? (
                      <span className="mt-1 block truncate text-xs text-black/45">
                        {event.actorEmail}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="casa-status">
                        {event.category}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-black/55">
                        {event.action.replaceAll(
                          "_",
                          " ",
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {event.subject}
                    </p>
                    {event.detail ? (
                      <p className="mt-1 text-xs leading-5 text-black/55">
                        {event.detail}
                      </p>
                    ) : null}
                  </div>
                </article>
              ),
            )
          )}
        </div>
      </section>
    </main>
  );
}
