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
  terminalProvisionSchema,
} from "@/server/attendance/validation";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
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

    const db = getDb();

    const terminals =
      await db
        .select({
          id:
            attendanceTerminals.id,
          name:
            attendanceTerminals.name,
          terminalCode:
            attendanceTerminals.terminalCode,
          status:
            attendanceTerminals.status,
          credentialVersion:
            attendanceTerminals.credentialVersion,
          lastSeenAt:
            attendanceTerminals.lastSeenAt,
          createdAt:
            attendanceTerminals.createdAt,
          updatedAt:
            attendanceTerminals.updatedAt,
        })
        .from(
          attendanceTerminals,
        )
        .where(
          eq(
            attendanceTerminals.schoolId,
            access.school.id,
          ),
        )
        .orderBy(
          desc(
            attendanceTerminals.createdAt,
          ),
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
      )
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