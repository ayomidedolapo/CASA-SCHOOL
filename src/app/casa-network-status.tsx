"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type NetworkState =
  | "OK"
  | "SLOW"
  | "OFFLINE";

type ConnectionLike = {
  effectiveType?:
    string;
  downlink?:
    number;
  rtt?:
    number;
  addEventListener?:
    (
      type:
        "change",
      listener:
        () => void,
    ) =>
      void;
  removeEventListener?:
    (
      type:
        "change",
      listener:
        () => void,
    ) =>
      void;
};

function currentConnection():
  ConnectionLike | null {
  const candidate =
    navigator as
      Navigator & {
        connection?:
          ConnectionLike;
        mozConnection?:
          ConnectionLike;
        webkitConnection?:
          ConnectionLike;
      };

  return (
    candidate.connection ??
    candidate.mozConnection ??
    candidate.webkitConnection ??
    null
  );
}

function browserSuggestsSlow() {
  const current =
    currentConnection();

  if (!current) {
    return false;
  }

  return (
    current.effectiveType ===
      "slow-2g" ||
    current.effectiveType ===
      "2g" ||
    (
      typeof current.downlink ===
        "number" &&
      current.downlink > 0 &&
      current.downlink <
        1
    ) ||
    (
      typeof current.rtt ===
        "number" &&
      current.rtt >=
        800
    )
  );
}

export default function CasaNetworkStatus() {
  const [
    state,
    setState,
  ] =
    useState<NetworkState>(
      "OK",
    );

  const check =
    useCallback(
      async () => {
        if (
          !navigator.onLine
        ) {
          setState(
            "OFFLINE",
          );
          return;
        }

        const browserSlow =
          browserSuggestsSlow();
        const started =
          performance.now();
        const controller =
          new AbortController();
        const timeout =
          window.setTimeout(
            () => {
              controller.abort();
            },
            5_000,
          );

        try {
          const response =
            await fetch(
              "/api/health",
              {
                cache:
                  "no-store",
                signal:
                  controller.signal,
              },
            );

          const elapsed =
            performance.now() -
            started;

          setState(
            response.ok &&
            !browserSlow &&
            elapsed <
              2_500
              ? "OK"
              : "SLOW",
          );
        } catch {
          setState(
            navigator.onLine
              ? "SLOW"
              : "OFFLINE",
          );
        } finally {
          window.clearTimeout(
            timeout,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      const initial =
        window.setTimeout(
          () => {
            void check();
          },
          0,
        );
      const interval =
        window.setInterval(
          () => {
            void check();
          },
          30_000,
        );
      const online =
        () => {
          void check();
        };
      const offline =
        () => {
          setState(
            "OFFLINE",
          );
        };
      const current =
        currentConnection();

      window.addEventListener(
        "online",
        online,
      );
      window.addEventListener(
        "offline",
        offline,
      );
      current?.addEventListener?.(
        "change",
        online,
      );

      return () => {
        window.clearTimeout(
          initial,
        );
        window.clearInterval(
          interval,
        );
        window.removeEventListener(
          "online",
          online,
        );
        window.removeEventListener(
          "offline",
          offline,
        );
        current?.removeEventListener?.(
          "change",
          online,
        );
      };
    },
    [
      check,
    ],
  );

  useEffect(
    () => {
      document.documentElement.style.setProperty(
        "--casa-network-banner-height",
        state ===
          "OK"
          ? "0px"
          : "32px",
      );

      return () => {
        document.documentElement.style.setProperty(
          "--casa-network-banner-height",
          "0px",
        );
      };
    },
    [
      state,
    ],
  );

  if (
    state ===
      "OK"
  ) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[250] flex min-h-8 items-center justify-center px-4 py-1 text-center text-xs font-semibold ${
        state ===
          "OFFLINE"
          ? "bg-black text-white"
          : "bg-[#f8c928] text-black"
      }`}
    >
      {state ===
        "OFFLINE"
        ? "No internet connection · reconnect to continue."
        : "Slow network connection · CASA may take longer to update."}
    </div>
  );
}
