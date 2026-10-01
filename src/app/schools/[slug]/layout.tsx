import {
  getCurrentCalendarClosure,
} from "@/server/school-operations/calendar-closure";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

import SchoolCalendarNotice from "./school-calendar-notice";

interface SchoolLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    slug: string;
  }>;
}

export default async function SchoolLayout(
  {
    children,
    params,
  }:
    SchoolLayoutProps,
) {
  const {
    slug,
  } =
    await params;

  let initialClosure:
    Awaited<
      ReturnType<
        typeof getCurrentCalendarClosure
      >
    > =
      null;

  try {
    const visibility =
      await listVisibleBranches(
        slug,
      );
    const branchIds =
      (
        visibility.branches as
          Array<{
            id: string;
          }>
      ).map(
        (branch) =>
          String(
            branch.id,
          ),
      );

    initialClosure =
      await getCurrentCalendarClosure({
        schoolId:
          visibility.access.school.id,
        timezone:
          visibility.access.school.timezone,
        branchIds,
      });
  } catch {
    // Authentication/access handling remains owned by each school page.
  }

  return (
    <>
      {children}
      <SchoolCalendarNotice
        slug={
          slug
        }
        initialClosure={
          initialClosure
        }
      />
    </>
  );
}
