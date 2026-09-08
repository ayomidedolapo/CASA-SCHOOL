"use client";

import {
  useEffect,
  useState,
} from "react";

import styles from "./scanner-install-control.module.css";

interface ScannerBeforeInstallPromptEvent
  extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome:
      | "accepted"
      | "dismissed";
    platform:
      string;
  }>;
}

function isStandalone() {
  const displayMode =
    window.matchMedia(
      "(display-mode: standalone)",
    ).matches;

  const iosStandalone =
    Boolean(
      (
        navigator as Navigator & {
          standalone?:
            boolean;
        }
      ).standalone,
    );

  return (
    displayMode ||
    iosStandalone
  );
}

export default function ScannerInstallControl() {
  const [
    promptEvent,
    setPromptEvent,
  ] =
    useState<
      ScannerBeforeInstallPromptEvent | null
    >(
      null,
    );

  const [
    installed,
    setInstalled,
  ] =
    useState(
      false,
    );

  const [
    showManualHelp,
    setShowManualHelp,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      let cancelled =
        false;

      const displayMode =
        window.matchMedia(
          "(display-mode: standalone)",
        );

      const frame =
        window.requestAnimationFrame(
          () => {
            if (!cancelled) {
              setInstalled(
                isStandalone(),
              );
            }
          },
        );

      function capturePrompt(
        event:
          Event,
      ) {
        event.preventDefault();

        setPromptEvent(
          event as
            ScannerBeforeInstallPromptEvent,
        );

        setShowManualHelp(
          false,
        );
      }

      function appInstalled() {
        setInstalled(
          true,
        );

        setPromptEvent(
          null,
        );

        setShowManualHelp(
          false,
        );
      }

      function displayModeChanged() {
        setInstalled(
          isStandalone(),
        );
      }

      window.addEventListener(
        "beforeinstallprompt",
        capturePrompt,
      );

      window.addEventListener(
        "appinstalled",
        appInstalled,
      );

      displayMode.addEventListener(
        "change",
        displayModeChanged,
      );

      return () => {
        cancelled =
          true;

        window.cancelAnimationFrame(
          frame,
        );

        window.removeEventListener(
          "beforeinstallprompt",
          capturePrompt,
        );

        window.removeEventListener(
          "appinstalled",
          appInstalled,
        );

        displayMode.removeEventListener(
          "change",
          displayModeChanged,
        );
      };
    },
    [],
  );

  async function installScanner() {
    if (installed) {
      return;
    }

    if (!promptEvent) {
      setShowManualHelp(
        true,
      );

      return;
    }

    try {
      await promptEvent.prompt();

      const choice =
        await promptEvent.userChoice;

      setPromptEvent(
        null,
      );

      if (
        choice.outcome ===
        "accepted"
      ) {
        setShowManualHelp(
          false,
        );

        return;
      }

      setShowManualHelp(
        true,
      );
    }
    catch {
      setPromptEvent(
        null,
      );

      setShowManualHelp(
        true,
      );
    }
  }

  if (installed) {
    return (
      <div
        className={
          styles.installed
        }
        role="status"
      >
        Scanner installed
      </div>
    );
  }

  return (
    <aside
      className={
        styles.dock
      }
      aria-label="Scanner installation"
    >
      <button
        type="button"
        className={
          styles.installButton
        }
        onClick={
          () =>
            void installScanner()
        }
      >
        Install Scanner
      </button>

      {showManualHelp && (
        <p
          className={
            styles.help
          }
        >
          If the browser does not open
          the install prompt, open the
          browser menu and choose
          <strong>
            {" "}
            Install app
          </strong>
          {" "}
          or
          <strong>
            {" "}
            Add to Home Screen
          </strong>
          .
        </p>
      )}
    </aside>
  );
}