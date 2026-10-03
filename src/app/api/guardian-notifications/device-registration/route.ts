import {
  createHash,
} from "node:crypto";
import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";

export const dynamic =
  "force-dynamic";

const credentialSchema =
  z.string()
    .trim()
    .min(32)
    .max(220);

const requestSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal("SYNC"),
        credential:
          credentialSchema,
        fid:
          z.string()
            .trim()
            .min(10)
            .max(255),
      }),
      z.object({
        action:
          z.literal("UNREGISTER"),
        credential:
          credentialSchema,
        fid:
          z.string()
            .trim()
            .min(10)
            .max(255),
      }),
      z.object({
        action:
          z.literal("ACK_CATCH_UP"),
        credential:
          credentialSchema,
        presenceEventId:
          z.string()
            .uuid(),
      }),
    ],
  );

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(
      (value as { rows?: unknown }).rows,
    )
  ) {
    return (
      value as { rows: T[] }
    ).rows;
  }

  return [];
}

function digest(
  value: string,
) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function notificationAssetPath(
  value:
    string | null,
  variant:
    | "icon"
    | "badge",
) {
  if (!value) {
    return undefined;
  }

  const url =
    new URL(
      value,
      "https://casa.invalid",
    );

  url.searchParams.set(
    "variant",
    variant,
  );
  url.searchParams.set(
    "v",
    "m52",
  );

  return `${url.pathname}${url.search}`;
}

function noStoreJson(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

type RegistrationRow = {
  id: string;
  school_id: string;
  guardian_id: string;
  enrollment_link_id:
    string | null;
  firebase_installation_id:
    string;
  status:
    "ACTIVE" |
    "STALE" |
    "REVOKED";
};

async function loadRegistration(
  credential: string,
) {
  const row = rowsOf<RegistrationRow>(
    await getDb().execute(sql`
      select
        id::text,
        school_id::text,
        guardian_id::text,
        enrollment_link_id::text,
        firebase_installation_id,
        status
      from guardian_push_browser_registrations
      where credential_hash = ${digest(credential)}
      limit 1
    `),
  )[0];

  if (!row || row.status === "REVOKED") {
    return null;
  }

  return row;
}

async function catchUpForRegistration(
  registrationId: string,
) {
  return rowsOf<{
    presence_event_id: string;
    event_type:
      "STUDENT_CHECKED_IN" |
      "STUDENT_SIGNED_OUT" |
      "STUDENT_EARLY_DEPARTURE";
    title: string;
    body: string;
    icon_url: string | null;
    occurred_at:
      string | Date;
  }>(
    await getDb().execute(sql`
      with registration as (
        select
          browser.id,
          browser.school_id,
          browser.guardian_id,
          browser.registered_at
        from guardian_push_browser_registrations browser
        where browser.id = ${registrationId}::uuid
          and browser.status <> 'REVOKED'
        limit 1
      ),
      missed as (
        select
          event.id::text as presence_event_id,
          case
            when event.event_type =
              'CHECKED_IN'::attendance_presence_event_type
              then 'STUDENT_CHECKED_IN'
            when event.departure_result =
              'EARLY'::attendance_departure_result
              then 'STUDENT_EARLY_DEPARTURE'
            else 'STUDENT_SIGNED_OUT'
          end as event_type,
          school.name || ' · CASA' as title,
          case
            when event.event_type =
              'CHECKED_IN'::attendance_presence_event_type
              then concat_ws(
                ' ',
                student.first_name,
                nullif(student.middle_name, ''),
                student.last_name
              ) || ' has gotten to school at ' ||
              to_char(
                event.occurred_at at time zone school.timezone,
                'HH24:MI'
              ) || '.'
            when event.departure_result =
              'EARLY'::attendance_departure_result
              then concat_ws(
                ' ',
                student.first_name,
                nullif(student.middle_name, ''),
                student.last_name
              ) || ' has left school early at ' ||
              to_char(
                event.occurred_at at time zone school.timezone,
                'HH24:MI'
              ) || '.'
            else concat_ws(
              ' ',
              student.first_name,
              nullif(student.middle_name, ''),
              student.last_name
            ) || ' has left school at ' ||
            to_char(
              event.occurred_at at time zone school.timezone,
              'HH24:MI'
            ) || '.'
          end as body,
          case
            when student.home_branch_id is not null
              then '/api/public/schools/' ||
                event.school_id::text ||
                '/notification-logo?branchId=' ||
                student.home_branch_id::text
            else '/api/public/schools/' ||
              event.school_id::text ||
              '/notification-logo'
          end as icon_url,
          event.occurred_at
        from registration browser
        join schools school
          on school.id = browser.school_id
        join student_guardians relationship
          on relationship.school_id = browser.school_id
         and relationship.guardian_id = browser.guardian_id
         and relationship.receives_notifications = true
        join students student
          on student.school_id = relationship.school_id
         and student.id = relationship.student_id
         and student.status = 'ACTIVE'::student_status
        join student_presence_events event
          on event.school_id = relationship.school_id
         and event.student_id = relationship.student_id
        left join guardian_push_delivery_receipts receipt
          on receipt.browser_registration_id = browser.id
         and receipt.presence_event_id = event.id
        where event.occurred_at >= greatest(
            browser.registered_at,
            now() - interval '7 days'
          )
          and receipt.id is null
        order by event.occurred_at asc, event.id asc
        limit 100
      )
      select *
      from missed
      order by occurred_at asc, presence_event_id asc
    `),
  ).map(
    (row) => ({
      presenceEventId:
        row.presence_event_id,
      eventType:
        row.event_type,
      title:
        row.title,
      body:
        row.body,
      iconUrl:
        notificationAssetPath(
          row.icon_url,
          "icon",
        ),
      badgeUrl:
        notificationAssetPath(
          row.icon_url,
          "badge",
        ),
      occurredAt:
        row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : String(row.occurred_at),
    }),
  );
}

export async function POST(
  request: NextRequest,
) {
  const parsed =
    requestSchema.safeParse(
      await request.json()
        .catch(() => null),
    );

  if (!parsed.success) {
    return noStoreJson(
      {
        message:
          "Invalid guardian device registration request.",
      },
      400,
    );
  }

  const registration =
    await loadRegistration(
      parsed.data.credential,
    );

  if (!registration) {
    return noStoreJson(
      {
        message:
          "This CASA browser registration is no longer active.",
        code:
          "GUARDIAN_BROWSER_REGISTRATION_EXPIRED",
      },
      410,
    );
  }

  if (
    parsed.data.action ===
      "ACK_CATCH_UP"
  ) {
    const acknowledged =
      rowsOf<{ id: string }>(
        await getDb().execute(sql`
          with receipt as (
            insert into guardian_push_delivery_receipts (
              school_id,
              guardian_id,
              browser_registration_id,
              presence_event_id,
              display_source,
              displayed_at,
              created_at
            )
            select
              browser.school_id,
              browser.guardian_id,
              browser.id,
              event.id,
              'CATCH_UP',
              now(),
              now()
            from guardian_push_browser_registrations browser
            join student_presence_events event
              on event.school_id = browser.school_id
             and event.id = ${parsed.data.presenceEventId}::uuid
            join student_guardians relationship
              on relationship.school_id = browser.school_id
             and relationship.student_id = event.student_id
             and relationship.guardian_id = browser.guardian_id
             and relationship.receives_notifications = true
            where browser.id = ${registration.id}::uuid
              and browser.status <> 'REVOKED'
            on conflict (
              browser_registration_id,
              presence_event_id
            ) do update set
              display_source = 'CATCH_UP',
              displayed_at = least(
                guardian_push_delivery_receipts.displayed_at,
                excluded.displayed_at
              )
            returning id
          ),
          displayed_outbox as (
            update guardian_push_outbox outbox
            set
              device_displayed_at = coalesce(
                outbox.device_displayed_at,
                now()
              ),
              updated_at = now()
            from guardian_push_devices device
            where device.browser_registration_id =
                  ${registration.id}::uuid
              and device.status = 'ACTIVE'
              and outbox.device_id = device.id
              and outbox.presence_event_id =
                  ${parsed.data.presenceEventId}::uuid
            returning outbox.id
          )
          select receipt.id::text as id
          from receipt
          cross join (
            select count(*)::int
            from displayed_outbox
          ) outbox_proof
        `),
      ).length > 0;

    return noStoreJson({
      acknowledged,
    });
  }

  const userAgent =
    request.headers
      .get("user-agent")
      ?.slice(0, 500) ??
    null;

  if (
    parsed.data.action ===
      "UNREGISTER"
  ) {
    if (
      registration.firebase_installation_id !==
        parsed.data.fid
    ) {
      return noStoreJson({
        unregistered: false,
        staleEventIgnored: true,
      });
    }

    await getDb().execute(sql`
      with stale_registration as (
        update guardian_push_browser_registrations
        set
          status = 'STALE',
          unregistered_at = coalesce(
            unregistered_at,
            now()
          ),
          last_seen_at = now(),
          updated_at = now()
        where id = ${registration.id}::uuid
          and status <> 'REVOKED'
        returning id
      )
      update guardian_push_devices device
      set
        status = 'DISABLED',
        updated_at = now()
      from stale_registration browser
      where device.browser_registration_id = browser.id
        and device.firebase_installation_id = ${parsed.data.fid}
        and device.status = 'ACTIVE'
    `);

    return noStoreJson({
      unregistered: true,
    });
  }

  const synced =
    rowsOf<{
      id: string;
    }>(
      await getDb().execute(sql`
        with updated_registration as (
          update guardian_push_browser_registrations
          set
            firebase_installation_id = ${parsed.data.fid},
            status = 'ACTIVE',
            user_agent = ${userAgent},
            last_seen_at = now(),
            unregistered_at = null,
            updated_at = now()
          where id = ${registration.id}::uuid
            and status <> 'REVOKED'
          returning *
        ),
        superseded_registration as (
          update guardian_push_browser_registrations other
          set
            status = 'REVOKED',
            unregistered_at = coalesce(
              other.unregistered_at,
              now()
            ),
            updated_at = now()
          from updated_registration current
          where other.school_id = current.school_id
            and other.guardian_id = current.guardian_id
            and other.firebase_installation_id = current.firebase_installation_id
            and other.id <> current.id
            and other.status <> 'REVOKED'
          returning other.id
        ),
        disabled_superseded as (
          update guardian_push_devices device
          set
            status = 'DISABLED',
            updated_at = now()
          where device.browser_registration_id in (
              select id
              from superseded_registration
            )
            and device.status = 'ACTIVE'
          returning device.id
        ),
        disabled_old_fid as (
          update guardian_push_devices device
          set
            status = 'DISABLED',
            updated_at = now()
          from updated_registration current
          where device.browser_registration_id = current.id
            and device.firebase_installation_id <>
                current.firebase_installation_id
            and device.status = 'ACTIVE'
          returning device.id
        ),
        disabled_unsubscribed as (
          update guardian_push_devices device
          set
            status = 'DISABLED',
            updated_at = now()
          from updated_registration current
          where device.browser_registration_id = current.id
            and device.status = 'ACTIVE'
            and not exists (
              select 1
              from student_guardians relationship
              where relationship.school_id = current.school_id
                and relationship.guardian_id = current.guardian_id
                and relationship.id = device.student_guardian_link_id
                and relationship.receives_notifications = true
            )
          returning device.id
        ),
        target_relationships as (
          select
            current.id as browser_registration_id,
            current.school_id,
            student.home_branch_id as branch_id,
            relationship.student_id,
            current.guardian_id,
            relationship.id as student_guardian_link_id,
            current.enrollment_link_id,
            current.firebase_installation_id,
            current.user_agent
          from updated_registration current
          join student_guardians relationship
            on relationship.school_id = current.school_id
           and relationship.guardian_id = current.guardian_id
           and relationship.receives_notifications = true
          join guardians guardian
            on guardian.school_id = relationship.school_id
           and guardian.id = relationship.guardian_id
           and guardian.status = 'ACTIVE'::guardian_status
          join students student
            on student.school_id = relationship.school_id
           and student.id = relationship.student_id
           and student.status = 'ACTIVE'::student_status
          where current.enrollment_link_id is not null
        ),
        bound_devices as (
          insert into guardian_push_devices (
            school_id,
            branch_id,
            student_id,
            guardian_id,
            student_guardian_link_id,
            enrollment_link_id,
            browser_registration_id,
            firebase_installation_id,
            status,
            user_agent,
            last_seen_at,
            created_at,
            updated_at
          )
          select
            target.school_id,
            target.branch_id,
            target.student_id,
            target.guardian_id,
            target.student_guardian_link_id,
            target.enrollment_link_id,
            target.browser_registration_id,
            target.firebase_installation_id,
            'ACTIVE',
            target.user_agent,
            now(),
            now(),
            now()
          from target_relationships target
          on conflict (
            school_id,
            student_guardian_link_id,
            firebase_installation_id
          ) do update set
            branch_id = excluded.branch_id,
            enrollment_link_id = excluded.enrollment_link_id,
            browser_registration_id = excluded.browser_registration_id,
            status = 'ACTIVE',
            user_agent = excluded.user_agent,
            last_seen_at = now(),
            updated_at = now()
          returning id
        )
        select id::text
        from updated_registration
      `),
    )[0];

  if (!synced) {
    return noStoreJson(
      {
        message:
          "CASA could not refresh this browser registration.",
      },
      409,
    );
  }

  return noStoreJson({
    synced: true,
    catchUp:
      await catchUpForRegistration(
        registration.id,
      ),
  });
}
