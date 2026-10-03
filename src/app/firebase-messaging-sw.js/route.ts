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
// CASA_M50_GUARDIAN_DELIVERY_ATTENDANCE_CLOSURE
// CASA_M51_GUARDIAN_REGISTRATION_CATCHUP_PRESENCE_ONLY
// CASA_M52_ANDROID_NOTIFICATION_BRANDING_PRESENCE_ONLY_SIGNOUT
self.addEventListener("notificationclick", (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  event.notification.close();
});

async function casaAcknowledgeDisplayed(data) {
  const outboxId = data && data.casaOutboxId;
  const receiptToken = data && data.casaReceiptToken;

  if (!outboxId || !receiptToken) {
    return;
  }

  try {
    await fetch("/api/guardian-notifications/delivery-ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        outboxId,
        receiptToken,
        source: "BACKGROUND"
      }),
      cache: "no-store"
    });
  } catch {
    // Provider acceptance is not treated as browser display proof.
    // The page-start catch-up path remains available if this receipt cannot post.
  }
}

importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");
firebase.initializeApp(${config});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  const web =
    payload.webpush && payload.webpush.notification
      ? payload.webpush.notification
      : {};
  const icon =
    data.casaIconUrl ||
    web.icon;
  const badge =
    data.casaBadgeUrl ||
    web.badge;
  const presenceEventId =
    data.presenceEventId ||
    data.casaPresenceEventId;

  return self.registration
    .showNotification(
      n.title || data.casaTitle || "CASA",
      {
        body:
          n.body ||
          data.casaBody ||
          "School attendance update.",
        icon,
        badge,
        tag: presenceEventId
          ? "casa-presence-" + presenceEventId
          : undefined,
        renotify: false
      }
    )
    .then(() => casaAcknowledgeDisplayed(data));
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
