import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";

interface Props { searchParams: Promise<{ denied?: string; setup?: string }>; }

export default async function InternalLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] md:grid-cols-[0.92fr_1.08fr]">
        <section className="flex min-h-[38vh] flex-col justify-between border-b border-black/15 bg-black px-6 py-6 text-white md:min-h-screen md:border-r md:border-b-0 md:px-10 md:py-9 lg:px-14">
          <header className="flex items-center justify-between gap-6">
            <Link href="/" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">CASA</Link>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Internal access</p>
          </header>
          <div className="py-12 md:py-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">CASA team</p>
            <h1 className="mt-5 max-w-[8ch] text-6xl font-semibold leading-[0.88] tracking-[-0.08em] sm:text-7xl lg:text-8xl">PLATFORM<br />CONTROL</h1>
          </div>
          <p className="hidden max-w-md text-sm leading-6 text-white/50 md:block">For CASA Super Admin and authorized CASA Team members. School staff use the school workspace sign-in.</p>
        </section>
        <section className="flex min-h-[62vh] items-center bg-white px-6 py-10 md:min-h-screen md:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-xl">
            <p className="casa-kicker text-black/45">CASA internal</p>
            <h2 className="mt-4 max-w-[11ch] text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Sign in to the platform console.</h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-black/50">No school workspace is required. Your internal CASA role determines what you can access.</p>
            {params.denied === "1" && <div className="mt-6 border-l-2 border-[#a12620] bg-[#f6e8e6] px-4 py-3 text-sm text-[#7e1d18]">This identity is not an active CASA internal account.</div>}
            {params.setup === "complete" && <div className="mt-6 border-l-2 border-[#176b45] bg-[#e8f2ec] px-4 py-3 text-sm text-[#145438]">First CASA Super Admin created. Sign in with the account you just configured.</div>}
            <div className="mt-8 border-t border-black/15 pt-7">
              <LoginForm initialSchoolSlug="" initialNextPath="/internal" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
