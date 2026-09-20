import {
  NextResponse,
} from "next/server";

import {
  firebasePublicConfig,
} from "@/server/messaging/firebase-fcm";

export const dynamic =
  "force-dynamic";

export function GET() {
  const firebase =
    firebasePublicConfig();

  if (!firebase.ready) {
    return new NextResponse(
      "/* CASA Firebase configuration incomplete. */",
      {
        status: 503,
        headers: {
          "Content-Type":
            "application/javascript; charset=utf-8",
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const config =
    JSON.stringify(
      firebase.config,
    );

  const source = `
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");
firebase.initializeApp(${config});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const web = payload.webpush && payload.webpush.notification ? payload.webpush.notification : {};
  self.registration.showNotification(n.title || "CASA", {
    body: n.body || "",
    icon: web.icon,
    badge: web.badge,
    data: {
      url: payload.fcmOptions && payload.fcmOptions.link
        ? payload.fcmOptions.link
        : "/guardian-notifications"
    }
  });
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    event.notification &&
    event.notification.data &&
    event.notification.data.url
      ? event.notification.data.url
      : "/guardian-notifications";
  event.waitUntil(clients.openWindow(target));
});
`;

  return new NextResponse(
    source,
    {
      headers: {
        "Content-Type":
          "application/javascript; charset=utf-8",
        "Cache-Control":
          "no-store",
        "Service-Worker-Allowed":
          "/",
      },
    },
  );
}
