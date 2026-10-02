import {
  redirect,
} from "next/navigation";
import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  CasaInternalAccessDeniedError,
  isAuthRequiredError,
  requireCasaInternalAccess,
} from "@/server/internal/authorization";
import {
  reconcileTerminalHealthNotifications,
} from "@/server/internal/terminal-health";

import InternalShell from "../internal-shell";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export default async function ScannerHealthPage() {
  let access:
    Awaited<
      ReturnType<
        typeof requireCasaInternalAccess
      >
    >;

  try {
    access =
      await requireCasaInternalAccess();
  } catch (error) {
    if (
      isAuthRequiredError(
        error,
      )
    ) {
      redirect(
        "/internal/login",
      );
    }

    if (
      error instanceof
      CasaInternalAccessDeniedError
    ) {
      redirect(
        "/internal/login?denied=1",
      );
    }

    throw error;
  }

  await reconcileTerminalHealthNotifications();

  const terminals =
    rowsOf<{
      id: string;
      name: string;
      terminal_code: string;
      school_name: string;
      branch_name:
        string | null;
      last_seen_at:
        string |
        Date |
        null;
      connectivity:
        "ONLINE" |
        "OFFLINE";
    }>(
      await getDb().execute(sql`
        select
          terminal.id::text
            as id,
          terminal.name,
          terminal.terminal_code,
          school.name
            as school_name,
          branch.name
            as branch_name,
          terminal.last_seen_at,
          case
            when
              terminal.last_seen_at is not null
              and terminal.last_seen_at >=
                now() -
                  interval '5 minutes'
              then 'ONLINE'
            else 'OFFLINE'
          end as connectivity
        from attendance_terminals terminal
        join schools school
          on school.id =
             terminal.school_id
        left join school_branch_terminals mapping
          on mapping.school_id =
             terminal.school_id
         and mapping.terminal_id =
             terminal.id
        left join school_branches branch
          on branch.school_id =
             mapping.school_id
         and branch.id =
             mapping.branch_id
        where
          terminal.status =
            'ACTIVE'::attendance_terminal_status
          and school.status =
            'ACTIVE'::school_status
          and (
            ${access.membership.role} =
              'CASA_SUPER_ADMIN'
            or exists (
              select 1
              from casa_internal_school_assignments assignment
              where
                assignment.membership_id =
                  ${access.membership.id}::uuid
                and assignment.school_id =
                  terminal.school_id
                and assignment.status =
                  'ACTIVE'
            )
          )
        order by
          case
            when
              terminal.last_seen_at is null
              or terminal.last_seen_at <
                now() -
                  interval '5 minutes'
              then 0
            else 1
          end,
          school.name,
          branch.name nulls last,
          terminal.name
      `),
    );

  const offline =
    terminals.filter(
      (
        terminal,
      ) =>
        terminal.connectivity ===
        "OFFLINE",
    ).length;
  const online =
    terminals.length -
    offline;
  const scope =
    access.membership.role ===
      "CASA_SUPER_ADMIN"
      ? "all active schools"
      : "your assigned schools";

  return (
    <InternalShell
      actorName={
        access.session.fullName
      }
      role={
        access.membership.role
      }
      active="operations"
    >
      <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <p className="casa-kicker text-black/45">
          CASA / Scanner health
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
          Attendance devices.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">
          Current authenticated-heartbeat state for {scope}. An ACTIVE scanner is currently offline after more than five minutes without a heartbeat.
        </p>
      </header>

      <div className="px-5 py-6 sm:px-8 lg:px-10">
        <section className="grid border border-black sm:grid-cols-3">
          {[
            [
              "Active scanners",
              terminals.length,
            ],
            [
              "Currently online",
              online,
            ],
            [
              "Currently offline",
              offline,
            ],
          ].map(
            ([
              label,
              value,
            ]) => (
              <div
                className="border-b border-r border-black/15 p-5 last:border-r-0 sm:border-b-0"
                key={
                  String(
                    label,
                  )
                }
              >
                <p className="casa-kicker text-black/40">
                  {label}
                </p>
                <p className="mt-4 text-3xl font-semibold">
                  {value}
                </p>
              </div>
            ),
          )}
        </section>

        <section className="mt-6 border border-black bg-white">
          <div className="border-b border-black p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              Scanner status
            </h2>
            <p className="mt-2 text-sm text-black/50">
              Offline scanners are shown first. Suspended and revoked scanners are not counted here because this view covers ACTIVE scanner connectivity.
            </p>
          </div>

          {terminals.length ===
          0 ? (
            <p className="p-5 text-sm text-black/45">
              No active scanners are available in {scope}.
            </p>
          ) : (
            <div>
              {terminals.map(
                (
                  terminal,
                ) => (
                  <div
                    className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    key={
                      terminal.id
                    }
                  >
                    <div>
                      <p className="font-semibold">
                        {
                          terminal.name
                        }
                      </p>
                      <p className="mt-1 text-xs text-black/50">
                        {
                          terminal.school_name
                        }{" "}
                        ·{" "}
                        {
                          terminal.branch_name ??
                          "Unassigned campus"
                        }{" "}
                        ·{" "}
                        {
                          terminal.terminal_code
                        }
                      </p>
                    </div>

                    <div className="md:text-right">
                      <p className="font-mono text-[10px] uppercase tracking-[0.09em]">
                        {terminal.connectivity ===
                        "ONLINE"
                          ? "Currently online"
                          : "Currently offline"}
                      </p>
                      <p className="mt-1 text-xs text-black/45">
                        {terminal.last_seen_at
                          ? `${
                              terminal.connectivity ===
                              "ONLINE"
                                ? "Seen"
                                : "Last seen"
                            } ${new Date(
                              terminal.last_seen_at,
                            ).toLocaleString(
                              "en-NG",
                              {
                                timeZone:
                                  "Africa/Lagos",
                              },
                            )}`
                          : "Never seen"}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </InternalShell>
  );
}
