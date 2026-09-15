import { redirect } from "next/navigation";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

import MessagingClient from "./messaging-client";

async function requireMessagingAccess(slug: string) {
  try {
    return await requireSchoolRole(slug, ["OWNER", "ADMIN"]);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirect(`/login?school=${encodeURIComponent(slug)}`);
    }
    if (error instanceof SchoolAccessDeniedError) {
      redirect(`/schools/${encodeURIComponent(slug)}/attendance`);
    }
    throw error;
  }
}

export default async function MessagingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await requireMessagingAccess(slug);
  return <MessagingClient slug={slug} schoolName={access.school.name} />;
}
