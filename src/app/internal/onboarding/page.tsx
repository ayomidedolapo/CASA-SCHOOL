import {
  redirect,
} from "next/navigation";

import {
  isAuthRequiredError,
  requireCasaInternalAccess,
} from "@/server/internal/authorization";

import InternalOnboardingClient from "./onboarding-client";

export default async function InternalOnboardingPage() {
  let access: Awaited<ReturnType<typeof requireCasaInternalAccess>>;

  try {
    access = await requireCasaInternalAccess();
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect("/login?next=%2Finternal%2Fonboarding");
    }
    throw error;
  }

  return (
    <InternalOnboardingClient
      actorName={access.session.fullName}
      role={access.membership.role}
    />
  );
}
