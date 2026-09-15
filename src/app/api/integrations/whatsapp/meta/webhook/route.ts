import { createHmac, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode") ?? "";
  const token = request.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge") ?? "";
  const configured = process.env.CASA_WHATSAPP_META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";

  if (!configured || mode !== "subscribe" || !secureEqual(token, configured)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

function collectStatuses(body: unknown) {
  const statuses: Array<{
    id: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
  }> = [];

  if (!body || typeof body !== "object") return statuses;
  const entries = Array.isArray((body as { entry?: unknown }).entry)
    ? (body as { entry: unknown[] }).entry
    : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const current = Array.isArray((value as { statuses?: unknown }).statuses)
        ? (value as { statuses: unknown[] }).statuses
        : [];
      for (const status of current) {
        if (!status || typeof status !== "object") continue;
        const id = typeof (status as { id?: unknown }).id === "string"
          ? (status as { id: string }).id.trim()
          : "";
        const state = typeof (status as { status?: unknown }).status === "string"
          ? (status as { status: string }).status.trim().toLowerCase()
          : "";
        if (!id || !state) continue;
        const errors = Array.isArray((status as { errors?: unknown }).errors)
          ? (status as { errors: unknown[] }).errors
          : [];
        const first = errors[0];
        const errorCode = first && typeof first === "object" && (first as { code?: unknown }).code != null
          ? String((first as { code: unknown }).code).slice(0, 80)
          : null;
        const errorMessage = first && typeof first === "object" && typeof (first as { title?: unknown }).title === "string"
          ? (first as { title: string }).title.slice(0, 500)
          : null;
        statuses.push({ id, status: state, errorCode, errorMessage });
      }
    }
  }
  return statuses;
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.CASA_WHATSAPP_META_APP_SECRET?.trim() ?? "";
  if (!appSecret) {
    return NextResponse.json({ message: "Webhook app secret is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const supplied = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (!secureEqual(supplied, expected)) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid webhook JSON." }, { status: 400 });
  }

  const db = getDb();
  const statuses = collectStatuses(body);
  let updated = 0;

  for (const item of statuses) {
    if (item.status === "failed") {
      const result = await db.execute(sql`
        update school_notification_outbox
        set
          status = 'FAILED'::school_notification_delivery_status,
          locked_at = null,
          last_error_code = ${item.errorCode ?? "META_DELIVERY_FAILED"},
          last_error_message = ${item.errorMessage ?? "Meta reported delivery failure."},
          updated_at = now()
        where provider_message_id = ${item.id}
        returning id
      `);
      if (Array.isArray(result) ? result.length : "rows" in Object(result) && Array.isArray((result as { rows?: unknown[] }).rows) ? (result as { rows: unknown[] }).rows.length : 0) {
        updated += 1;
      }
      continue;
    }

    if (["sent", "delivered", "read"].includes(item.status)) {
      await db.execute(sql`
        update school_notification_outbox
        set
          status = 'SENT'::school_notification_delivery_status,
          sent_at = coalesce(sent_at, now()),
          locked_at = null,
          last_error_code = null,
          last_error_message = null,
          updated_at = now()
        where provider_message_id = ${item.id}
      `);
      updated += 1;
    }
  }

  return NextResponse.json({ ok: true, received: statuses.length, updated });
}
