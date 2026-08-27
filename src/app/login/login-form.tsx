"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  initialSchoolSlug: string;
}

export function LoginForm({
  initialSchoolSlug,
}: LoginFormProps) {
  const router = useRouter();
  const [schoolSlug, setSchoolSlug] =
    useState(initialSchoolSlug);
  const [identifier, setIdentifier] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [error, setError] =
    useState<string | null>(null);
  const [busy, setBusy] =
    useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            identifier,
            password,
          }),
        },
      );

      const body =
        (await response.json()) as {
          message?: string;
        };

      if (!response.ok) {
        setError(
          body.message ??
            "Unable to sign in.",
        );
        return;
      }

      const normalizedSlug =
        schoolSlug
          .trim()
          .toLowerCase();

      if (!normalizedSlug) {
        setError(
          "Enter your school workspace slug.",
        );
        return;
      }

      router.push(
        `/schools/${encodeURIComponent(
          normalizedSlug,
        )}/registry`,
      );
      router.refresh();
    } catch {
      setError(
        "Unable to reach CASA School.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={submit}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          School workspace
        </span>
        <input
          required
          value={schoolSlug}
          onChange={(event) =>
            setSchoolSlug(
              event.target.value,
            )
          }
          placeholder="school-slug"
          autoComplete="organization"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Email or phone
        </span>
        <input
          required
          value={identifier}
          onChange={(event) =>
            setIdentifier(
              event.target.value,
            )
          }
          autoComplete="username"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Password
        </span>
        <input
          required
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(
              event.target.value,
            )
          }
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
        />
      </label>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <button
        disabled={busy}
        className="w-full rounded-xl bg-slate-950 px-4 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
      >
        {busy
          ? "Signing inâ€¦"
          : "Sign in"}
      </button>
    </form>
  );
}