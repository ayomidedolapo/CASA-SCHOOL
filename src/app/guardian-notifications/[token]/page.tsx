import {
  createHash,
} from "node:crypto";
import type {
  Metadata,
} from "next";
import {
  headers,
} from "next/headers";
import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";

import GuardianNotificationClient from "./guardian-notification-client";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function digest(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      token,
      "utf8",
    )
    .digest(
      "hex",
    );
}

export async function generateMetadata(
  {
    params,
  }: {
    params:
      Promise<{
        token: string;
      }>;
  },
): Promise<Metadata> {
  const {
    token,
  } =
    await params;

  const rows =
    rowsOf<{
      school_id: string;
      school_name: string;
    }>(
      await getDb()
        .execute(sql`
          select
            school.id as school_id,
            school.name as school_name
          from guardian_push_enrollment_links link
          join schools school
            on school.id =
               link.school_id
          where
            link.token_hash =
              ${digest(
                token,
              )}
            and link.claimed_at is null
            and link.revoked_at is null
            and link.expires_at > now()
          limit 1
        `),
    );

  const invite =
    rows[0];

  if (!invite) {
    return {
      title:
        "Guardian notifications",
      description:
        "Private CASA guardian notification setup.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const headerList =
    await headers();
  const host =
    headerList.get(
      "x-forwarded-host",
    ) ??
    headerList.get(
      "host",
    );
  const proto =
    headerList.get(
      "x-forwarded-proto",
    ) ??
    "https";
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL
      ?.trim()
      .replace(
        /\/+$/,
        "",
      );
  const origin =
    host
      ? `${proto}://${host}`
      : configuredOrigin ??
        "https://casa-school.vercel.app";

  const logoUrl =
    `${origin}/api/public/schools/${encodeURIComponent(
      invite.school_id,
    )}/notification-logo`;

  const title =
    `${invite.school_name} · Guardian notification setup`;
  const description =
    `Private guardian notification setup from ${invite.school_name}. Use this link only if you expected it from the school.`;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
    icons: {
      icon:
        logoUrl,
      apple:
        logoUrl,
    },
    openGraph: {
      title,
      description,
      type:
        "website",
      images: [
        {
          url:
            logoUrl,
          width: 512,
          height: 512,
          alt:
            `${invite.school_name} logo`,
        },
      ],
    },
    twitter: {
      card:
        "summary",
      title,
      description,
      images: [
        logoUrl,
      ],
    },
  };
}

export default async function GuardianNotificationPage(
  {
    params,
  }: {
    params:
      Promise<{
        token: string;
      }>;
  },
) {
  const {
    token,
  } =
    await params;

  return (
    <GuardianNotificationClient
      token={token}
    />
  );
}
