import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import type { CasaSchoolHealth } from "@/types/health";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const db = getDb();

    await db.execute(sql`select 1`);

    const body: CasaSchoolHealth = {
      status: "HEALTHY",
      application: {
        status: "HEALTHY",
      },
      database: {
        status: "HEALTHY",
      },
      checkedAt,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: noStoreHeaders,
    });
  } catch {
    const body: CasaSchoolHealth = {
      status: "DEGRADED",
      application: {
        status: "HEALTHY",
      },
      database: {
        status: "UNAVAILABLE",
      },
      checkedAt,
    };

    return NextResponse.json(body, {
      status: 503,
      headers: noStoreHeaders,
    });
  }
}