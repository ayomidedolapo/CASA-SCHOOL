import {
  randomUUID,
} from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  hashPassword,
} from "../src/server/auth/password";
import {
  normalizeLoginIdentifier,
} from "../src/server/auth/identifier";
import {
  securityFingerprint,
} from "../src/server/auth/security";

function required(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value;
}

async function main(): Promise<void> {
  const databaseUrl =
    required("DATABASE_URL");
  const schoolName =
    required(
      "CASA_PROVISION_SCHOOL_NAME",
    );
  const schoolSlug =
    required(
      "CASA_PROVISION_SCHOOL_SLUG",
    ).toLowerCase();
  const ownerName =
    required(
      "CASA_PROVISION_OWNER_NAME",
    );
  const ownerIdentifier =
    required(
      "CASA_PROVISION_OWNER_IDENTIFIER",
    );
  const ownerPassword =
    required(
      "CASA_PROVISION_OWNER_PASSWORD",
    );

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      schoolSlug,
    )
  ) {
    throw new Error(
      "School slug must be lowercase words separated by hyphens.",
    );
  }

  const identity =
    normalizeLoginIdentifier(
      ownerIdentifier,
    );

  if (!identity) {
    throw new Error(
      "Owner identifier must be a valid email or E.164 phone number.",
    );
  }

  const passwordHash =
    await hashPassword(
      ownerPassword,
    );

  const sql = neon(databaseUrl);

  const counts = await sql`
    select
      (select count(*)::int from schools) as schools,
      (select count(*)::int from users) as users
  `;

  if (
    (counts[0]?.schools ?? 0) !== 0 ||
    (counts[0]?.users ?? 0) !== 0
  ) {
    throw new Error(
      "First-owner provisioning is allowed only on an empty CASA School tenant/user database.",
    );
  }

  const schoolId = randomUUID();
  const userId = randomUUID();
  const membershipId =
    randomUUID();
  const roleId = randomUUID();

  const email =
    identity.kind === "EMAIL"
      ? identity.value
      : null;
  const phone =
    identity.kind === "PHONE"
      ? identity.value
      : null;

  await sql.transaction([
    sql`
      insert into schools (
        id,
        slug,
        name,
        status,
        timezone
      )
      values (
        ${schoolId},
        ${schoolSlug},
        ${schoolName},
        'ACTIVE',
        'Africa/Lagos'
      )
    `,
    sql`
      insert into users (
        id,
        full_name,
        email,
        phone,
        status
      )
      values (
        ${userId},
        ${ownerName},
        ${email},
        ${phone},
        'ACTIVE'
      )
    `,
    sql`
      insert into school_memberships (
        id,
        school_id,
        user_id,
        status,
        joined_at
      )
      values (
        ${membershipId},
        ${schoolId},
        ${userId},
        'ACTIVE',
        now()
      )
    `,
    sql`
      insert into school_membership_roles (
        id,
        school_id,
        membership_id,
        role
      )
      values (
        ${roleId},
        ${schoolId},
        ${membershipId},
        'OWNER'
      )
    `,
    sql`
      insert into auth_password_credentials (
        user_id,
        password_hash,
        must_change_password
      )
      values (
        ${userId},
        ${passwordHash},
        false
      )
    `,
    sql`
      insert into auth_login_events (
        user_id,
        event_type,
        identifier_hash,
        reason
      )
      values (
        ${userId},
        'FIRST_OWNER_PROVISIONED',
        ${securityFingerprint(
          "login-identifier",
          `${identity.kind}:${identity.value}`,
        )},
        'LOCAL_PROVISIONING'
      )
    `,
  ]);

  console.log(
    "CASA School first owner provisioned successfully.",
  );
  console.log({
    schoolId,
    schoolSlug,
    userId,
    ownerName,
    identifierKind:
      identity.kind,
  });
}

main().catch((error: unknown) => {
  console.error(
    "CASA School first-owner provisioning failed.",
  );
  console.error(error);
  process.exit(1);
});