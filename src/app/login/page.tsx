import Link from "next/link";

import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<{
    school?: string;
    next?: string;
  }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params =
    await searchParams;

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[42vh] flex-col justify-between border-b border-black/15 px-6 py-6 md:min-h-screen md:border-r md:border-b-0 md:px-10 md:py-9 lg:px-14">
          <header className="flex items-center justify-between gap-6">
            <Link href="/" className="casa-kicker hover:underline">
              CASA
            </Link>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45">
              School access
            </p>
          </header>

          <div className="py-12 md:py-0">
            <p className="casa-kicker text-black/45">
              Authorized staff
            </p>
            <h1 className="casa-display mt-5 max-w-[7ch]">
              STAFF
              <br />
              ACCESS
            </h1>
          </div>

          <footer className="hidden items-end justify-between md:flex">
            <p className="max-w-[24rem] text-sm leading-6 text-black/55">
              One CASA identity. The school role attached to that identity
              determines the workspace you can open.
            </p>
            <p className="font-mono text-[10px] text-black/35">
              01 / AUTH
            </p>
          </footer>
        </section>

        <section className="flex min-h-[58vh] items-center bg-white px-6 py-10 md:min-h-screen md:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-xl">
            <p className="casa-kicker text-black/45">
              Sign in
            </p>
            <h2 className="mt-4 max-w-[12ch] text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
              Open your assigned school workspace.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-black/50">
              Use the school workspace slug and your own CASA password or
              Passkey. Shared devices are supported; shared identities are not.
            </p>
            <div className="mt-8 border-t border-black/15 pt-7">
              <LoginForm
                initialSchoolSlug={
                  params.school ?? ""
                }
                initialNextPath={
                  params.next ?? ""
                }
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
