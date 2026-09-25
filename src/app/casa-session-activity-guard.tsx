"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  usePathname,
} from "next/navigation";

const IDLE_MS =
  30 * 60 * 1000;
const HEARTBEAT_THROTTLE_MS =
  5 * 60 * 1000;

function protectedPath(
  pathname:
    string,
) {
  if (
    pathname ===
      "/scanner" ||
    pathname.startsWith(
      "/guardian-notifications/",
    ) ||
    pathname ===
      "/account/recovery" ||
    pathname ===
      "/account/setup" ||
    pathname ===
      "/login" ||
    pathname ===
      "/internal/login"
  ) {
    return false;
  }

  return (
    pathname.startsWith(
      "/internal",
    ) ||
    pathname.startsWith(
      "/schools/",
    ) ||
    pathname.startsWith(
      "/security/"
    )
  );
}

function loginPath(
  pathname:
    string,
) {
  if (
    pathname.startsWith(
      "/internal",
    )
  ) {
    return "/internal/login";
  }

  const match =
    pathname.match(
      /^\/schools\/([^/]+)/,
    );

  return match?.[1]
    ? `/login?school=${encodeURIComponent(
        decodeURIComponent(
          match[1],
        ),
      )}`
    : "/login";
}

export default function CasaSessionActivityGuard() {
  const pathname =
    usePathname();
  const lastActivity =
    useRef(0);
  const lastHeartbeat =
    useRef(0);
  const ending =
    useRef(false);
  const idleTimer =
    useRef<
      number | null
    >(null);

  const endSession =
    useCallback(
      async () => {
        if (
          ending.current
        ) {
          return;
        }

        ending.current =
          true;

        try {
          await fetch(
            "/api/auth/logout",
            {
              method:
                "POST",
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );
        } catch {
          // Server-side idle enforcement still rejects an expired session.
        }

        window.location.assign(
          loginPath(
            pathname,
          ),
        );
      },
      [
        pathname,
      ],
    );

  const heartbeat =
    useCallback(
      async () => {
        if (
          ending.current
        ) {
          return;
        }

        lastHeartbeat.current =
          Date.now();

        try {
          const response =
            await fetch(
              "/api/auth/session",
              {
                method:
                  "POST",
                cache:
                  "no-store",
                credentials:
                  "same-origin",
              },
            );

          if (
            response.status ===
              401
          ) {
            await endSession();
          }
        } catch {
          // Connectivity issues must not terminate an otherwise valid session.
        }
      },
      [
        endSession,
      ],
    );

  useEffect(
    () => {
      if (
        !protectedPath(
          pathname,
        )
      ) {
        return;
      }

      ending.current =
        false;
      lastActivity.current =
        Date.now();

      const scheduleIdle =
        () => {
          if (
            idleTimer.current !==
              null
          ) {
            window.clearTimeout(
              idleTimer.current,
            );
          }

          const elapsed =
            Date.now() -
            lastActivity.current;
          const remaining =
            Math.max(
              0,
              IDLE_MS -
                elapsed,
            );

          idleTimer.current =
            window.setTimeout(
              () => {
                void endSession();
              },
              remaining,
            );
        };

      const noteActivity =
        () => {
          lastActivity.current =
            Date.now();
          scheduleIdle();

          if (
            Date.now() -
              lastHeartbeat.current >=
            HEARTBEAT_THROTTLE_MS
          ) {
            void heartbeat();
          }
        };

      const resume =
        () => {
          if (
            document.visibilityState !==
              "visible"
          ) {
            return;
          }

          if (
            Date.now() -
              lastActivity.current >=
            IDLE_MS
          ) {
            void endSession();
            return;
          }

          void heartbeat();
          scheduleIdle();
        };

      for (
        const eventName of
          [
            "pointerdown",
            "keydown",
            "touchstart",
          ] as const
      ) {
        window.addEventListener(
          eventName,
          noteActivity,
          {
            passive:
              true,
          },
        );
      }

      document.addEventListener(
        "visibilitychange",
        resume,
      );
      window.addEventListener(
        "focus",
        resume,
      );

      const initial =
        window.setTimeout(
          () => {
            void heartbeat();
            scheduleIdle();
          },
          0,
        );

      return () => {
        window.clearTimeout(
          initial,
        );

        if (
          idleTimer.current !==
            null
        ) {
          window.clearTimeout(
            idleTimer.current,
          );
          idleTimer.current =
            null;
        }

        for (
          const eventName of
            [
              "pointerdown",
              "keydown",
              "touchstart",
            ] as const
        ) {
          window.removeEventListener(
            eventName,
            noteActivity,
          );
        }

        document.removeEventListener(
          "visibilitychange",
          resume,
        );
        window.removeEventListener(
          "focus",
          resume,
        );
      };
    },
    [
      pathname,
      heartbeat,
      endSession,
    ],
  );

  return null;
}
