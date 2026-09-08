"use client";

import {
  type FormEvent,
  useState,
} from "react";
import Link from "next/link";
import {
  useRouter,
} from "next/navigation";

type JsonBody = {
  message?: string;
  roles?: string[];
};

function safeNextPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "";

  return value === "/internal" ||
    value.startsWith("/internal/") ||
    value.startsWith("/schools/") ||
    value.startsWith("/security/")
    ? value
    : "";
}

export default function PasswordChangeClient(
  {
    schoolSlug,
    nextPath,
  }: {
    schoolSlug: string;
    nextPath: string;
  },
) {
  const router =
    useRouter();

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState("");

  const [
    newPassword,
    setNewPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  async function continueToWorkspace() {
    const destination =
      safeNextPath(nextPath);

    if (destination) {
      router.push(destination);
      router.refresh();
      return;
    }

    if (!schoolSlug) {
      router.push(
        "/",
      );
      return;
    }

    const response =
      await fetch(
        `/api/schools/${encodeURIComponent(
          schoolSlug,
        )}/access`,
        {
          cache:
            "no-store",
        },
      );

    const body =
      (await response
        .json()
        .catch(
          () =>
            ({}),
        )) as JsonBody;

    if (
      !response.ok ||
      !Array.isArray(
        body.roles,
      )
    ) {
      router.push(
        `/login?school=${encodeURIComponent(
          schoolSlug,
        )}`,
      );
      return;
    }

    if (
      body.roles.includes(
        "OWNER",
      ) ||
      body.roles.includes(
        "ADMIN",
      )
    ) {
      router.push(
        `/schools/${encodeURIComponent(
          schoolSlug,
        )}/registry`,
      );
    } else if (
      body.roles.includes(
        "SCHOOL_TECHNICIAN",
      )
    ) {
      router.push(
        `/schools/${encodeURIComponent(
          schoolSlug,
        )}/technician`,
      );
    } else {
      router.push(
        `/schools/${encodeURIComponent(
          schoolSlug,
        )}/my-class`,
      );
    }

    router.refresh();
  }

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      "",
    );
    setSuccess(
      "",
    );

    if (
      newPassword !==
      confirmPassword
    ) {
      setError(
        "The new passwords do not match.",
      );
      return;
    }

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/auth/password/change",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                currentPassword,
                newPassword,
              }),
          },
        );

      const body =
        (await response
          .json()
          .catch(
            () =>
              ({}),
          )) as JsonBody;

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Unable to change password.",
        );
      }

      setSuccess(
        "Password changed. This temporary credential is no longer valid.",
      );

      setCurrentPassword(
        "",
      );
      setNewPassword(
        "",
      );
      setConfirmPassword(
        "",
      );

      await continueToWorkspace();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to change password.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="flex min-h-[44vh] flex-col justify-between border-b border-black/15 px-6 py-6 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-12 lg:py-10">
          <header className="flex items-center justify-between gap-5">
            <Link href="/" className="casa-kicker hover:underline">CASA</Link>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/35">Account security</p>
          </header>
          <div className="py-12 lg:py-0">
            <p className="casa-kicker text-black/40">Password</p>
            <h1 className="casa-display-compact mt-5 max-w-[8ch]">CHANGE<br />ACCESS</h1>
            <p className="mt-7 max-w-md text-sm leading-6 text-black/50">
              Replace a temporary credential with a password known only to you. Passkeys remain separate authenticators.
            </p>
          </div>
          <Link href="/security/passkeys" className="w-fit font-mono text-[9px] uppercase tracking-[0.1em] underline underline-offset-4">Manage Passkeys</Link>
        </aside>

        <section className="flex items-center bg-white px-6 py-10 lg:min-h-screen lg:px-12 lg:py-12">
          <form onSubmit={submit} className="mx-auto w-full max-w-xl">
            <p className="casa-kicker text-black/40">Security model</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Set your own password.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-black/50">
              Temporary staff passwords must be replaced before normal password access continues.
            </p>

            <div className="mt-9 border-t border-black pt-7">
              <label className="casa-label">
                <span>Current password</span>
                <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="casa-field" />
              </label>
              <label className="casa-label mt-5">
                <span>New password</span>
                <input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="casa-field" />
              </label>
              <label className="casa-label mt-5">
                <span>Confirm new password</span>
                <input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="casa-field" />
              </label>

              {error ? <div className="casa-error mt-5" role="alert">{error}</div> : null}
              {success ? <div className="mt-5 border-l-2 border-[#176b45] bg-[#e6f0ea] px-4 py-3 text-sm text-[#176b45]" role="status">{success}</div> : null}

              <button type="submit" disabled={busy} className="casa-button mt-6 w-full">
                {busy ? "Updating..." : "Save new password →"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
