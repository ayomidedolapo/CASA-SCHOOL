import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  listSchoolAuditEvents,
  type SchoolAuditEvent,
} from "@/server/school-operations/audit";

function actionUrl(
  slug: string,
  event:
    SchoolAuditEvent,
) {
  const base =
    `/schools/${encodeURIComponent(
      slug,
    )}`;

  switch (
    event.category
  ) {
    case "Structure":
      return `${base}/branches`;
    case "Scanner":
      return `${base}/technician`;
    case "Biometric":
      return `${base}/registry`;
    case "Attendance":
      return `${base}/attendance`;
    case "Progression":
      return `${base}/academic`;
    default:
      return `${base}/audit`;
  }
}

function titleFor(
  event:
    SchoolAuditEvent,
) {
  switch (
    event.category
  ) {
    case "Structure":
      return "School structure updated";
    case "Scanner":
      return "Scanner activity";
    case "Biometric":
      return "Student identity activity";
    case "Attendance":
      return event.action ===
        "ATTENDANCE_OPENED"
        ? "Attendance opened"
        : event.action ===
            "ATTENDANCE_CLOSED"
          ? "Attendance closed"
          : "Attendance activity";
    case "Progression":
      return "Student progression activity";
    default:
      return "School activity";
  }
}

export async function reconcileSchoolMemberNotifications(
  input: {
    slug: string;
    schoolId: string;
    membershipId:
      string;
  },
) {
  let result:
    Awaited<
      ReturnType<
        typeof listSchoolAuditEvents
      >
    >;

  try {
    result =
      await listSchoolAuditEvents({
        slug:
          input.slug,
        limit:
          200,
      });
  } catch {
    // Notification access can be wider than the Audit page. Preserve the
    // notification centre for school roles without audit authority.
    return {
      reconciled:
        0,
    };
  }

  const cutoff =
    Date.now() -
    7 *
      24 *
      60 *
      60 *
      1000;

  const events =
    result.events.filter(
      (event) =>
        Date.parse(
          event.occurredAt,
        ) >=
        cutoff,
    );

  const db =
    getDb();

  for (
    const event of
      events
  ) {
    const body =
      [
        event.subject,
        event.detail,
        event.branchName
          ? `Campus: ${event.branchName}`
          : null,
        event.actorName &&
        event.actorName !==
          "System"
          ? `By ${event.actorName}`
          : null,
      ]
        .filter(
          Boolean,
        )
        .join(
          " · ",
        )
        .slice(
          0,
          600,
        );

    await db.execute(sql`
      insert into casa_in_app_notifications (
        school_id,
        branch_id,
        recipient_school_membership_id,
        audience,
        event_type,
        title,
        body,
        action_url,
        payload,
        created_at
      )
      select
        ${input.schoolId}::uuid,
        ${event.branchId}::uuid,
        ${input.membershipId}::uuid,
        'SCHOOL_OPERATOR',
        ${event.action.slice(
          0,
          80,
        )},
        ${titleFor(
          event,
        )},
        ${body},
        ${actionUrl(
          input.slug,
          event,
        )},
        ${JSON.stringify({
          sourceAuditEventId:
            event.id,
          category:
            event.category,
          subject:
            event.subject,
          actorName:
            event.actorName,
        })}::jsonb,
        ${event.occurredAt}::timestamptz
      where not exists (
        select 1
        from casa_in_app_notifications existing
        where
          existing.school_id =
            ${input.schoolId}::uuid
          and existing.recipient_school_membership_id =
            ${input.membershipId}::uuid
          and existing.payload ->>
            'sourceAuditEventId' =
            ${event.id}
      )
    `);
  }

  return {
    reconciled:
      events.length,
  };
}
