import {
  and,
  eq,
} from "drizzle-orm";
import type {
  NextRequest,
} from "next/server";

import { getDb } from "@/db";
import {
  attendanceTerminals,
  schools,
} from "@/db/schema";

import { reconcileTerminalHealthNotifications } from "@/server/internal/terminal-health";

import {
  parseTerminalToken,
  terminalSecretMatches,
} from "./terminal-credential";

export interface TerminalAccess {
  terminal: {
    id: string;
    schoolId: string;
    name: string;
    terminalCode: string;
    credentialVersion: number;
  };
  school: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  };
}

export async function authenticateTerminalRequest(
  request: NextRequest,
): Promise<TerminalAccess | null> {
  const authorization =
    request.headers.get(
      "authorization",
    );

  if (
    !authorization?.startsWith(
      "Bearer ",
    )
  ) {
    return null;
  }

  const parsed =
    parseTerminalToken(
      authorization.slice(7),
    );

  if (!parsed) {
    return null;
  }

  const db = getDb();

  const rows = await db
    .select({
      terminalId:
        attendanceTerminals.id,
      schoolId:
        attendanceTerminals.schoolId,
      terminalName:
        attendanceTerminals.name,
      terminalCode:
        attendanceTerminals.terminalCode,
      secretHash:
        attendanceTerminals.secretHash,
      credentialVersion:
        attendanceTerminals.credentialVersion,
      schoolSlug:
        schools.slug,
      schoolName:
        schools.name,
      timezone:
        schools.timezone,
    })
    .from(attendanceTerminals)
    .innerJoin(
      schools,
      eq(
        attendanceTerminals.schoolId,
        schools.id,
      ),
    )
    .where(
      and(
        eq(
          attendanceTerminals.id,
          parsed.terminalId,
        ),
        eq(
          attendanceTerminals.status,
          "ACTIVE",
        ),
        eq(
          schools.status,
          "ACTIVE",
        ),
      ),
    )
    .limit(1);

  const row =
    rows[0];

  if (
    !row ||
    !terminalSecretMatches(
      parsed.secret,
      row.secretHash,
    )
  ) {
    return null;
  }

  await db
    .update(
      attendanceTerminals,
    )
    .set({
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(
          attendanceTerminals.schoolId,
          row.schoolId,
        ),
        eq(
          attendanceTerminals.id,
          row.terminalId,
        ),
        eq(
          attendanceTerminals.status,
          "ACTIVE",
        ),
      ),
    );

  await reconcileTerminalHealthNotifications({ schoolId: row.schoolId });

  return {
    terminal: {
      id: row.terminalId,
      schoolId:
        row.schoolId,
      name:
        row.terminalName,
      terminalCode:
        row.terminalCode,
      credentialVersion:
        row.credentialVersion,
    },
    school: {
      id: row.schoolId,
      slug:
        row.schoolSlug,
      name:
        row.schoolName,
      timezone:
        row.timezone,
    },
  };
}