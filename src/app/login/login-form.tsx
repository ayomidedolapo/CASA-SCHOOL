"use client";

import {
  type FormEvent,
  useState,
} from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  initialSchoolSlug: string;
  initialNextPath: string;
}

type LoginMethod =
  | "PASSWORD"
  | "PASSKEY";

type JsonBody = {
  message?: string;
  authenticated?: boolean;
  ceremonyId?: string;
  options?: unknown;
  mustChangePassword?: boolean;
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

export function LoginForm({
  initialSchoolSlug,
  initialNextPath,
}: LoginFormProps) {
  const router =
    useRouter();

  const nextPath =
    safeNextPath(
      initialNextPath,
    );

  const needsSchoolWorkspace =
    !nextPath.startsWith(
      "/internal",
    );

  const [
    method,
    setMethod,
  ] =
    useState<LoginMethod>(
      "PASSWORD",
    );

  const [
    schoolSlug,
    setSchoolSlug,
  ] =
    useState(
      initialSchoolSlug,
    );

  const [
    identifier,
    setIdentifier,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  function normalizedSchoolSlug() {
    return schoolSlug
      .trim()
      .toLowerCase();
  }

  async function routeAfterAuthentication(
    normalizedSlug: string,
  ) {
    const passwordStatusResponse =
      await fetch(
        "/api/auth/password/status",
        {
          cache:
            "no-store",
        },
      );

    const passwordStatus =
      (await passwordStatusResponse
        .json()
        .catch(
          () =>
            ({}),
        )) as JsonBody;

    if (
      passwordStatusResponse.ok &&
      passwordStatus
        .mustChangePassword
    ) {
      const query =
        new URLSearchParams();

      if (normalizedSlug) {
        query.set(
          "school",
          normalizedSlug,
        );
      }

      if (nextPath) {
        query.set(
          "next",
          nextPath,
        );
      }

      router.push(
        `/security/password?${query.toString()}`,
      );
      router.refresh();
      return;
    }

    if (nextPath) {
      router.push(nextPath);
      router.refresh();
      return;
    }

    const accessResponse =
      await fetch(
        `/api/schools/${encodeURIComponent(
          normalizedSlug,
        )}/access`,
        {
          cache:
            "no-store",
        },
      );

    const access =
      (await accessResponse
        .json()
        .catch(
          () =>
            ({}),
        )) as JsonBody;

    if (
      !accessResponse.ok ||
      !Array.isArray(
        access.roles,
      )
    ) {
      throw new Error(
        access.message ??
          "Your account does not have access to this school workspace.",
      );
    }

    const roles =
      access.roles;

    if (
      roles.includes(
        "OWNER",
      ) ||
      roles.includes(
        "ADMIN",
      )
    ) {
      router.push(
        `/schools/${encodeURIComponent(
          normalizedSlug,
        )}/registry`,
      );
    } else if (
      roles.includes(
        "SCHOOL_TECHNICIAN",
      )
    ) {
      router.push(
        `/schools/${encodeURIComponent(
          normalizedSlug,
        )}/technician`,
      );
    } else if (
      roles.includes(
        "STAFF",
      )
    ) {
      router.push(
        `/schools/${encodeURIComponent(
          normalizedSlug,
        )}/my-class`,
      );
    } else {
      throw new Error(
        "This account does not currently have an assigned CASA staff workspace.",
      );
    }

    router.refresh();
  }

  async function submitPassword(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      null,
    );
    setBusy(
      true,
    );

    try {
      const normalizedSlug =
        normalizedSchoolSlug();

      if (
        needsSchoolWorkspace &&
        !normalizedSlug
      ) {
        throw new Error(
          "Enter your school workspace slug.",
        );
      }

      if (
        !identifier.trim() ||
        !password
      ) {
        throw new Error(
          "Enter your email or phone and password.",
        );
      }

      const response =
        await fetch(
          "/api/auth/login",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                identifier,
                password,
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
            "Unable to sign in.",
        );
      }

      await routeAfterAuthentication(
        normalizedSlug,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to reach CASA.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function submitPasskey() {
    setError(
      null,
    );

    const normalizedSlug =
      normalizedSchoolSlug();

    if (
      needsSchoolWorkspace &&
      !normalizedSlug
    ) {
      setError(
        "Enter your school workspace slug.",
      );
      return;
    }

    if (
      !browserSupportsWebAuthn()
    ) {
      setError(
        "This browser does not support secure Passkey sign-in.",
      );
      return;
    }

    setBusy(
      true,
    );

    try {
      const optionsResponse =
        await fetch(
          "/api/auth/passkeys/login/options",
          {
            method:
              "POST",
          },
        );

      const optionsBody =
        (await optionsResponse
          .json()
          .catch(
            () =>
              ({}),
          )) as JsonBody;

      if (
        !optionsResponse.ok ||
        typeof optionsBody
          .ceremonyId !==
          "string" ||
        !optionsBody.options
      ) {
        throw new Error(
          optionsBody.message ??
            "Unable to start Passkey sign-in.",
        );
      }

      const authenticationResponse =
        await startAuthentication({
          optionsJSON:
            optionsBody.options as
              PublicKeyCredentialRequestOptionsJSON,
        });

      const verifyResponse =
        await fetch(
          "/api/auth/passkeys/login/verify",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                ceremonyId:
                  optionsBody
                    .ceremonyId,
                response:
                  authenticationResponse,
              }),
          },
        );

      const verifyBody =
        (await verifyResponse
          .json()
          .catch(
            () =>
              ({}),
          )) as JsonBody;

      if (
        !verifyResponse.ok ||
        !verifyBody
          .authenticated
      ) {
        throw new Error(
          verifyBody.message ??
            "Passkey sign-in failed.",
        );
      }

      await routeAfterAuthentication(
        normalizedSlug,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to sign in with your Passkey.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <div
      className="grid gap-5"
    >
      {needsSchoolWorkspace ? (
        <label className="casa-label">
          <span>
            School workspace
          </span>
          <input
            required
            value={schoolSlug}
            onChange={(event) =>
              setSchoolSlug(event.target.value)
            }
            placeholder="school-slug"
            autoComplete="organization"
            className="casa-field"
          />
        </label>
      ) : (
        <div className="border-y border-black/15 py-4">
          <p className="casa-kicker text-black/40">
            CASA internal access
          </p>
          <p className="mt-2 text-sm leading-6 text-black/50">
            Sign in with your existing CASA internal identity to continue.
          </p>
        </div>
      )}

      <div
        className="grid grid-cols-2 border-y border-black"
        role="tablist"
        aria-label="Sign-in method"
      >
        <button
          type="button"
          role="tab"
          aria-selected={
            method ===
            "PASSWORD"
          }
          className={`min-h-12 border-r border-black px-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
            method ===
            "PASSWORD"
              ? "bg-black text-white"
              : "bg-transparent text-black/55"
          }`}
          onClick={() => {
            setMethod(
              "PASSWORD",
            );
            setError(
              null,
            );
          }}
        >
          Password
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={
            method ===
            "PASSKEY"
          }
          className={`min-h-12 px-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
            method ===
            "PASSKEY"
              ? "bg-black text-white"
              : "bg-transparent text-black/55"
          }`}
          onClick={() => {
            setMethod(
              "PASSKEY",
            );
            setError(
              null,
            );
          }}
        >
          Passkey
        </button>
      </div>

      {method ===
      "PASSWORD" ? (
        <form
          className="grid gap-5"
          onSubmit={
            submitPassword
          }
        >
          <label className="casa-label">
            <span>
              Email or phone
            </span>
            <input
              required
              value={
                identifier
              }
              onChange={(
                event,
              ) =>
                setIdentifier(
                  event
                    .target
                    .value,
                )
              }
              autoComplete="username"
              className="casa-field"
            />
          </label>

          <label className="casa-label">
            <span>
              Password
            </span>
            <input
              required
              type={showPassword ? "text" : "password"}
              value={
                password
              }
              onChange={(
                event,
              ) =>
                setPassword(
                  event
                    .target
                    .value,
                )
              }
              autoComplete="current-password"
              className="casa-field"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="inline-flex items-center gap-2 border-b border-black text-xs font-semibold" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/></svg><span>{showPassword ? "Hide password" : "Show password"}</span></button>
            <a href="/account/recovery" className="text-xs font-semibold underline underline-offset-4">Forgot password?</a>
          </div>

          <button
            disabled={
              busy
            }
            className="casa-button w-full"
            type="submit"
          >
            {busy
              ? "Signing in..."
              : "Sign in →"}
          </button>
        </form>
      ) : (
        <div>
          <p className="text-sm leading-6 text-black/55">
            Use the Passkey registered to your own CASA identity.
            Shared devices are supported, but staff accounts must never be shared.
          </p>

          <button
            disabled={
              busy
            }
            className="casa-button mt-5 w-full"
            type="button"
            onClick={() =>
              void submitPasskey()
            }
          >
            {busy
              ? "Verifying..."
              : "Continue with Passkey →"}
          </button>
        </div>
      )}

      {error ? (
        <div
          className="casa-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-black/40">
        CASA routes Admins, Teachers and School Technicians to their own authorized workspace after sign-in.
      </p>
    </div>
  );
}
