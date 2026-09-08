import Link from "next/link";

import { PasskeyManager } from "./passkey-manager";

export default function PasskeySecurityPage() {
  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="flex min-h-[44vh] flex-col justify-between border-b border-black/15 px-6 py-6 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-12 lg:py-10">
          <header className="flex items-center justify-between gap-5">
            <Link href="/" className="casa-kicker hover:underline">
              CASA
            </Link>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">
              Account security
            </p>
          </header>

          <div className="py-12 lg:py-0">
            <p className="casa-kicker text-black/40">
              Passkeys
            </p>
            <h1 className="casa-display-compact mt-5 max-w-[8ch]">
              DEVICE
              <br />
              TRUST
            </h1>
            <p className="mt-7 max-w-md text-sm leading-6 text-black/50">
              Your device becomes part of the approval for sensitive CASA
              operations.
            </p>
          </div>

          <div className="hidden border-t border-black/15 lg:block">
            {[
              ["01", "Register", "Create a Passkey with a device authenticator."],
              ["02", "Step up", "Approve a protected operation with a fresh Passkey check."],
              ["03", "Audit", "Keep the action tied to the authenticated actor and scope."],
            ].map(([index, title, copy]) => (
              <div key={index} className="grid grid-cols-[42px_1fr] gap-3 border-b border-black/15 py-4">
                <span className="font-mono text-[10px] text-black/35">{index}</span>
                <span>
                  <strong className="block text-sm">{title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-black/45">{copy}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex items-center bg-white px-6 py-10 lg:min-h-screen lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-2xl">
            <p className="casa-kicker text-black/40">
              Security model
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              Your CASA authenticators.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-black/50">
              Passkeys are separate from ordinary password entry and may be
              requested again when a protected action needs fresh authorization.
            </p>
            <div className="mt-9 border-t border-black pt-7">
              <PasskeyManager />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
