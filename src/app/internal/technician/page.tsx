import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import {
  requireCasaInternalAccess,
} from "@/server/internal/authorization";

export default async function CasaTeamTechnicianPage() {
  try {
    await requireCasaInternalAccess();
  } catch (error) {
    if (
      error instanceof
        Error &&
      (
        error.name ===
          "AuthRequiredError" ||
        error.name ===
          "CasaInternalAuthRequiredError"
      )
    ) {
      redirect(
        "/login",
      );
    }

    throw error;
  }

  const operations = [
    {
      index:
        "01",
      title:
        "Student onboarding",
      description:
        "Search schools, complete identity records, link guardians, assign class/session and capture face.",
      href:
        "/internal/onboarding",
      action:
        "Open onboarding",
    },
    {
      index:
        "02",
      title:
        "Scanner rollout",
      description:
        "Open the dedicated Scanner PWA for installation and device QA. Terminal provisioning remains school-scoped and Passkey-protected.",
      href:
        "/scanner",
      action:
        "Open scanner",
    },
    {
      index:
        "03",
      title:
        "Account security",
      description:
        "Manage your own CASA Passkeys used for secure sign-in and sensitive field operations.",
      href:
        "/security/passkeys",
      action:
        "Manage Passkeys",
    },
  ];

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1700px] grid-cols-1 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="flex min-h-[44vh] flex-col justify-between border-b border-black/15 px-6 py-6 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-12 lg:py-10">
          <header className="flex items-center justify-between gap-5">
            <p className="casa-kicker">CASA</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">
              Internal technical
            </p>
          </header>
          <div className="py-12 lg:py-0">
            <p className="casa-kicker text-black/40">Field operations</p>
            <h1 className="casa-display-compact mt-5 max-w-[8ch]">
              FIELD
              <br />
              OPS
            </h1>
            <p className="mt-7 max-w-md text-sm leading-6 text-black/50">
              CASA Team operations remain separate from each school&apos;s own
              School Technician workspace.
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/35">
            Internal authority / CASA
          </p>
        </aside>

        <section className="flex flex-col justify-between bg-white px-6 py-8 lg:min-h-screen lg:px-12 lg:py-10">
          <div className="flex items-center justify-between">
            <p className="casa-kicker text-black/40">Operations</p>
            <Link href="/security/passkeys" className="font-mono text-[9px] uppercase tracking-[0.09em] text-black/40 underline underline-offset-4">
              Account security
            </Link>
          </div>

          <div className="my-10">
            <h2 className="max-w-[12ch] text-4xl font-semibold tracking-[-0.06em] sm:text-5xl lg:text-6xl">
              Choose the field operation.
            </h2>
            <div className="mt-10 divide-y divide-black/15 border-y border-black">
              {operations.map((operation) => (
                <Link
                  key={operation.index}
                  href={operation.href}
                  className="grid min-h-32 grid-cols-[3rem_1fr_auto] items-center gap-4 py-6 transition hover:bg-[#f2f2ef]"
                >
                  <span className="font-mono text-[10px] text-black/30">
                    {operation.index}
                  </span>
                  <span>
                    <span className="block text-2xl font-semibold tracking-[-0.04em]">
                      {operation.title}
                    </span>
                    <span className="mt-2 block max-w-xl text-sm leading-6 text-black/45">
                      {operation.description}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl">→</span>
                </Link>
              ))}
            </div>
          </div>

          <p className="max-w-xl text-xs leading-5 text-black/30">
            School-scoped technician work remains under the selected school;
            internal CASA authority is never substituted for school ownership.
          </p>
        </section>
      </div>
    </main>
  );
}
