import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { normalizeLoginIdentifier } from "@/server/auth/identifier";
import { hashPassword } from "@/server/auth/password";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };
const bodySchema = z.object({ setupToken: z.string().min(32).max(512), fullName: z.string().trim().min(2).max(200), email: z.string().trim().email().max(320), password: z.string().min(12).max(128) });

function equalSecret(left: string, right: string) {
  const a = createHash("sha256").update(left, "utf8").digest();
  const b = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const configuredToken = process.env.CASA_INITIAL_SETUP_TOKEN?.trim();
  if (!configuredToken || configuredToken.length < 32) {
    return NextResponse.json({ message: "CASA first-run setup is not configured for this deployment." }, { status: 503, headers: noStoreHeaders });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the setup fields and try again." }, { status: 400, headers: noStoreHeaders });
  if (!equalSecret(configuredToken, parsed.data.setupToken)) return NextResponse.json({ message: "The one-time CASA setup key is invalid." }, { status: 403, headers: noStoreHeaders });

  const identity = normalizeLoginIdentifier(parsed.data.email);
  if (!identity || identity.kind !== "EMAIL") return NextResponse.json({ message: "Enter a valid email address." }, { status: 400, headers: noStoreHeaders });

  const sql = neon(getDatabaseUrl());
  const state = await sql`
    select
      (select count(*)::int from casa_internal_memberships where role = 'CASA_SUPER_ADMIN') as super_admins,
      (select count(*)::int from users where email = ${identity.value}) as matching_users
  `;

  if (Number(state[0]?.super_admins ?? 0) > 0) return NextResponse.json({ message: "CASA first-run setup has already been completed." }, { status: 409, headers: noStoreHeaders });
  if (Number(state[0]?.matching_users ?? 0) > 0) return NextResponse.json({ message: "That email already belongs to a CASA identity." }, { status: 409, headers: noStoreHeaders });

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = randomUUID();
  const membershipId = randomUUID();

  await sql.transaction([
    sql`insert into users (id, full_name, email, phone, status) values (${userId}::uuid, ${parsed.data.fullName}, ${identity.value}, null, 'ACTIVE')`,
    sql`insert into auth_password_credentials (user_id, password_hash, must_change_password) values (${userId}::uuid, ${passwordHash}, false)`,
    sql`insert into casa_internal_memberships (id, user_id, role, status) values (${membershipId}::uuid, ${userId}::uuid, 'CASA_SUPER_ADMIN', 'ACTIVE')`,
  ]);

  return NextResponse.json({ created: true }, { status: 201, headers: noStoreHeaders });
}
