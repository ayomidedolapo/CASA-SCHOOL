import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  withTransientDatabaseReadRetry,
} from "@/server/database/read-retry";
import {
  AuthRequiredError,
  requireAuthenticatedUser,
} from "@/server/auth/authorization";
import type {
  CurrentAuthSession,
} from "@/server/auth/session";

export const CASA_INTERNAL_ROLES = [
  "CASA_SUPER_ADMIN",
  "CASA_TEAM",
] as const;

export type CasaInternalRole =
  (typeof CASA_INTERNAL_ROLES)[number];

export const CASA_TEAM_ONBOARDING_CAPABILITIES = [
  "STUDENT_REGISTER",
  "STUDENT_SEARCH",
  "STUDENT_DETAIL_CORRECTION",
  "GUARDIAN_LINK",
  "CLASS_ASSIGN",
  "FACE_ENROLL",
  "SCANNER_ROLLOUT_SUPPORT",
  "CARD_READINESS",
] as const;

export type CasaTeamOnboardingCapability =
  (typeof CASA_TEAM_ONBOARDING_CAPABILITIES)[number];

export const CASA_SENSITIVE_CAPABILITIES = [
  "ORGANIZATION_RESTRUCTURE",
  "MASTER_TEMPLATE_ADMIN",
  "CARD_PRODUCTION_ADMIN",
  "IDENTITY_SECURITY_INVESTIGATION",
  "AUDIT_READ",
  "PLATFORM_CONFIGURATION",
] as const;

export type CasaSensitiveCapability =
  (typeof CASA_SENSITIVE_CAPABILITIES)[number];

export class CasaInternalAccessDeniedError
  extends Error {
  constructor(
    message =
      "CASA internal access denied.",
  ) {
    super(message);
    this.name =
      "CasaInternalAccessDeniedError";
  }
}

export class CasaInternalSchoolScopeError
  extends Error {
  constructor() {
    super(
      "CASA internal school assignment is required.",
    );
    this.name =
      "CasaInternalSchoolScopeError";
  }
}

export class CasaInternalCapabilityError
  extends Error {
  constructor(
    public readonly capability:
      CasaSensitiveCapability,
  ) {
    super(
      `CASA capability required: ${capability}`,
    );
    this.name =
      "CasaInternalCapabilityError";
  }
}

export interface CasaInternalAccess {
  session: CurrentAuthSession;
  membership: {
    id: string;
    role: CasaInternalRole;
  };
}

export interface CasaInternalSchoolAccess
  extends CasaInternalAccess {
  school: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  };
}

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

export async function requireCasaInternalAccess():
  Promise<CasaInternalAccess> {
  const session =
    await requireAuthenticatedUser();
  const db = getDb();

  const result =
    await withTransientDatabaseReadRetry(
      () =>
        db.execute(sql`
      select
        membership.id,
        membership.role
      from casa_internal_memberships
        membership
      join users
        actor
        on actor.id =
           membership.user_id
      where
        membership.user_id =
          ${session.userId}::uuid
        and membership.status =
          'ACTIVE'
        and actor.status =
          'ACTIVE'::user_status
      limit 1
    `),
    );

  const row =
    rowsOf<{
      id: string;
      role:
        CasaInternalRole;
    }>(
      result,
    )[0];

  if (!row) {
    throw new CasaInternalAccessDeniedError();
  }

  return {
    session,
    membership: {
      id:
        row.id,
      role:
        row.role,
    },
  };
}

export async function requireCasaSuperAdmin():
  Promise<CasaInternalAccess> {
  const access =
    await requireCasaInternalAccess();

  if (
    access.membership.role !==
    "CASA_SUPER_ADMIN"
  ) {
    throw new CasaInternalAccessDeniedError(
      "CASA Super Admin access required.",
    );
  }

  return access;
}

export async function requireCasaInternalSchoolAccess(
  schoolId: string,
): Promise<CasaInternalSchoolAccess> {
  const access =
    await requireCasaInternalAccess();
  const db = getDb();

  const result =
    await withTransientDatabaseReadRetry(
      () =>
        db.execute(sql`
      select
        school.id,
        school.slug,
        school.name,
        school.timezone
      from schools
        school
      where
        school.id =
          ${schoolId}::uuid
        and school.status =
          'ACTIVE'::school_status
        and (
          ${access.membership.role} =
            'CASA_SUPER_ADMIN'
          or exists (
            select 1
            from casa_internal_school_assignments
              assignment
            where
              assignment.membership_id =
                ${access.membership.id}::uuid
              and assignment.school_id =
                school.id
              and assignment.status =
                'ACTIVE'
          )
        )
      limit 1
    `),
    );

  const school =
    rowsOf<{
      id: string;
      slug: string;
      name: string;
      timezone: string;
    }>(
      result,
    )[0];

  if (!school) {
    throw new CasaInternalSchoolScopeError();
  }

  return {
    ...access,
    school,
  };
}

export async function requireCasaInternalOnboardingCapability(
  schoolId: string,
  capability:
    CasaTeamOnboardingCapability,
): Promise<CasaInternalSchoolAccess> {
  const access =
    await requireCasaInternalSchoolAccess(
      schoolId,
    );

  if (
    !(
      CASA_TEAM_ONBOARDING_CAPABILITIES as
        readonly string[]
    ).includes(capability)
  ) {
    throw new CasaInternalAccessDeniedError(
      `CASA onboarding capability denied: ${capability}`,
    );
  }

  return access;
}

export async function requireCasaCapability(
  capability:
    CasaSensitiveCapability,
): Promise<CasaInternalAccess> {
  const access =
    await requireCasaInternalAccess();

  if (
    access.membership.role ===
    "CASA_SUPER_ADMIN"
  ) {
    return access;
  }

  const db = getDb();
  const result =
    await withTransientDatabaseReadRetry(
      () =>
        db.execute(sql`
      select 1
      from casa_internal_capability_grants
      where
        membership_id =
          ${access.membership.id}::uuid
        and capability =
          ${capability}
        and revoked_at is null
      limit 1
    `),
    );

  if (
    rowsOf(result).length !==
    1
  ) {
    throw new CasaInternalCapabilityError(
      capability,
    );
  }

  return access;
}

export function isAuthRequiredError(
  error: unknown,
): error is AuthRequiredError {
  return (
    error instanceof
    AuthRequiredError
  );
}
