"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type BrandingData = {
  organizationAdmin: boolean;
  school: {
    id: string;
    name: string;
    schoolLogoConfigured: boolean;
    logoUrl: string;
  };
  branches: Array<{
    id: string;
    name: string;
    code: string;
    branchLogoConfigured: boolean;
    logoUrl: string;
  }>;
};

async function jsonBody(
  response: Response,
) {
  return response
    .json()
    .catch(
      () => ({}),
    ) as Promise<
    Record<
      string,
      unknown
    >
  >;
}

export default function NotificationBrandingClient({
  slug,
  schoolName,
}: {
  slug: string;
  schoolName: string;
}) {
  const endpoint =
    useMemo(
      () =>
        `/api/schools/${encodeURIComponent(
          slug,
        )}/notification-branding`,
      [
        slug,
      ],
    );
  const [
    data,
    setData,
  ] =
    useState<
      BrandingData |
      null
    >(
      null,
    );
  const [
    schoolFile,
    setSchoolFile,
  ] =
    useState<
      File |
      null
    >(
      null,
    );
  const [
    branchFiles,
    setBranchFiles,
  ] =
    useState<
      Record<
        string,
        File |
        null
      >
    >(
      {},
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      "",
    );
  const [
    notice,
    setNotice,
  ] =
    useState(
      "",
    );
  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const load =
    useCallback(
      async () => {
        const response =
          await fetch(
            endpoint,
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );
        const body =
          await jsonBody(
            response,
          );

        if (!response.ok) {
          throw new Error(
            typeof body.message ===
              "string"
              ? body.message
              : "Notification branding could not be loaded.",
          );
        }

        setData(
          body as unknown as
            BrandingData,
        );
      },
      [
        endpoint,
      ],
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void load().catch(
              (
                cause,
              ) =>
                setError(
                  cause instanceof
                    Error
                    ? cause.message
                    : "Notification branding could not be loaded.",
                ),
            );
          },
          0,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [
      load,
    ],
  );

  async function upload(
    scope:
      | "SCHOOL"
      | "BRANCH",
    branchId:
      string |
      null,
    file:
      File |
      null,
  ) {
    if (!file) {
      setError(
        "Choose a logo first.",
      );
      return;
    }

    if (
      file.size >
      3 * 1024 * 1024
    ) {
      setError(
        "Logo must be 3 MB or smaller.",
      );
      return;
    }

    const key =
      scope ===
        "SCHOOL"
        ? "school"
        : branchId ??
          "branch";

    setBusy(
      key,
    );
    setNotice(
      "",
    );
    setError(
      "",
    );

    try {
      const form =
        new FormData();
      form.set(
        "logo",
        file,
      );
      form.set(
        "scope",
        scope,
      );

      if (branchId) {
        form.set(
          "branchId",
          branchId,
        );
      }

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",
            credentials:
              "same-origin",
            body:
              form,
          },
        );
      const body =
        await jsonBody(
          response,
        );

      if (!response.ok) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Notification logo could not be saved.",
        );
      }

      if (
        scope ===
        "SCHOOL"
      ) {
        setSchoolFile(
          null,
        );
        setNotice(
          "Whole-school notification logo saved.",
        );
      } else {
        setBranchFiles(
          (
            current,
          ) => ({
            ...current,
            [
              branchId ??
              ""
            ]:
              null,
          }),
        );
        setNotice(
          "Campus notification logo saved.",
        );
      }

      await load();
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Notification logo could not be saved.",
      );
    } finally {
      setBusy(
        "",
      );
    }
  }

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Notification branding
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              {schoolName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              Set the trusted school logo used by guardian notification links, invitation email branding and the installed guardian notification app.
            </p>
          </div>

          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/messaging`}
            >
              Messaging
            </Link>
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/registry`}
            >
              Registry
            </Link>
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/attendance`}
            >
              Attendance
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8">
        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            Installed app identity
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            School-branded guardian notifications
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/50">
            CASA uses the campus logo when one is configured, then the whole-school logo, then a school-initials fallback. The installed app name remains the school name; the generic CASA scanner icon is not used for guardian installs.
          </p>
          <p className="mt-2 text-xs text-black/40">
            CASA normalizes the uploaded image to a 512 × 512 PNG. Maximum upload size: 3 MB.
          </p>
        </section>

        {error ? (
          <p className="mt-5 border border-[#7e1d18] bg-white p-4 text-sm text-[#7e1d18]">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="mt-5 border border-[#145a3b] bg-white p-4 text-sm text-[#145a3b]">
            {notice}
          </p>
        ) : null}

        <section className="mt-5 border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            Whole-school fallback
          </p>

          <div className="mt-4 grid gap-5 md:grid-cols-[140px_minmax(0,1fr)] md:items-center">
            <div className="flex h-32 w-32 items-center justify-center border border-black/20 bg-[#f7f7f4] p-2">
              {data ? (
                <img
                  alt={`${schoolName} notification logo`}
                  className="max-h-full max-w-full object-contain"
                  src={
                    data.school
                      .logoUrl
                  }
                />
              ) : null}
            </div>

            <div>
              <h2 className="text-xl font-semibold">
                School notification logo
              </h2>
              <p className="mt-2 text-sm text-black/50">
                {data
                  ?.school
                  .schoolLogoConfigured
                  ? "Custom school logo configured."
                  : "Using the school-initials fallback."}
              </p>

              {data
                ?.organizationAdmin ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    accept="image/*"
                    className="text-sm"
                    type="file"
                    onChange={(
                      event,
                    ) =>
                      setSchoolFile(
                        event
                          .target
                          .files?.[0] ??
                          null,
                      )
                    }
                  />
                  <button
                    className="casa-button-primary"
                    disabled={
                      busy ===
                        "school" ||
                      !schoolFile
                    }
                    onClick={() =>
                      void upload(
                        "SCHOOL",
                        null,
                        schoolFile,
                      )
                    }
                    type="button"
                  >
                    {busy ===
                    "school"
                      ? "Saving..."
                      : "Save school logo"}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-black/45">
                  Whole-school fallback branding is managed by organization authority.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">
              Campus branding
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Branch notification logos
            </h2>
            <p className="mt-2 text-sm text-black/50">
              A campus logo overrides the whole-school fallback only for guardian links tied to that campus.
            </p>
          </div>

          {data?.branches.length ? (
            data.branches.map(
              (
                branch,
              ) => (
                <div
                  className="grid gap-5 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[110px_minmax(0,1fr)] md:items-center"
                  key={
                    branch.id
                  }
                >
                  <div className="flex h-24 w-24 items-center justify-center border border-black/20 bg-[#f7f7f4] p-2">
                    <img
                      alt={`${branch.name} notification logo`}
                      className="max-h-full max-w-full object-contain"
                      src={
                        branch.logoUrl
                      }
                    />
                  </div>

                  <div>
                    <p className="font-semibold">
                      {
                        branch.name
                      }
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-black/40">
                      {
                        branch.code
                      }{" "}
                      ·{" "}
                      {branch.branchLogoConfigured
                        ? "Campus logo configured"
                        : "Using school fallback"}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        accept="image/*"
                        className="text-sm"
                        type="file"
                        onChange={(
                          event,
                        ) =>
                          setBranchFiles(
                            (
                              current,
                            ) => ({
                              ...current,
                              [
                                branch.id
                              ]:
                                event
                                  .target
                                  .files?.[0] ??
                                null,
                            }),
                          )
                        }
                      />
                      <button
                        className="casa-button"
                        disabled={
                          busy ===
                            branch.id ||
                          !branchFiles[
                            branch.id
                          ]
                        }
                        onClick={() =>
                          void upload(
                            "BRANCH",
                            branch.id,
                            branchFiles[
                              branch.id
                            ] ??
                              null,
                          )
                        }
                        type="button"
                      >
                        {busy ===
                        branch.id
                          ? "Saving..."
                          : "Save campus logo"}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )
          ) : (
            <p className="p-5 text-sm text-black/45">
              No campus is available in your current branding scope.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
