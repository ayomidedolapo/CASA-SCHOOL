import "dotenv/config";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";

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

const userId =
  process.env
    .CASA_INTERNAL_BOOTSTRAP_USER_ID
    ?.trim();

if (!userId) {
  throw new Error(
    "CASA_INTERNAL_BOOTSTRAP_USER_ID is required.",
  );
}

const db = getDb();

const existing =
  await db.execute(sql`
    select id
    from casa_internal_memberships
    limit 1
  `);

if (
  rowsOf(existing).length >
  0
) {
  throw new Error(
    "CASA internal bootstrap is closed because at least one internal membership already exists.",
  );
}

const inserted =
  await db.execute(sql`
    insert into casa_internal_memberships (
      user_id,
      role,
      status,
      created_at,
      updated_at
    )
    select
      actor.id,
      'CASA_SUPER_ADMIN',
      'ACTIVE',
      now(),
      now()
    from users
      actor
    where
      actor.id =
        ${userId}::uuid
      and actor.status =
        'ACTIVE'::user_status
    returning id
  `);

if (
  rowsOf(inserted).length !==
  1
) {
  throw new Error(
    "CASA internal bootstrap user was not found or is not ACTIVE.",
  );
}

console.log(
  "CASA internal bootstrap completed for one Super Admin account.",
);
