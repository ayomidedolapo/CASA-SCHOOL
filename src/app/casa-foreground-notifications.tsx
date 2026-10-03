"use client";

import {
  useEffect,
} from "react";
import {
  usePathname,
} from "next/navigation";
import {
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  getMessaging,
  isSupported,
  onMessage,
} from "firebase/messaging";

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

function ready() {
  return Object
    .values(
      firebaseConfig,
    )
    .every(
      (value) =>
        value.trim().length >
        0,
    );
}

async function acknowledgeDisplayedPush(
  data:
    Record<string, string> |
    undefined,
) {
  const outboxId =
    data?.casaOutboxId;
  const receiptToken =
    data?.casaReceiptToken;

  if (
    !outboxId ||
    !receiptToken
  ) {
    return;
  }

  try {
    await fetch(
      "/api/guardian-notifications/delivery-ack",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            outboxId,
            receiptToken,
            source:
              "FOREGROUND",
          }),
        keepalive: true,
        cache: "no-store",
      },
    );
  } catch {
    // A later registration catch-up sync remains available.
  }
}

export default function CasaForegroundNotifications() {
  const pathname =
    usePathname();

  useEffect(
    () => {
      if (
        pathname ===
          "/scanner"
      ) {
        return;
      }

      let cancelled =
        false;
      let stop:
        (() => void) |
        undefined;

      async function start() {
        if (
          !ready() ||
          !("Notification" in window) ||
          Notification.permission !==
            "granted" ||
          !(
            "serviceWorker" in
            navigator
          ) ||
          !(
            await isSupported()
          )
        ) {
          return;
        }

        const registration =
          await navigator
            .serviceWorker
            .register(
              "/firebase-messaging-sw.js",
            );

        if (cancelled) {
          return;
        }

        const app =
          getApps().length >
          0
            ? getApp()
            : initializeApp(
                firebaseConfig,
              );

        const messaging =
          getMessaging(
            app,
          );

        stop =
          onMessage(
            messaging,
            (
              payload,
            ) => {
              const title =
                payload
                  .notification
                  ?.title ??
                payload.data
                  ?.casaTitle ??
                "CASA";
              const body =
                payload
                  .notification
                  ?.body ??
                payload.data
                  ?.casaBody ??
                "School attendance update.";
              const icon =
                payload.data
                  ?.casaIconUrl;
              const badge =
                payload.data
                  ?.casaBadgeUrl;
              const presenceEventId =
                payload.data
                  ?.presenceEventId ??
                payload.data
                  ?.casaPresenceEventId;

              void (async () => {
                await registration
                  .showNotification(
                    title,
                    {
                      body,
                      icon:
                        icon ??
                        undefined,
                      badge:
                        badge ??
                        undefined,
                      tag:
                        presenceEventId
                          ? `casa-presence-${presenceEventId}`
                          : undefined,
                    },
                  );

                await acknowledgeDisplayedPush(
                  payload.data,
                );
              })();
            },
          );
      }

      void start();

      return () => {
        cancelled =
          true;
        stop?.();
      };
    },
    [
      pathname,
    ],
  );

  return null;
}
