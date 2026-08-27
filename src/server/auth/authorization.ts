import {
  and,
  eq,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  schoolMembershipRoles,
  schoolMemberships,
  schools,
} from "@/db/schema";

import {
  getCurrentAuthSession,
  type CurrentAuthSession,
} from "./session";

export const SCHOOL_ROLES = [
  "OWNER",
  "ADMIN",
  "STAFF",
  "GUARDIAN",
  "STUDENT",
] as const;

export type SchoolRole =
  (typeof SCHOOL_ROLES)[number];

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AuthRequiredError";
  }
}

export class SchoolAccessDeniedError extends Error {
  constructor() {
    super("School access denied.");
    this.name =
      "SchoolAccessDeniedError";
  }
}

export interface SchoolAccess {
  session: CurrentAuthSession;
  school: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  };
  membership: {
    id: string;
  };
  roles: SchoolRole[];
}

export async function requireAuthenticatedUser(): Promise<
  CurrentAuthSession
> {
  const session =
    await getCurrentAuthSession();

  if (!session) {
    throw new AuthRequiredError();
  }

  return session;
}

export async function requireSchoolAccess(
  schoolSlug: string,
): Promise<SchoolAccess> {
  const session =
    await requireAuthenticatedUser();
  const db = getDb();

  const memberships = await db
    .select({
      schoolId: schools.id,
      schoolSlug: schools.slug,
      schoolName: schools.name,
      timezone: schools.timezone,
      membershipId:
        schoolMemberships.id,
    })
    .from(schools)
    .innerJoin(
      schoolMemberships,
      and(
        eq(
          schoolMemberships.schoolId,
          schools.id,
        ),
        eq(
          schoolMemberships.userId,
          session.userId,
        ),
      ),
    )
    .where(
      and(
        eq(
          schools.slug,
          schoolSlug,
        ),
        eq(
          schools.status,
          "ACTIVE",
        ),
        eq(
          schoolMemberships.status,
          "ACTIVE",
        ),
      ),
    )
    .limit(1);

  const membership =
    memberships[0];

  if (!membership) {
    throw new SchoolAccessDeniedError();
  }

  const roleRows = await db
    .select({
      role:
        schoolMembershipRoles.role,
    })
    .from(
      schoolMembershipRoles,
    )
    .where(
      and(
        eq(
          schoolMembershipRoles.schoolId,
          membership.schoolId,
        ),
        eq(
          schoolMembershipRoles.membershipId,
          membership.membershipId,
        ),
      ),
    );

  return {
    session,
    school: {
      id: membership.schoolId,
      slug: membership.schoolSlug,
      name: membership.schoolName,
      timezone: membership.timezone,
    },
    membership: {
      id: membership.membershipId,
    },
    roles: roleRows.map(
      (row) => row.role,
    ),
  };
}

export async function requireSchoolRole(
  schoolSlug: string,
  allowedRoles: readonly SchoolRole[],
): Promise<SchoolAccess> {
  const access =
    await requireSchoolAccess(
      schoolSlug,
    );

  const allowed =
    access.roles.some((role) =>
      allowedRoles.includes(role),
    );

  if (!allowed) {
    throw new SchoolAccessDeniedError();
  }

  return access;
}