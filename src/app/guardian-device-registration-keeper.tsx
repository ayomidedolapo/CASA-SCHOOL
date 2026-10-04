"use client";

import {
  useEffect,
} from "react";
import {
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  getMessaging,
  isSupported,
  onRegistered,
  onUnregistered,
  register,
} from "firebase/messaging";

const STORAGE_KEY =
  "casa:guardian-push-registration-credentials:v1";

const firebaseConfig = {
  apiKey:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_API_KEY ??
    "",
  authDomain:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_AUTH_DOMAIN ??
    "",
  projectId:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_PROJECT_ID ??
    "",
  storageBucket:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_STORAGE_BUCKET ??
    "",
  messagingSenderId:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_MESSAGING_SENDER_ID ??
    "",
  appId:
    process.env
      .NEXT_PUBLIC_CASA_FIREBASE_APP_ID ??
    "",
};

const vapidKey =
  process.env
    .NEXT_PUBLIC_CASA_FIREBASE_VAPID_KEY ??
  "";

function firebaseReady() {
  return (
    Object.values(firebaseConfig)
      .every(
        (value) =>
          value.trim().length > 0,
      ) &&
    vapidKey.trim().length > 0
  );
}

function loadCredentials() {
  try {
    const raw =
      window.localStorage
        .getItem(STORAGE_KEY);

    if (!raw) {
      return [] as string[];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        parsed.filter(
          (value): value is string =>
            typeof value === "string" &&
            value.trim().length >= 32,
        ),
      ),
    ).slice(0, 12);
  } catch {
    return [] as string[];
  }
}

function saveCredentials(
  credentials: string[],
) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        Array.from(
          new Set(credentials),
        ).slice(0, 12),
      ),
    );
  } catch {
    // The registration setup page prevents new durable enrollment when
    // browser storage is unavailable. Existing browsers remain best-effort.
  }
}

function removeCredential(
  credential: string,
) {
  saveCredentials(
    loadCredentials()
      .filter(
        (value) =>
          value !== credential,
      ),
  );
}

async function postRegistration(
  body: Record<string, unknown>,
) {
  const response =
    await fetch(
      "/api/guardian-notifications/device-registration",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(body),
        cache:
          "no-store",
      },
    );

  const payload =
    await response.json()
      .catch(() => ({}));

  return {
    response,
    payload,
  };
}

export default function GuardianDeviceRegistrationKeeper() {
  useEffect(
    () => {
      let cancelled = false;
      let stopRegistered:
        (() => void) |
        undefined;
      let stopUnregistered:
        (() => void) |
        undefined;
      let registration:
        ServiceWorkerRegistration |
        null = null;
      let lastRefreshAt = 0;
      const displayedThisRun =
        new Set<string>();

      async function acknowledgeCatchUp(
        credential: string,
        presenceEventId: string,
      ) {
        try {
          await postRegistration({
            action:
              "ACK_CATCH_UP",
            credential,
            presenceEventId,
          });
        } catch {
          // A later startup can safely replay the same tagged notification.
        }
      }

      async function showCatchUp(
        credential: string,
        items: unknown,
      ) {
        if (
          !registration ||
          !Array.isArray(items)
        ) {
          return;
        }

        for (const item of items) {
          if (
            !item ||
            typeof item !== "object"
          ) {
            continue;
          }

          const record =
            item as {
              presenceEventId?: unknown;
              title?: unknown;
              body?: unknown;
              iconUrl?: unknown;
              badgeUrl?: unknown;
            };

          if (
            typeof record.presenceEventId !==
              "string" ||
            typeof record.title !==
              "string" ||
            typeof record.body !==
              "string"
          ) {
            continue;
          }

          if (
            displayedThisRun.has(
              record.presenceEventId,
            )
          ) {
            continue;
          }

          displayedThisRun.add(
            record.presenceEventId,
          );

          const icon =
            typeof record.iconUrl ===
              "string"
              ? record.iconUrl
              : undefined;
          const badge =
            typeof record.badgeUrl ===
              "string"
              ? record.badgeUrl
              : undefined;

          try {
            await registration
              .showNotification(
                record.title,
                {
                  body:
                    record.body,
                  icon,
                  badge,
                  tag:
                    `casa-presence-${record.presenceEventId}`,
                },
              );

            await acknowledgeCatchUp(
              credential,
              record.presenceEventId,
            );
          } catch {
            // Do not acknowledge an item the browser did not display.
          }
        }
      }

      async function syncCredential(
        credential: string,
        fid: string,
      ) {
        try {
          const {
            response,
            payload,
          } =
            await postRegistration({
              action:
                "SYNC",
              credential,
              fid,
            });

          if (
            response.status === 410
          ) {
            removeCredential(
              credential,
            );
            return;
          }

          if (!response.ok) {
            return;
          }

          await showCatchUp(
            credential,
            (
              payload as {
                catchUp?: unknown;
              }
            ).catchUp,
          );
        } catch {
          // Browser startup reconciliation is best-effort and retries later.
        }
      }

      async function unregisterCredential(
        credential: string,
        fid: string,
      ) {
        try {
          const {
            response,
          } =
            await postRegistration({
              action:
                "UNREGISTER",
              credential,
              fid,
            });

          if (
            response.status === 410
          ) {
            removeCredential(
              credential,
            );
          }
        } catch {
          // A later onRegistered startup sync remains authoritative.
        }
      }

      async function refresh() {
        if (
          cancelled ||
          Date.now() - lastRefreshAt <
            15_000
        ) {
          return;
        }

        lastRefreshAt =
          Date.now();

        const credentials =
          loadCredentials();

        if (
          credentials.length === 0 ||
          !firebaseReady() ||
          !("Notification" in window) ||
          Notification.permission !==
            "granted" ||
          !("serviceWorker" in navigator) ||
          !(await isSupported())
        ) {
          return;
        }

        registration =
          await navigator
            .serviceWorker
            .register(
              "/firebase-messaging-sw.js",
              {
                scope:
                  "/",
                updateViaCache:
                  "none",
              },
            );

        if (cancelled) {
          return;
        }

        const app =
          getApps().length > 0
            ? getApp()
            : initializeApp(
                firebaseConfig,
              );
        const messaging =
          getMessaging(app);

        stopRegistered?.();
        stopUnregistered?.();

        stopRegistered =
          onRegistered(
            messaging,
            (fid) => {
              for (
                const credential of
                  loadCredentials()
              ) {
                void syncCredential(
                  credential,
                  fid,
                );
              }
            },
          );

        stopUnregistered =
          onUnregistered(
            messaging,
            (fid) => {
              for (
                const credential of
                  loadCredentials()
              ) {
                void unregisterCredential(
                  credential,
                  fid,
                );
              }
            },
          );

        await register(
          messaging,
          {
            vapidKey,
            serviceWorkerRegistration:
              registration,
          },
        );
      }

      function onVisible() {
        if (
          document.visibilityState ===
            "visible"
        ) {
          void refresh();
        }
      }

      void refresh();
      window.addEventListener(
        "online",
        refresh,
      );
      window.addEventListener(
        "focus",
        refresh,
      );
      document.addEventListener(
        "visibilitychange",
        onVisible,
      );

      return () => {
        cancelled = true;
        stopRegistered?.();
        stopUnregistered?.();
        window.removeEventListener(
          "online",
          refresh,
        );
        window.removeEventListener(
          "focus",
          refresh,
        );
        document.removeEventListener(
          "visibilitychange",
          onVisible,
        );
      };
    },
    [],
  );

  return null;
}
