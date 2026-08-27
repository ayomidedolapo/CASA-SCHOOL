import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<{
    school?: string;
  }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params =
    await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
            CASA School
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-tight">
            One secure school workspace for identity, enrollment and attendance.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            The registry becomes the source of truth for every student, guardian and school-issued identity record.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="mb-8">
            <p className="text-sm font-medium text-slate-500">
              School administration
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Sign in to CASA School
            </h2>
          </div>

          <LoginForm
            initialSchoolSlug={
              params.school ?? ""
            }
          />
        </section>
      </div>
    </main>
  );
}