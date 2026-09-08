// CASA_PHASE_3K_PASSKEY_REGISTRATION_UI
"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  listPasskeys,
  registerPasskey,
  type RegisteredPasskey,
} from "@/client/passkey-registration";

function formatDate(
  value?: string | null,
) {
  if (!value) {
    return "Not yet";
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? value
    : date.toLocaleString();
}

export function PasskeyManager() {
  const [
    passkeys,
    setPasskeys,
  ] =
    useState<
      RegisteredPasskey[]
    >([]);
  const [
    loading,
    setLoading,
  ] =
    useState(true);
  const [
    registering,
    setRegistering,
  ] =
    useState(false);
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

  useEffect(() => {
    let cancelled =
      false;

    void listPasskeys()
      .then(
        (
          nextPasskeys,
        ) => {
          if (cancelled) {
            return;
          }

          setPasskeys(
            nextPasskeys,
          );
          setError("");
        },
      )
      .catch(
        (
          caught:
            unknown,
        ) => {
          if (cancelled) {
            return;
          }

          setError(
            caught instanceof
              Error
              ? caught.message
              : "Passkey status could not be loaded.",
          );
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRegister() {
    setRegistering(true);
    setError("");
    setSuccess("");

    try {
      await registerPasskey({
        label:
          "Windows Hello / CASA device",
      });

      setPasskeys(
        await listPasskeys(),
      );
      setSuccess(
        "Passkey registered. Sensitive CASA actions can now request a fresh Passkey authorization.",
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Passkey registration failed.",
      );
    } finally {
      setRegistering(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-black pb-5">
        <div>
          <p className="casa-kicker">
            Registered authenticators
          </p>
          <h2 className="casa-heading mt-3">
            Account Passkeys
          </h2>
        </div>

        {!loading ? (
          <span
            className={`casa-status ${
              passkeys.length > 0
                ? "casa-status-positive"
                : "casa-status-warning"
            }`}
          >
            {passkeys.length > 0
              ? `${passkeys.length} active`
              : "Action required"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p
          className="py-10 text-sm text-black/55"
          role="status"
        >
          Checking Passkey status...
        </p>
      ) : (
        <>
          <div className="border-b border-black/25 py-5">
            <strong className="block text-lg">
              {passkeys.length > 0
                ? "Passkey step-up is ready."
                : "No Passkey registered."}
            </strong>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
              {passkeys.length > 0
                ? "CASA can request a fresh device authorization when you issue or reissue cards and perform other protected actions."
                : "Register at least one Passkey before performing Passkey-protected operations."}
            </p>
          </div>

          {passkeys.length > 0 ? (
            <div className="border-b border-black">
              {passkeys.map(
                (passkey) => (
                  <div
                    className="grid gap-2 border-b border-black/20 py-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-start"
                    key={
                      passkey.id
                    }
                  >
                    <div>
                      <strong className="block text-sm">
                        {passkey.label ||
                          "Passkey"}
                      </strong>
                      <p className="mt-1 text-xs leading-5 text-black/55">
                        Created{" "}
                        {formatDate(
                          passkey.createdAt,
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {passkey.deviceType ? (
                        <span className="casa-status">
                          {passkey.deviceType}
                        </span>
                      ) : null}

                      {passkey.backedUp ===
                      true ? (
                        <span className="casa-status casa-status-positive">
                          Backed up
                        </span>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() =>
              void handleRegister()
            }
            disabled={registering}
            className="casa-button mt-6"
          >
            {registering
              ? "Waiting for device..."
              : passkeys.length > 0
                ? "Add another Passkey"
                : "Register Passkey"}
          </button>
        </>
      )}

      {success ? (
        <div
          className="casa-notice mt-6 text-[var(--casa-positive)]"
          role="status"
        >
          {success}
        </div>
      ) : null}

      {error ? (
        <div
          className="casa-error mt-6"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}
