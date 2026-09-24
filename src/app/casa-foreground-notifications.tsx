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

export default function CasaForegroundNotifications() {
  useEffect(
    () => {
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
              const clickUrl =
                payload.data
                  ?.casaClickUrl ??
                window.location.origin;

              void registration
                .showNotification(
                  title,
                  {
                    body,
                    icon:
                      icon ??
                      undefined,
                    badge:
                      icon ??
                      undefined,
                    data: {
                      url:
                        clickUrl,
                    },
                  },
                );
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
    [],
  );

  return null;
}
