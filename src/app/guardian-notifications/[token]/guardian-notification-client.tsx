"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getApp,
  getApps,
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

function isAndroid() {
  return /Android/i.test(
    navigator.userAgent,
  );
}

function isChromeFamily() {
  return (
    /Chrome|CriOS/i.test(
      navigator.userAgent,
    ) &&
    !/Edg|OPR|SamsungBrowser/i.test(
      navigator.userAgent,
    )
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
  const [
    permissionState,
    setPermissionState,
  ] =
    useState<
      | NotificationPermission
      | "unsupported"
      | "unknown"
    >(
      "unknown",
    );
  const [
    permissionRecovery,
    setPermissionRecovery,
  ] =
    useState<
      | "PROMPT_NOT_SHOWN"
      | "BLOCKED"
      | null
    >(
      null,
    );

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

  useEffect(
    () => {
      function syncPermission() {
        if (
          typeof window ===
            "undefined" ||
          !(
            "Notification" in
            window
          )
        ) {
          setPermissionState(
            "unsupported",
          );
          return;
        }

        const current =
          Notification.permission;

        setPermissionState(
          current,
        );

        if (
          current ===
            "granted"
        ) {
          setPermissionRecovery(
            null,
          );
        }
      }

      syncPermission();
      window.addEventListener(
        "focus",
        syncPermission,
      );
      document.addEventListener(
        "visibilitychange",
        syncPermission,
      );

      return () => {
        window.removeEventListener(
          "focus",
          syncPermission,
        );
        document.removeEventListener(
          "visibilitychange",
          syncPermission,
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

      setPermissionState(
        currentPermission,
      );

      if (
        currentPermission ===
          "denied"
      ) {
        setPermissionRecovery(
          "BLOCKED",
        );

        throw new Error(
          isAndroid() &&
            isChromeFamily()
            ? "Chrome has blocked CASA notifications for this browser profile. Open CASA site permissions in Chrome and set Notifications to Allow, then return to this same setup page and tap Allow school notifications again. You do not need a new CASA link."
            : "This browser has blocked CASA notifications. Change this site's notification permission to Allow, return to this setup page, and try again. You do not need a new CASA link.",
        );
      }

      const permission =
        currentPermission ===
          "granted"
          ? "granted"
          : await Notification
              .requestPermission();

      setPermissionState(
        permission,
      );

      if (
        permission !==
          "granted"
      ) {
        setPermissionRecovery(
          permission ===
            "denied"
            ? "BLOCKED"
            : "PROMPT_NOT_SHOWN",
        );

        throw new Error(
          permission ===
            "default"
            ? (
                isAndroid() &&
                isChromeFamily()
                  ? "Chrome did not grant notification permission. If no popup appeared, Chrome may have suppressed the prompt. Use the CASA site permission control in Chrome to set Notifications to Allow, then return here and tap Allow school notifications again. The current CASA setup link remains valid."
                  : "The browser did not grant notification permission. Set this site's Notifications permission to Allow, return here, and try again. The current CASA setup link remains valid."
              )
            : "Notification permission is blocked for this browser context. Set CASA notifications to Allow in browser or device settings, then return here and try again.",
        );
      }

      setPermissionRecovery(
        null,
      );
const serviceWorker =
        await navigator
          .serviceWorker
          .register(
            "/firebase-messaging-sw.js",
          );

      const app =
        getApps().length >
        0
          ? getApp()
          : initializeApp(
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

          const icon =
            payload.data
              ?.casaIconUrl ??
            data.school
              .logoUrl ??
            undefined;
          const clickUrl =
            payload.data
              ?.casaClickUrl ??
            window.location
              .origin;

          void serviceWorker
            .showNotification(
              title,
              {
                body,
                icon,
                badge:
                  icon,
                data: {
                  url:
                    clickUrl,
                },
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

            {permissionRecovery ? (
        <div className="mt-5 border border-black/20 bg-black/[0.03] p-4">
          <p className="text-xs font-semibold">
            Browser notification permission needs attention
          </p>
          <p className="mt-2 text-xs leading-5 text-black/60">
            Current permission: {permissionState}. CASA cannot silently grant browser permission, but once this browser profile is allowed it can be registered for this student and other linked students without asking for browser permission again.
          </p>
          {isAndroid() &&
          isChromeFamily() ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-black/60">
              <li>On this CASA page, open the site controls beside the Chrome address bar.</li>
              <li>Open Permissions and set Notifications to Allow.</li>
              <li>In Chrome Settings, Site settings, Notifications, make sure sites are allowed to ask. Quieter prompts can hide the normal popup.</li>
              <li>In Android Settings, Apps, Chrome, Notifications, make sure Chrome notifications are allowed.</li>
              <li>Return to this same CASA page and tap Allow school notifications again. Do not request another setup link.</li>
            </ol>
          ) : (
            <p className="mt-3 text-xs leading-5 text-black/60">
              Set CASA Notifications to Allow in this browser or device settings, return to this same setup page, then tap Allow school notifications again. You do not need another setup link.
            </p>
          )}
        </div>
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
