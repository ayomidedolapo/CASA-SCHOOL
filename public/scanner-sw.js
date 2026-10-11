/*
 * CASA School Scanner service worker.
 *
 * M66 Offline Continuity:
 * - cache the last successful scanner shell and immutable Next static assets;
 * - never cache API responses or attendance mutations;
 * - let the Scanner application own the durable offline attendance queue.
 */

const CASA_SCANNER_CACHE =
  "casa-scanner-m66-continuity-v1";

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      (async () => {
        const cache =
          await caches.open(
            CASA_SCANNER_CACHE,
          );

        try {
          await cache.add(
            "/scanner",
          );
        } catch {
          // The live scanner page will be cached on the next successful navigation.
        }

        self.skipWaiting();
      })(),
    );
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      (async () => {
        const keys =
          await caches.keys();

        await Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(
                  "casa-scanner-",
                ) &&
                key !==
                  CASA_SCANNER_CACHE,
            )
            .map(
              (key) =>
                caches.delete(
                  key,
                ),
            ),
        );

        await self.clients.claim();
      })(),
    );
  },
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !==
        "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url,
      );

    if (
      url.origin !==
        self.location.origin ||
      url.pathname.startsWith(
        "/api/",
      )
    ) {
      return;
    }

    const scannerNavigation =
      request.mode ===
        "navigate" &&
      url.pathname.startsWith(
        "/scanner",
      );

    const staticAsset =
      url.pathname.startsWith(
        "/_next/static/",
      );

    if (
      !scannerNavigation &&
      !staticAsset
    ) {
      return;
    }

    event.respondWith(
      (async () => {
        const cache =
          await caches.open(
            CASA_SCANNER_CACHE,
          );

        if (staticAsset) {
          const cached =
            await cache.match(
              request,
            );

          if (cached) {
            return cached;
          }
        }

        try {
          const response =
            await fetch(
              request,
            );

          if (
            response.ok
          ) {
            await cache.put(
              request,
              response.clone(),
            );
          }

          return response;
        } catch {
          const cached =
            await cache.match(
              request,
            );

          if (cached) {
            return cached;
          }

          if (
            scannerNavigation
          ) {
            const shell =
              await cache.match(
                "/scanner",
              );

            if (shell) {
              return shell;
            }
          }

          throw new Error(
            "CASA scanner resource unavailable offline.",
          );
        }
      })(),
    );
  },
);
