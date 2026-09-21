import {
  and,
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
  createRotatedTerminalSecret,
} from "@/server/attendance/terminal-credential";
import {
  requirePasskeyStepUpGrant,
  type PasskeyStepUpAction,
} from "@/server/auth/passkey-step-up";
import {
  terminalLifecycleSchema,
} from "@/server/attendance/validation";
import {
  assignTerminalToBranch,
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    terminalId: string;
  }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    terminalId,
  } = await context.params;

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
            "Invalid terminal lifecycle request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const parsed =
      terminalLifecycleSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid terminal lifecycle request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const rows =
      await db
        .select({
          id:
            attendanceTerminals.id,
          status:
            attendanceTerminals.status,
          credentialVersion:
            attendanceTerminals.credentialVersion,
        })
        .from(
          attendanceTerminals,
        )
        .where(
          and(
            eq(
              attendanceTerminals.schoolId,
              access.school.id,
            ),
            eq(
              attendanceTerminals.id,
              terminalId,
            ),
          ),
        )
        .limit(1);

    const current =
      rows[0];

    if (!current) {
      return NextResponse.json(
        {
          message:
            "Terminal not found.",
        },
        {
          status: 404,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    if (
      current.status === "REVOKED"
    ) {
      return NextResponse.json(
        {
          message:
            "A revoked terminal cannot be changed.",
        },
        {
          status: 409,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const passkeyActionByLifecycle: Record<
      typeof parsed.data.action,
      PasskeyStepUpAction
    > = {
      ROTATE_CREDENTIAL:
        "TERMINAL_ROTATE",
      ASSIGN_CAMPUS:
        "TERMINAL_PROVISION",
      SUSPEND:
        "TERMINAL_SUSPEND",
      REACTIVATE:
        "TERMINAL_REACTIVATE",
      REVOKE:
        "TERMINAL_REVOKE",
    };

    const requiredPasskeyAction =
      passkeyActionByLifecycle[
        parsed.data.action
      ];

    await requirePasskeyStepUpGrant({
      token:
        request.headers.get(
          "x-casa-passkey-step-up",
        ),
      access,
      action:
        requiredPasskeyAction,
    });

    const now =
      new Date().toISOString();

    if (
      parsed.data.action ===
      "ASSIGN_CAMPUS"
    ) {
      // Capture the discriminated-union field before entering callbacks.
      // TypeScript does not retain parsed.data narrowing across the
      // Array.find closure even though this branch has already proven
      // action === ASSIGN_CAMPUS.
      const requestedBranchId =
        parsed.data.branchId;

      const visibility =
        await listVisibleBranches(
          slug,
        );

      const selectedBranch =
        visibility.branches.find(
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
        null;

      if (!selectedBranch) {
        return NextResponse.json(
          {
            message:
              "That campus is not available to this operator.",
            code:
              "TERMINAL_CAMPUS_SCOPE_DENIED",
          },
          {
            status: 403,
            headers:
              attendanceNoStoreHeaders,
          },
        );
      }

      await assignTerminalToBranch({
        access,
        branchId:
          requestedBranchId,
        terminalId,
      });

      return NextResponse.json(
        {
          terminal: {
            id:
              terminalId,
            status:
              current.status,
            credentialVersion:
              current.credentialVersion,
            branchId:
              requestedBranchId,
            branchName:
              String(
                (
                  selectedBranch as {
                    name: unknown;
                  }
                ).name,
              ),
          },
        },
        {
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    if (
      parsed.data.action ===
      "ROTATE_CREDENTIAL"
    ) {
      const rotated =
        createRotatedTerminalSecret(
          terminalId,
        );

      const nextVersion =
        current.credentialVersion + 1;

      await db.execute(sql`
        with changed_terminal as (
          update attendance_terminals
          set
            secret_hash =
              ${rotated.secretHash},
            credential_version =
              ${nextVersion},
            updated_at =
              ${now}::timestamptz
          where
            school_id =
              ${access.school.id}::uuid
            and id =
              ${terminalId}::uuid
            and status <>
              'REVOKED'::attendance_terminal_status
          returning
            id,
            school_id,
            credential_version
        )
        insert into attendance_terminal_events (
          school_id,
          terminal_id,
          actor_membership_id,
          event_type,
          credential_version,
          reason,
          created_at
        )
        select
          changed_terminal.school_id,
          changed_terminal.id,
          ${access.membership.id}::uuid,
          'CREDENTIAL_ROTATED'::attendance_terminal_event_type,
          changed_terminal.credential_version,
          ${parsed.data.reason ?? null},
          ${now}::timestamptz
        from changed_terminal
      `);

      return NextResponse.json(
        {
          terminal: {
            id: terminalId,
            status:
              current.status,
            credentialVersion:
              nextVersion,
          },
          credential: {
            token:
              rotated.token,
            shownOnce: true,
          },
        },
        {
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const targetByAction = {
      SUSPEND: {
        required: "ACTIVE",
        target: "SUSPENDED",
        event: "SUSPENDED",
      },
      REACTIVATE: {
        required: "SUSPENDED",
        target: "ACTIVE",
        event: "REACTIVATED",
      },
      REVOKE: {
        required: null,
        target: "REVOKED",
        event: "REVOKED",
      },
    } as const;

    const transition =
      targetByAction[
        parsed.data.action
      ];

    if (
      transition.required &&
      current.status !==
        transition.required
    ) {
      return NextResponse.json(
        {
          message:
            "Terminal status does not allow this action.",
        },
        {
          status: 409,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    await db.execute(sql`
      with changed_terminal as (
        update attendance_terminals
        set
          status =
            ${transition.target}::attendance_terminal_status,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${access.school.id}::uuid
          and id =
            ${terminalId}::uuid
          and status <>
            'REVOKED'::attendance_terminal_status
        returning
          id,
          school_id,
          credential_version
      )
      insert into attendance_terminal_events (
        school_id,
        terminal_id,
        actor_membership_id,
        event_type,
        credential_version,
        reason,
        created_at
      )
      select
        changed_terminal.school_id,
        changed_terminal.id,
        ${access.membership.id}::uuid,
        ${transition.event}::attendance_terminal_event_type,
        changed_terminal.credential_version,
        ${parsed.data.reason ?? null},
        ${now}::timestamptz
      from changed_terminal
    `);

    return NextResponse.json(
      {
        terminal: {
          id: terminalId,
          status:
            transition.target,
          credentialVersion:
            current.credentialVersion,
        },
      },
      {
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