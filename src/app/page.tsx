import Link from "next/link";

export default function Home() {
  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1700px] grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="flex min-h-[62vh] flex-col justify-between border-b border-black/15 px-6 py-6 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-12 lg:py-10 xl:px-16">
          <header className="flex items-center justify-between gap-6">
            <p className="casa-kicker">
              CASA
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">
              School operations
            </p>
          </header>

          <div className="py-14 lg:py-0">
            <p className="casa-kicker text-black/40">
              Identity · Registry · Attendance
            </p>
            <h1 className="mt-6 text-[clamp(4.8rem,13vw,12rem)] font-semibold leading-[0.73] tracking-[-0.09em]">
              SCHOOL
              <br />
              OPS
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-black/55">
              One operational source for student identity, guardians,
              enrollment, cards and verified attendance.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] uppercase tracking-[0.08em] text-black/35">
            <span>Student identity</span>
            <span>Verified attendance</span>
            <span>School records</span>
          </div>
        </section>

        <section className="flex min-h-[38vh] flex-col justify-between bg-white px-6 py-8 lg:min-h-screen lg:px-12 lg:py-10 xl:px-16">
          <div className="flex items-center justify-between">
            <p className="casa-kicker text-black/40">
              Access
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/30">
              Choose workspace
            </p>
          </div>

          <div className="my-10 lg:my-0">
            <h2 className="max-w-[12ch] text-4xl font-semibold tracking-[-0.06em] sm:text-5xl lg:text-6xl">
              Enter the right CASA workspace.
            </h2>

            <div className="mt-10 divide-y divide-black/15 border-y border-black">
              {[
                [
                  "01",
                  "School workspace",
                  "Registry, people, identity and attendance administration.",
                  "/login",
                ],
                [
                  "02",
                  "Attendance terminal",
                  "Device-bound card, face, liveness and attendance verification.",
                  "/scanner",
                ],
                [
                  "03",
                  "Account security",
                  "Register and review Passkeys used for secure CASA actions.",
                  "/security/passkeys",
                ],
              ].map(([index, title, copy, href]) => (
                <Link
                  key={index}
                  href={href}
                  className="grid min-h-32 grid-cols-[3rem_1fr_auto] items-center gap-4 py-6 transition hover:bg-[#f2f2ef]"
                >
                  <span className="font-mono text-[10px] text-black/30">
                    {index}
                  </span>
                  <span>
                    <span className="block text-2xl font-semibold tracking-[-0.04em]">
                      {title}
                    </span>
                    <span className="mt-2 block max-w-md text-sm leading-6 text-black/45">
                      {copy}
                    </span>
                  </span>
                  <span className="text-xl" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <p className="max-w-lg text-xs leading-5 text-black/30">
            CASA keeps each school scoped to its own people and operations while
            preserving a common identity, security and attendance model.
          </p>
        </section>
      </div>
    </main>
  );
}
