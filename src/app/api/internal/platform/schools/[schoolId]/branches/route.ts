import { createHash, randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { normalizeLoginIdentifier } from "@/server/auth/identifier";
import { requireCasaCapability, requireCasaInternalSchoolAccess } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { sendAccountAccessEmail } from "@/server/messaging/account-access-email";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).max(32),
  address: z.string().trim().max(1000).nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PROVISION_ADMIN"),
    branchId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(320),
  }),
  z.object({
    action: z.literal("REISSUE_ADMIN_SETUP"),
    branchId: z.string().uuid(),
  }),
]);

function rowsOf<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && "rows" in value && Array.isArray((value as { rows?: unknown }).rows)) {
    return (value as { rows: T[] }).rows;
  }
  return [];
}

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

async function requireStructure(schoolId: string) {
  const access = await requireCasaInternalSchoolAccess(schoolId);
  if (access.membership.role !== "CASA_SUPER_ADMIN") {
    await requireCasaCapability("ORGANIZATION_RESTRUCTURE");
  }
  return access;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  try {
    await requireStructure(schoolId);
    const result = await getDb().execute(sql`
      select
        branch.id,
        branch.name,
        branch.code,
        branch.is_headquarters,
        branch.status::text as status,
        branch.address,
        assignment.membership_id,
        user_account.full_name as administrator_name,
        user_account.email as administrator_email,
        membership.status::text as membership_status,
        coalesce(password_state.has_password, false) as has_password
      from school_branches branch
      left join lateral (
        select a.membership_id
        from school_branch_admin_assignments a
        where a.school_id = branch.school_id
          and a.branch_id = branch.id
          and a.is_active = true
        order by a.created_at asc
        limit 1
      ) assignment on true
      left join school_memberships membership
        on membership.school_id = branch.school_id
       and membership.id = assignment.membership_id
      left join users user_account
        on user_account.id = membership.user_id
      left join lateral (
        select exists(
          select 1 from auth_password_credentials credential
          where credential.user_id = user_account.id
        ) as has_password
      ) password_state on true
      where branch.school_id = ${schoolId}::uuid
      order by branch.is_headquarters desc, branch.name asc
    `);
    return NextResponse.json({ branches: rowsOf(result) }, { headers: casaInternalNoStoreHeaders });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  try {
    const access = await requireStructure(schoolId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: "Check the branch name and code." }, { status: 400, headers: casaInternalNoStoreHeaders });
    }
    const id = randomUUID();
    try {
      await getDb().execute(sql`
        insert into school_branches(id,school_id,name,code,is_headquarters,status,address)
        values(${id}::uuid,${schoolId}::uuid,${parsed.data.name},${parsed.data.code},false,'ACTIVE',${parsed.data.address ?? null})
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("school_branches_school_code_unique") || message.includes("school_branches_school_name_unique")) {
        return NextResponse.json({ message: "A branch with that name or code already exists in this school." }, { status: 409, headers: casaInternalNoStoreHeaders });
      }
      throw error;
    }
    await writeCasaInternalAudit({ access, schoolId, action: "INTERNAL_BRANCH_CREATED", subjectType: "SCHOOL_BRANCH", subjectId: id, metadata: { name: parsed.data.name, code: parsed.data.code } });
    return NextResponse.json({ created: true, id }, { status: 201, headers: casaInternalNoStoreHeaders });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  try {
    const access = await requireStructure(schoolId);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: "Check the Branch Admin setup request." }, { status: 400, headers: casaInternalNoStoreHeaders });
    }
    const db = getDb();
    const branch = rowsOf<{ id: string; name: string; is_headquarters: boolean; status: string }>(await db.execute(sql`
      select id,name,is_headquarters,status::text as status from school_branches
      where school_id=${schoolId}::uuid and id=${parsed.data.branchId}::uuid limit 1
    `))[0];
    if (!branch || branch.is_headquarters || branch.status !== "ACTIVE") {
      return NextResponse.json({ message: "Select an active non-HQ branch." }, { status: 409, headers: casaInternalNoStoreHeaders });
    }

    if (parsed.data.action === "REISSUE_ADMIN_SETUP") {
      const existing = rowsOf<{ user_id: string; full_name: string; email: string | null; has_password: boolean }>(await db.execute(sql`
        select membership.user_id,user_account.full_name,user_account.email,
          exists(select 1 from auth_password_credentials credential where credential.user_id=membership.user_id) as has_password
        from school_branch_admin_assignments assignment
        join school_memberships membership on membership.school_id=assignment.school_id and membership.id=assignment.membership_id
        join users user_account on user_account.id=membership.user_id
        where assignment.school_id=${schoolId}::uuid and assignment.branch_id=${parsed.data.branchId}::uuid and assignment.is_active=true
        order by assignment.created_at asc limit 1
      `))[0];
      if (!existing) return NextResponse.json({ message: "This branch does not have an active Branch Admin yet." }, { status: 404, headers: casaInternalNoStoreHeaders });
      if (existing.has_password) return NextResponse.json({ message: "This Branch Admin account is already active; no setup link is required." }, { status: 409, headers: casaInternalNoStoreHeaders });

      const rawToken = randomBytes(32).toString("base64url");
      const hash = tokenHash(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.execute(sql`update casa_account_setup_tokens set used_at=now() where user_id=${existing.user_id}::uuid and used_at is null`);
      await db.execute(sql`
        insert into casa_account_setup_tokens(user_id,token_hash,purpose,created_by_internal_membership_id,expires_at)
        values(${existing.user_id}::uuid,${hash},'BRANCH_ADMIN',${access.membership.id}::uuid,${expiresAt.toISOString()}::timestamptz)
      `);
      await writeCasaInternalAudit({ access, schoolId, action: "INTERNAL_BRANCH_ADMIN_SETUP_REISSUED", subjectType: "SCHOOL_BRANCH", subjectId: parsed.data.branchId, metadata: { branchAdminUserId: existing.user_id } });
      const origin = new URL(request.url).origin;
      const setup = {
        url: `${origin}/account/setup?token=${encodeURIComponent(rawToken)}`,
        expiresAt: expiresAt.toISOString(),
      };
      const emailDelivery = await sendAccountAccessEmail({
        email: existing.email,
        recipientName: existing.full_name,
        organizationName: access.school.name,
        actionLabel: "Set up Branch Admin access",
        actionUrl: setup.url,
        expiresAt,
        context: `${access.school.name} created a new private Branch Admin setup link for ${branch.name}.`,
      });
      return NextResponse.json({ emailDelivery, administrator: { fullName: existing.full_name, email: existing.email, setup } }, { headers: casaInternalNoStoreHeaders });
    }

    const identity = normalizeLoginIdentifier(parsed.data.email);
    if (!identity || identity.kind !== "EMAIL") {
      return NextResponse.json({ message: "Enter a valid Branch Admin email." }, { status: 400, headers: casaInternalNoStoreHeaders });
    }
    const assigned = rowsOf<{ id: string }>(await db.execute(sql`
      select id from school_branch_admin_assignments where school_id=${schoolId}::uuid and branch_id=${parsed.data.branchId}::uuid and is_active=true limit 1
    `))[0];
    if (assigned) return NextResponse.json({ message: "This branch already has an active Branch Admin." }, { status: 409, headers: casaInternalNoStoreHeaders });

    const owner = rowsOf<{ id: string }>(await db.execute(sql`
      select membership.id from school_memberships membership
      join school_membership_roles role on role.school_id=membership.school_id and role.membership_id=membership.id
      where membership.school_id=${schoolId}::uuid and membership.status='ACTIVE' and role.role='OWNER' limit 1
    `))[0];
    if (!owner) return NextResponse.json({ message: "The school must have an active Owner before CASA can provision a Branch Admin." }, { status: 409, headers: casaInternalNoStoreHeaders });

    const user = rowsOf<{ id: string; full_name: string; status: string; has_password: boolean }>(await db.execute(sql`
      select user_account.id,user_account.full_name,user_account.status::text as status,
        exists(select 1 from auth_password_credentials credential where credential.user_id=user_account.id) as has_password
      from users user_account where user_account.email=${identity.value} limit 1
    `))[0];
    if (user && user.status !== "ACTIVE") return NextResponse.json({ message: "That email belongs to an inactive CASA identity." }, { status: 409, headers: casaInternalNoStoreHeaders });

    const existingMembership = user ? rowsOf<{ id: string; is_owner: boolean }>(await db.execute(sql`
      select membership.id,
        exists(select 1 from school_membership_roles role where role.school_id=membership.school_id and role.membership_id=membership.id and role.role='OWNER') as is_owner
      from school_memberships membership where membership.school_id=${schoolId}::uuid and membership.user_id=${user.id}::uuid limit 1
    `))[0] : undefined;
    if (existingMembership?.is_owner) return NextResponse.json({ message: "The School Owner cannot be reused as a Branch Admin." }, { status: 409, headers: casaInternalNoStoreHeaders });

    const userId = user?.id ?? randomUUID();
    const membershipId = existingMembership?.id ?? randomUUID();
    const needsSetup = !user || !user.has_password;
    const rawToken = needsSetup ? randomBytes(32).toString("base64url") : null;
    const hash = rawToken ? tokenHash(rawToken) : null;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const client = neon(getDatabaseUrl());
    const statements = [];

    if (!user) statements.push(client`
      insert into users(id,full_name,email,phone,status)
      values(${userId}::uuid,${parsed.data.fullName},${identity.value},null,'ACTIVE')
    `);
    if (!existingMembership) statements.push(client`
      insert into school_memberships(id,school_id,user_id,status,joined_at)
      values(${membershipId}::uuid,${schoolId}::uuid,${userId}::uuid,'ACTIVE',now())
    `);
    else statements.push(client`
      update school_memberships set status='ACTIVE'::school_membership_status,updated_at=now()
      where school_id=${schoolId}::uuid and id=${membershipId}::uuid
    `);
    statements.push(client`
      insert into school_membership_roles(id,school_id,membership_id,role)
      values(${randomUUID()}::uuid,${schoolId}::uuid,${membershipId}::uuid,'ADMIN')
      on conflict(membership_id,role) do nothing
    `);
    statements.push(client`
      insert into school_branch_admin_assignments(id,school_id,branch_id,membership_id,is_active,assigned_by_membership_id,created_at,updated_at)
      values(${randomUUID()}::uuid,${schoolId}::uuid,${parsed.data.branchId}::uuid,${membershipId}::uuid,true,${owner.id}::uuid,now(),now())
      on conflict(school_id,branch_id,membership_id) do update set is_active=true,assigned_by_membership_id=excluded.assigned_by_membership_id,updated_at=now()
    `);
    if (needsSetup && hash) {
      statements.push(client`update casa_account_setup_tokens set used_at=now() where user_id=${userId}::uuid and used_at is null`);
      statements.push(client`
        insert into casa_account_setup_tokens(user_id,token_hash,purpose,created_by_internal_membership_id,expires_at)
        values(${userId}::uuid,${hash},'BRANCH_ADMIN',${access.membership.id}::uuid,${expiresAt.toISOString()}::timestamptz)
      `);
    }
    await client.transaction(statements);
    await writeCasaInternalAudit({ access, schoolId, action: "INTERNAL_BRANCH_ADMIN_PROVISIONED", subjectType: "SCHOOL_BRANCH", subjectId: parsed.data.branchId, metadata: { branchAdminUserId: userId, branchAdminMembershipId: membershipId, branchAdminExistingIdentity: Boolean(user), setupRequired: Boolean(rawToken) } });
    const origin = new URL(request.url).origin;
    const setup = rawToken ? {
      url: `${origin}/account/setup?token=${encodeURIComponent(rawToken)}`,
      expiresAt: expiresAt.toISOString(),
    } : null;
    const emailDelivery = await sendAccountAccessEmail({
      email: identity.value,
      recipientName: user?.full_name ?? parsed.data.fullName,
      organizationName: access.school.name,
      actionLabel: setup ? "Set up Branch Admin access" : "Sign in to CASA",
      actionUrl: setup?.url ?? `${origin}/login?school=${encodeURIComponent(access.school.slug)}`,
      expiresAt: setup ? expiresAt : null,
      context: `${access.school.name} granted you Branch Admin access for ${branch.name}.`,
    });
    return NextResponse.json({ emailDelivery, administrator: { fullName: user?.full_name ?? parsed.data.fullName, email: identity.value, existingIdentity: Boolean(user), setup } }, { status: existingMembership ? 200 : 201, headers: casaInternalNoStoreHeaders });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
