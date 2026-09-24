import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export type CasaOperationalSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type CasaOperationalCategory =
  | "SCHOOL_ONBOARDING"
  | "SCANNER_ATTENDANCE"
  | "CARD_PRODUCTION"
  | "BIOMETRIC"
  | "GUARDIAN_DELIVERY"
  | "SECURITY_ACCESS"
  | "SCHOOL_OPERATIONS"
  | "PLATFORM_HEALTH";

export const CASA_OPERATIONAL_EVENT_CATALOG = {
  SCHOOL_REGISTERED: {
    eventType: "SCHOOL_REGISTERED",
    severity: "INFO",
    category: "SCHOOL_ONBOARDING",
    dedupeSeconds: 5,
  },
  SCHOOL_SUSPENDED: {
    eventType: "SCHOOL_SUSPENDED",
    severity: "WARNING",
    category: "SCHOOL_ONBOARDING",
    dedupeSeconds: 5,
  },
  SCHOOL_REACTIVATED: {
    eventType: "SCHOOL_REACTIVATED",
    severity: "INFO",
    category: "SCHOOL_ONBOARDING",
    dedupeSeconds: 5,
  },
  BRANCH_CREATED: {
    eventType: "BRANCH_CREATED",
    severity: "INFO",
    category: "SCHOOL_ONBOARDING",
    dedupeSeconds: 5,
  },
  PRIVILEGED_RECOVERY_PERFORMED: {
    eventType: "PRIVILEGED_RECOVERY_PERFORMED",
    severity: "WARNING",
    category: "SECURITY_ACCESS",
    dedupeSeconds: 5,
  },
  PRIVILEGED_ACCESS_CHANGED: {
    eventType: "PRIVILEGED_ACCESS_CHANGED",
    severity: "INFO",
    category: "SECURITY_ACCESS",
    dedupeSeconds: 5,
  },
  AUTH_RATE_LIMIT_TRIGGERED: {
    eventType: "AUTH_RATE_LIMIT_TRIGGERED",
    severity: "WARNING",
    category: "SECURITY_ACCESS",
    dedupeSeconds: 900,
  },
  SCHOOL_ACTIVITY: {
    eventType: "SCHOOL_ACTIVITY",
    severity: "INFO",
    category: "SCHOOL_OPERATIONS",
    dedupeSeconds: 604800,
  },
  ATTENDANCE_TERMINAL_OFFLINE: {
    eventType: "ATTENDANCE_TERMINAL_OFFLINE",
    severity: "WARNING",
    category: "SCANNER_ATTENDANCE",
    dedupeSeconds: 300,
  },
  ATTENDANCE_TERMINAL_ONLINE: {
    eventType: "ATTENDANCE_TERMINAL_ONLINE",
    severity: "INFO",
    category: "SCANNER_ATTENDANCE",
    dedupeSeconds: 300,
  },
  ATTENDANCE_TERMINAL_UNASSIGNED: {
    eventType: "ATTENDANCE_TERMINAL_UNASSIGNED",
    severity: "WARNING",
    category: "SCANNER_ATTENDANCE",
    dedupeSeconds: 21600,
  },
  CARD_PRODUCTION_FAILURE: {
    eventType: "CARD_PRODUCTION_FAILURE",
    severity: "CRITICAL",
    category: "CARD_PRODUCTION",
    dedupeSeconds: 900,
  },
  CARD_PRODUCTION_CONFIGURATION_FAILURE: {
    eventType: "CARD_PRODUCTION_CONFIGURATION_FAILURE",
    severity: "CRITICAL",
    category: "CARD_PRODUCTION",
    dedupeSeconds: 21600,
  },
  CARD_PRODUCTION_BACKLOG: {
    eventType: "CARD_PRODUCTION_BACKLOG",
    severity: "WARNING",
    category: "CARD_PRODUCTION",
    dedupeSeconds: 21600,
  },
  BIOMETRIC_PROVIDER_FAILURE: {
    eventType: "BIOMETRIC_PROVIDER_FAILURE",
    severity: "CRITICAL",
    category: "BIOMETRIC",
    dedupeSeconds: 900,
  },
  BIOMETRIC_CONFIGURATION_FAILURE: {
    eventType: "BIOMETRIC_CONFIGURATION_FAILURE",
    severity: "CRITICAL",
    category: "BIOMETRIC",
    dedupeSeconds: 21600,
  },
  BIOMETRIC_PROVIDER_PROFILE_MISMATCH: {
    eventType: "BIOMETRIC_PROVIDER_PROFILE_MISMATCH",
    severity: "CRITICAL",
    category: "BIOMETRIC",
    dedupeSeconds: 3600,
  },
  GUARDIAN_PUSH_DELIVERY_FAILED: {
    eventType: "GUARDIAN_PUSH_DELIVERY_FAILED",
    severity: "WARNING",
    category: "GUARDIAN_DELIVERY",
    dedupeSeconds: 3600,
  },
  GUARDIAN_PUSH_WORKER_STALLED: {
    eventType: "GUARDIAN_PUSH_WORKER_STALLED",
    severity: "CRITICAL",
    category: "GUARDIAN_DELIVERY",
    dedupeSeconds: 3600,
  },
  GUARDIAN_EMAIL_INVITE_FAILED: {
    eventType: "GUARDIAN_EMAIL_INVITE_FAILED",
    severity: "WARNING",
    category: "GUARDIAN_DELIVERY",
    dedupeSeconds: 1800,
  },
  GUARDIAN_EMAIL_NOT_CONFIGURED: {
    eventType: "GUARDIAN_EMAIL_NOT_CONFIGURED",
    severity: "CRITICAL",
    category: "GUARDIAN_DELIVERY",
    dedupeSeconds: 21600,
  },
  PLATFORM_JOB_FAILURE: {
    eventType: "PLATFORM_JOB_FAILURE",
    severity: "CRITICAL",
    category: "PLATFORM_HEALTH",
    dedupeSeconds: 900,
  },
  PLATFORM_CONFIGURATION_FAILURE: {
    eventType: "PLATFORM_CONFIGURATION_FAILURE",
    severity: "CRITICAL",
    category: "PLATFORM_HEALTH",
    dedupeSeconds: 21600,
  },
} as const satisfies Record<
  string,
  {
    eventType: string;
    severity: CasaOperationalSeverity;
    category: CasaOperationalCategory;
    dedupeSeconds: number;
  }
>;

export type CasaOperationalEventKey =
  keyof typeof CASA_OPERATIONAL_EVENT_CATALOG;

export type CasaOperationalScope =
  | {
      kind: "PLATFORM";
    }
  | {
      kind: "SCHOOL";
      schoolId: string;
      branchId?: string | null;
    };

export interface CasaOperationalNotificationInput {
  event: CasaOperationalEventKey;
  scope: CasaOperationalScope;
  title: string;
  body: string;
  actionUrl?: string | null;
  dedupKey?: string | null;
  dedupeSeconds?: number;
  payload?: Record<string, unknown>;
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
      (result as { rows?: unknown }).rows,
    )
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export async function emitCasaOperationalNotification(
  input: CasaOperationalNotificationInput,
) {
  const definition =
    CASA_OPERATIONAL_EVENT_CATALOG[
      input.event
    ];
  const schoolId =
    input.scope.kind === "SCHOOL"
      ? input.scope.schoolId
      : null;
  const branchId =
    input.scope.kind === "SCHOOL"
      ? input.scope.branchId ?? null
      : null;
  const scopeKind =
    input.scope.kind;
  const dedupKey =
    input.dedupKey?.trim() ||
    [
      input.event,
      scopeKind,
      schoolId ?? "platform",
      branchId ?? "all",
    ].join(":");
  const dedupeSeconds =
    Math.max(
      0,
      Math.trunc(
        input.dedupeSeconds ??
          definition.dedupeSeconds,
      ),
    );
  const payload =
    JSON.stringify({
      ...(input.payload ?? {}),
      operational: {
        schemaVersion: 1,
        eventKey: input.event,
        severity:
          definition.severity,
        category:
          definition.category,
        dedupKey,
      },
    });
  const db = getDb();

  const result =
    await db.execute(sql`
      insert into casa_in_app_notifications (
        school_id,
        branch_id,
        recipient_internal_membership_id,
        audience,
        event_type,
        title,
        body,
        action_url,
        payload,
        created_at
      )
      select
        ${schoolId}::uuid,
        ${branchId}::uuid,
        membership.id,
        'CASA_INTERNAL',
        ${definition.eventType},
        ${input.title.slice(0, 160)},
        ${input.body.slice(0, 600)},
        ${input.actionUrl ?? "/internal/notifications"},
        ${payload}::jsonb,
        now()
      from casa_internal_memberships membership
      where
        membership.status = 'ACTIVE'
        and (
          (
            ${scopeKind} = 'PLATFORM'
            and membership.role =
              'CASA_SUPER_ADMIN'
          )
          or
          (
            ${scopeKind} = 'SCHOOL'
            and (
              membership.role =
                'CASA_SUPER_ADMIN'
              or exists (
                select 1
                from casa_internal_school_assignments assignment
                where
                  assignment.membership_id =
                    membership.id
                  and assignment.school_id =
                    ${schoolId}::uuid
                  and assignment.status =
                    'ACTIVE'
              )
            )
          )
        )
        and not exists (
          select 1
          from casa_in_app_notifications existing
          where
            existing.recipient_internal_membership_id =
              membership.id
            and existing.event_type =
              ${definition.eventType}
            and coalesce(
              existing.payload #>>
                '{operational,dedupKey}',
              ''
            ) = ${dedupKey}
            and existing.created_at >=
              now() -
              (
                ${dedupeSeconds}::int *
                interval '1 second'
              )
        )
      returning id
    `);

  return {
    inserted:
      rowsOf(result).length,
    eventType:
      definition.eventType,
    severity:
      definition.severity,
    category:
      definition.category,
  };
}

export async function emitCasaOperationalNotificationBestEffort(
  input: CasaOperationalNotificationInput,
) {
  try {
    return await emitCasaOperationalNotification(
      input,
    );
  } catch (error) {
    console.error(
      "CASA operational notification emission failed",
      {
        event:
          input.event,
        scope:
          input.scope.kind,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    return null;
  }
}

export async function emitCasaAuditOperationalNotificationBestEffort(
  input: {
    action: string;
    schoolId?: string | null;
    subjectType?: string | null;
    subjectId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  let event:
    CasaOperationalEventKey |
    null = null;
  let title = "";
  let body = "";

  if (
    input.action ===
    "INTERNAL_SCHOOL_REGISTERED"
  ) {
    event =
      "SCHOOL_REGISTERED";
    title =
      "School registered";
    body =
      "A new school workspace was registered and is ready for CASA operational oversight.";
  } else if (
    input.action ===
    "INTERNAL_SCHOOL_SUSPENDED"
  ) {
    event =
      "SCHOOL_SUSPENDED";
    title =
      "School suspended";
    body =
      "CASA suspended this school and its operational branches.";
  } else if (
    input.action ===
    "INTERNAL_SCHOOL_REACTIVATED"
  ) {
    event =
      "SCHOOL_REACTIVATED";
    title =
      "School reactivated";
    body =
      "CASA reactivated this school and restored its eligible branch state.";
  } else if (
    input.action ===
    "INTERNAL_BRANCH_CREATED"
  ) {
    event =
      "BRANCH_CREATED";
    title =
      "Campus created";
    body =
      "A new school campus was created and is available for operational setup.";
  } else if (
    input.action.includes(
      "RECOVERY",
    )
  ) {
    event =
      "PRIVILEGED_RECOVERY_PERFORMED";
    title =
      "Privileged recovery action";
    body =
      "A CASA internal recovery action was completed. Review the audit context if this was unexpected.";
  } else if (
    /(?:ADMIN|CAPABILITY|ROLE|MEMBERSHIP|ACCESS)/.test(
      input.action,
    )
  ) {
    event =
      "PRIVILEGED_ACCESS_CHANGED";
    title =
      "Privileged access changed";
    body =
      "A CASA or school privileged-access change was completed.";
  }

  if (
    !event &&
    input.schoolId
  ) {
    event =
      "SCHOOL_ACTIVITY";
    title =
      input.action
        .replaceAll(
          "_",
          " ",
        )
        .toLowerCase()
        .replace(
          /^./,
          (value) =>
            value.toUpperCase(),
        );
    body =
      "A school operation was completed in CASA. Open the school context for the related record.";
  }

  if (!event) {
    return null;
  }

  const scope:
    CasaOperationalScope =
      input.schoolId
        ? {
            kind:
              "SCHOOL",
            schoolId:
              input.schoolId,
            branchId:
              input.subjectType ===
                "SCHOOL_BRANCH"
                ? input.subjectId ??
                  null
                : null,
          }
        : {
            kind:
              "PLATFORM",
          };

  return emitCasaOperationalNotificationBestEffort({
    event,
    scope,
    title,
    body,
    actionUrl:
      input.schoolId
        ? `/internal/schools/${encodeURIComponent(
            input.schoolId,
          )}`
        : "/internal",
    dedupKey: [
      "audit",
      input.action,
      input.subjectId ??
        input.schoolId ??
        "platform",
    ].join(":"),
    dedupeSeconds:
      5,
    payload: {
      auditAction:
        input.action,
      subjectType:
        input.subjectType ??
        null,
      subjectId:
        input.subjectId ??
        null,
      auditMetadata:
        input.metadata ??
        {},
    },
  });
}
