import { redirect } from "next/navigation";
import { AuthRequiredError, SchoolAccessDeniedError, requireSchoolAccess } from "@/server/auth/authorization";
import NotificationsClient from "./notifications-client";

export default async function SchoolNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let access: Awaited<ReturnType<typeof requireSchoolAccess>>;

  try {
    access = await requireSchoolAccess(slug);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirect(`/login?school=${encodeURIComponent(slug)}&next=${encodeURIComponent(`/schools/${slug}/notifications`)}`);
    }
    if (error instanceof SchoolAccessDeniedError) {
      redirect(`/schools/${encodeURIComponent(slug)}/attendance`);
    }
    throw error;
  }

  const canBrand = access.roles.some((role) => role === "OWNER" || role === "ADMIN");

  return (
    <NotificationsClient
      slug={slug}
      schoolId={access.school.id}
      schoolName={access.school.name}
      canBrand={canBrand}
    />
  );
}
