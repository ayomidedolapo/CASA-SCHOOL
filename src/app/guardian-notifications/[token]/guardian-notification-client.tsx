"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  initializeApp,
} from "firebase/app";
import {
  getMessaging,
  onMessage,
  onRegistered,
  register,
} from "firebase/messaging";

interface LinkData {
  school: {
    id: string;
    name: string;
    logoUrl:
      string | null;
  };
  branch: {
    id:
      string | null;
    name: string;
  };
  student: {
    id: string;
    name: string;
  };
  guardian: {
    id: string;
    name: string;
  };
  reason: string;
  firebase: {
    ready: boolean;
    config: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
    };
    vapidKey: string;
  };
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/i.test(
    navigator.userAgent,
  );
}

function isStandalone() {
  return (
    window.matchMedia(
      "(display-mode: standalone)",
    ).matches ||
    Boolean(
      (
        navigator as
          Navigator & {
            standalone?:
              boolean;
          }
      ).standalone,
    )
  );
}

export default function GuardianNotificationClient(
  {
    token,
  }: {
    token: string;
  },
) {
  const [
    data,
    setData,
  ] =
    useState<LinkData | null>(
      null,
    );
  const [
    error,
    setError,
  ] =
    useState("");
  const [
    enabled,
    setEnabled,
  ] =
    useState(false);
  const [
    busy,
    setBusy,
  ] =
    useState(false);
  const [
    appleNeedsInstall,
    setAppleNeedsInstall,
  ] =
    useState(false);

  useEffect(
    () => {
      void fetch(
        `/api/guardian-notifications/${encodeURIComponent(
          token,
        )}`,
        {
          cache:
            "no-store",
        },
      )
        .then(
          async (
            response,
          ) => {
            const body =
              await response.json();

            if (!response.ok) {
              throw new Error(
                body.message ??
                  "This notification link is unavailable.",
              );
            }

            setData(
              body as
                LinkData,
            );
          },
        )
        .catch(
          (
            cause,
          ) =>
            setError(
              cause instanceof
                Error
                ? cause.message
                : "This notification link is unavailable.",
            ),
        );
    },
    [
      token,
    ],
  );

  useEffect(
    () => {
      if (
        typeof window ===
          "undefined"
      ) {
        return;
      }

      const timeout =
        window.setTimeout(
          () => {
            setAppleNeedsInstall(
              isAppleMobile() &&
                !isStandalone(),
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timeout,
        );
      };
    },
    [],
  );

  const manifestHref =
    useMemo(
      () =>
        `/api/guardian-notifications/${encodeURIComponent(
          token,
        )}/manifest`,
      [
        token,
      ],
    );

  useEffect(
    () => {
      // iPhone/iPad Web Push requires a Home Screen web app. Android and
      // desktop browsers do not, so do not advertise an install manifest there.
      if (!isAppleMobile()) {
        return;
      }

      const link =
        document.createElement(
          "link",
        );
      link.rel =
        "manifest";
      link.href =
        manifestHref;
      document.head.appendChild(
        link,
      );

      return () => {
        link.remove();
      };
    },
    [
      manifestHref,
    ],
  );

  async function enable() {
    if (
      !data?.firebase
        .ready
    ) {
      setError(
        "The school notification service is not fully configured yet.",
      );
      return;
    }

    if (
      isAppleMobile() &&
      !isStandalone()
    ) {
      setAppleNeedsInstall(
        true,
      );
      return;
    }

    if (
      !("Notification" in window) ||
      !(
        "serviceWorker" in
        navigator
      )
    ) {
      setError(
        "This browser does not support school notifications.",
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const currentPermission =
        Notification.permission;

      if (
        currentPermission ===
        "denied"
      ) {
        throw new Error(
          "Notifications are blocked for this site. On Android, open the browser site settings for CASA, set Notifications to Allow, then return here and tap Allow school notifications again.",
        );
      }

      const permission =
        currentPermission ===
        "granted"
          ? "granted"
          : await Notification
              .requestPermission();

      if (
        permission !==
        "granted"
      ) {
        throw new Error(
          "Notification permission was not allowed. Choose Allow in the browser permission prompt. If no prompt appeared, open this site's notification permission in your browser settings and set it to Allow.",
        );
      }

      const serviceWorker =
        await navigator
          .serviceWorker
          .register(
            "/firebase-messaging-sw.js",
          );

      const app =
        initializeApp(
          data.firebase
            .config,
        );
      const messaging =
        getMessaging(
          app,
        );

      onMessage(
        messaging,
        (payload) => {
          const title =
            payload.notification
              ?.title ??
            data.school.name;
          const body =
            payload.notification
              ?.body ??
            "CASA school notification";

          void serviceWorker
            .showNotification(
              title,
              {
                body,
                icon:
                  data.school.logoUrl ??
                  undefined,
                badge:
                  data.school.logoUrl ??
                  undefined,
              },
            );
        },
      );

      const fid =
        await new Promise<string>(
          async (
            resolve,
            reject,
          ) => {
            let complete =
              false;

            const stop =
              onRegistered(
                messaging,
                (
                  installationId,
                ) => {
                  if (complete) {
                    return;
                  }

                  complete =
                    true;
                  stop();
                  resolve(
                    installationId,
                  );
                },
              );

            const timeout =
              window.setTimeout(
                () => {
                  if (!complete) {
                    complete =
                      true;
                    stop();
                    reject(
                      new Error(
                        "Firebase did not finish registering this device.",
                      ),
                    );
                  }
                },
                15000,
              );

            try {
              await register(
                messaging,
                {
                  vapidKey:
                    data.firebase
                      .vapidKey,
                  serviceWorkerRegistration:
                    serviceWorker,
                },
              );
            } catch (
              cause
            ) {
              if (!complete) {
                complete =
                  true;
                stop();
                window.clearTimeout(
                  timeout,
                );
                reject(
                  cause,
                );
              }
            }
          },
        );

      const response =
        await fetch(
          `/api/guardian-notifications/${encodeURIComponent(
            token,
          )}`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                fid,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.message ??
            "CASA could not save this device.",
        );
      }

      setEnabled(
        true,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Notification setup failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  if (
    enabled
  ) {
    return (
      <main className="casa-noise min-h-screen bg-[#f2f2ef] px-5 py-10 text-[#0b0b0a]">
        <section className="mx-auto max-w-xl bg-white p-7 sm:p-10">
          <p className="casa-kicker">
            CASA
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.055em]">
            Notifications enabled.
          </h1>
          <p className="mt-5 text-sm leading-6 text-black/55">
            This one-time link is now closed. You can close CASA; notifications can arrive in the background.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="casa-noise min-h-screen bg-[#f2f2ef] px-5 py-10 text-[#0b0b0a]">
      <section className="mx-auto max-w-xl bg-white p-7 sm:p-10">
        <p className="casa-kicker">
          CASA / Guardian notifications
        </p>

        {data ? (
          <>
            {data.school
              .logoUrl ? (
              <img
                src={
                  data.school
                    .logoUrl
                }
                alt={`${data.school.name} logo`}
                className="mt-7 h-20 w-20 object-contain"
              />
            ) : null}

            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.055em]">
              {data.school.name}
            </h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.11em] text-black/45">
              {data.branch.name}
            </p>

            <div className="mt-8 border-y border-black py-5">
              <p className="casa-kicker text-black/45">
                Student
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {data.student.name}
              </p>
              <p className="mt-4 text-sm text-black/55">
                For {data.guardian.name}
              </p>
            </div>

            <p className="mt-6 text-sm leading-6 text-black/60">
              {data.reason}
            </p>

            {appleNeedsInstall ? (
              <div className="mt-7 border border-black p-5">
                <p className="casa-kicker">
                  iPhone setup
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  Add school notifications to your Home Screen.
                </h2>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-black/65">
                  <li>Tap the Share button in Safari.</li>
                  <li>Choose <strong>Add to Home Screen</strong>.</li>
                  <li>Open the new school notification icon from your Home Screen.</li>
                  <li>Return here and tap <strong>Allow school notifications</strong>.</li>
                </ol>
              </div>
            ) : null}

            {!appleNeedsInstall ? (
              <p className="mt-6 text-xs leading-5 text-black/50">
                Android and desktop do not need CASA installed. Tap the button below and your browser should show its normal Allow / Block notification permission prompt.
              </p>
            ) : null}

            <button
              type="button"
              className="casa-button mt-7 w-full"
              disabled={
                busy ||
                !data.firebase
                  .ready
              }
              onClick={() =>
                void enable()
              }
            >
              {busy
                ? "Enabling…"
                : appleNeedsInstall
                  ? "I opened CASA from my Home Screen"
                  : "Allow school notifications"}
            </button>
          </>
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
    </main>
  );
}
