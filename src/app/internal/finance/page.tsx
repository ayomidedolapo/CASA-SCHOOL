import { redirect } from "next/navigation";

import {
  CasaInternalAccessDeniedError,
  isAuthRequiredError,
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
import FinanceHub from "./finance-hub";

export default async function Page() {
  let access: Awaited<ReturnType<typeof requireCasaSuperAdmin>>;

  try {
    access = await requireCasaSuperAdmin();
  } catch (error) {
    if (isAuthRequiredError(error)) redirect("/internal/login");
    if (error instanceof CasaInternalAccessDeniedError) redirect("/internal");
    throw error;
  }

  return (
    <InternalShell
      actorName={access.session.fullName}
      role={access.membership.role}
      active="finance"
    >
      <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <p className="casa-kicker text-black/45">CASA / Finance</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
          Financial performance.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">
          Session agreements are the commercial source of truth. Finance then
          follows the agreement through invoicing, collection, costs, planning
          and accounting without returning to the old term-based pricing model.
        </p>
      </header>

      <FinanceHub />
    </InternalShell>
  );
}
