import {
  desc,
  eq,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  attendanceTerminals,
} from "@/db/schema";
import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
  requireAttendanceOperator,
} from "@/server/attendance/http";
import {
  createTerminalCredential,
} from "@/server/attendance/terminal-credential";
import {
  requirePasskeyStepUpGrant,
} from "@/server/auth/passkey-step-up";
import {
  terminalProvisionSchema,
} from "@/server/attendance/validation";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

function rowsOf<T>(
  result:
    unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
    "rows" in
      result &&
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

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireAttendanceOperator(
        slug,
      );

    const visibility =
      await listVisibleBranches(
        slug,
      );
    const visibleBranchIds =
      visibility.branches.map(
        (branch) =>
          String(
            (
              branch as {
                id: unknown;
              }
            ).id,
          ),
      );
    const canSeeUnassigned =
      visibility.organizationAdmin ||
      access.roles.includes(
        "SCHOOL_TECHNICIAN",
      );

    if (
      visibleBranchIds.length ===
        0 &&
      !canSeeUnassigned
    ) {
      return NextResponse.json(
        {
          terminals: [],
        },
        {
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const terminals =
      rowsOf<{
        id: string;
        name: string;
        terminalCode: string;
        status:
          | "ACTIVE"
          | "SUSPENDED"
          | "REVOKED";
        credentialVersion:
          number;
        lastSeenAt:
          string | Date | null;
        createdAt:
          string | Date;
        updatedAt:
          string | Date;
        branchId:
          string | null;
        branchName:
          string | null;
      }>(
        await db.execute(sql`
          select
            t.id::text as "id",
            t.name as "name",
            t.terminal_code as "terminalCode",
            t.status::text as "status",
            t.credential_version as "credentialVersion",
            t.last_seen_at as "lastSeenAt",
            t.created_at as "createdAt",
            t.updated_at as "updatedAt",
            b.id::text as "branchId",
            b.name as "branchName"
          from attendance_terminals t
          left join school_branch_terminals mapping
            on mapping.school_id =
               t.school_id
           and mapping.terminal_id =
               t.id
          left join school_branches b
            on b.school_id =
               mapping.school_id
           and b.id =
               mapping.branch_id
          where
            t.school_id =
              ${access.school.id}::uuid
            and (
              mapping.branch_id =
                any(
                  ${visibleBranchIds}::uuid[]
                )
              or (
                mapping.branch_id is null
                and ${canSeeUnassigned}
              )
            )
          order by
            t.created_at desc
        `),
      );

    return NextResponse.json(
      {
        terminals,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireAttendanceOperator(
        slug,
      );

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid terminal request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const parsed =
      terminalProvisionSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid terminal request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const visibility =
      await listVisibleBranches(
        slug,
      );

    const requestedBranchId =
      parsed.data.branchId ??
      null;

    const selectedBranch =
      requestedBranchId
        ? visibility.branches.find(
            (branch) =>
              String(
                (
                  branch as {
                    id: unknown;
                  }
                ).id,
              ) ===
              requestedBranchId,
          ) ??
          null
        : visibility.branches.length ===
            1
          ? visibility.branches[0]
          : null;

    if (!selectedBranch) {
      return NextResponse.json(
        {
          message:
            visibility.branches.length >
            1
              ? "Select the campus this scanner belongs to before provisioning it."
              : "No active campus is available for this scanner.",
          code:
            visibility.branches.length >
            1
              ? "TERMINAL_CAMPUS_REQUIRED"
              : "TERMINAL_CAMPUS_UNAVAILABLE",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const selectedBranchId =
      String(
        (
          selectedBranch as {
            id: unknown;
          }
        ).id,
      );
    const selectedBranchName =
      String(
        (
          selectedBranch as {
            name: unknown;
          }
        ).name,
      );

    await requirePasskeyStepUpGrant({
      token:
        request.headers.get(
          "x-casa-passkey-step-up",
        ),
      access,
      action:
        "TERMINAL_PROVISION",
    });

    const credential =
      createTerminalCredential();

    const now =
      new Date().toISOString();

    const db = getDb();

    await db.execute(sql`
      with inserted_terminal as (
        insert into attendance_terminals (
          id,
          school_id,
          name,
          terminal_code,
          secret_hash,
          credential_version,
          status,
          provisioned_by_membership_id,
          created_at,
          updated_at
        )
        values (
          ${credential.terminalId}::uuid,
          ${access.school.id}::uuid,
          ${parsed.data.name},
          ${credential.terminalCode},
          ${credential.secretHash},
          1,
          'ACTIVE'::attendance_terminal_status,
          ${access.membership.id}::uuid,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        returning
          id,
          school_id,
          credential_version
      ),
      inserted_event as (
        insert into attendance_terminal_events (
          school_id,
          terminal_id,
          actor_membership_id,
          event_type,
          credential_version,
          created_at
        )
        select
          inserted_terminal.school_id,
          inserted_terminal.id,
          ${access.membership.id}::uuid,
          'PROVISIONED'::attendance_terminal_event_type,
          inserted_terminal.credential_version,
          ${now}::timestamptz
        from inserted_terminal
        returning
          terminal_id
      )
      insert into school_branch_terminals (
        id,
        school_id,
        branch_id,
        terminal_id,
        created_at
      )
      select
        gen_random_uuid(),
        inserted_terminal.school_id,
        ${selectedBranchId}::uuid,
        inserted_terminal.id,
        ${now}::timestamptz
      from inserted_terminal
      join inserted_event
        on inserted_event.terminal_id =
           inserted_terminal.id
    `);

    return NextResponse.json(
      {
        terminal: {
          id:
            credential.terminalId,
          name:
            parsed.data.name,
          terminalCode:
            credential.terminalCode,
          status:
            "ACTIVE",
          credentialVersion: 1,
          branchId:
            selectedBranchId,
          branchName:
            selectedBranchName,
        },
        credential: {
          token:
            credential.token,
          shownOnce: true,
        },
      },
      {
        status: 201,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "PASSKEY_STEP_UP_REQUIRED"
    ) {
      return NextResponse.json(
        {
          message:
            "Passkey authorization is required.",
          code:
            "PASSKEY_STEP_UP_REQUIRED",
          requiredAction:
            "TERMINAL_PROVISION",
        },
        {
          status: 403,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}