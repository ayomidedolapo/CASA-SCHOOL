/*
 * CASA School Scanner service worker.
 *
 * Phase 3H is deliberately online-only. This worker exists for
 * installability/lifecycle but does not cache application or API
 * responses. Offline attendance and durable sync require a separate,
 * explicitly designed security phase.
 */

self.addEventListener(
  "install",
  () => {
    self.skipWaiting();
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      self.clients.claim(),
    );
  },
);