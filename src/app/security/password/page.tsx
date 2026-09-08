import PasswordChangeClient from "./password-change-client";

interface PasswordSecurityPageProps {
  searchParams:
    Promise<{
      school?: string;
      next?: string;
    }>;
}

export default async function PasswordSecurityPage(
  {
    searchParams,
  }:
    PasswordSecurityPageProps,
) {
  const query =
    await searchParams;

  const schoolSlug =
    query.school
      ?.trim()
      .toLowerCase() ??
    "";

  return (
    <PasswordChangeClient
      schoolSlug={schoolSlug}
      nextPath={query.next ?? ""}
    />
  );
}
