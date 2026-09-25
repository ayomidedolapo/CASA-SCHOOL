"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ThemeProvider,
} from "@aws-amplify/ui-react";
import type {
  AwsCredentialProvider,
} from "@aws-amplify/ui-react-liveness";

import {
  clearTerminalCredential,
  readTerminalCredential,
  storeTerminalCredential,
} from "@/scanner/device-storage";
import {
  createScannerRequestId,
  isTerminalCredentialShape,
  scannerReasonMessage,
  scannerStudentName,
  type ScannerAttemptResponse,
  type ScannerLivenessStart,
  type ScannerPresenceResult,
  type ScannerStudent,
  type ScannerTerminalSession,
} from "@/scanner/contracts";

import styles from "./scanner.module.css";

const FaceLivenessDetectorCore =
  dynamic(
    () =>
      import(
        "@aws-amplify/ui-react-liveness"
      ).then(
        (module) =>
          module.FaceLivenessDetectorCore,
      ),
    {
      ssr: false,
      loading: () => (
        <div
          className={
            styles.message
          }
        >
          Preparing face camera...
        </div>
      ),
    },
  );

let qrScannerModulePromise:
  Promise<
    typeof import(
      "qr-scanner"
    )
  > | null =
    null;

function loadQrScannerModule() {
  qrScannerModulePromise ??=
    import(
      "qr-scanner"
    );

  return qrScannerModulePromise;
}

const SCANNER_UI_REVISION =
  "2026-09-24-r5";

type Phase =
  | "BOOTING"
  | "UNPROVISIONED"
  | "LOCKED"
  | "WAITING"
  | "READY"
  | "CARD"
  | "LIVENESS"
  | "FACE_RETRY"
  | "STAFF"
  | "RESULT"
  | "ERROR";

interface LivenessState {
  attemptId: string;
  livenessSessionId:
    string;
  providerSessionId:
    string;
  expiresAt: string;
  streaming: {
    region: string;
    accessKeyId:
      string;
    secretAccessKey:
      string;
    sessionToken:
      string;
    expiration:
      string;
  };
}

interface FinalResult {
  student:
    ScannerStudent | null;
  result:
    ScannerPresenceResult;
}

function displayStudentSex(
  value:
    string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "—";
  }

  return (
    normalized
      .charAt(0)
      .toUpperCase() +
    normalized.slice(1)
  );
}

async function parseJson<T>(
  response: Response,
): Promise<T | null> {
  try {
    return (
      await response.json()
    ) as T;
  } catch {
    return null;
  }
}

async function terminalFetch(
  token: string,
  input:
    string,
  init:
    RequestInit = {},
): Promise<Response> {
  const headers =
    new Headers(
      init.headers,
    );

  headers.set(
    "Authorization",
    `Bearer ${token}`,
  );

  return fetch(
    input,
    {
      ...init,
      headers,
      cache:
        "no-store",
      credentials:
        "omit",
    },
  );
}

async function terminalFetchWithRetry(
  token: string,
  input:
    string,
  init:
    RequestInit = {},
  maxAttempts =
    3,
): Promise<Response> {
  let lastError:
    unknown =
      null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      const response =
        await terminalFetch(
          token,
          input,
          init,
        );

      if (
        ![500,502,503,504].includes(
          response.status,
        ) ||
        attempt ===
          maxAttempts
      ) {
        return response;
      }
    } catch (error) {
      lastError =
        error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(
        resolve,
        Math.min(
          750,
          attempt * 250,
        ),
      );
    });
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          "CASA scanner request retry exhausted.",
        )
  );
}

type ScannerWakeLockSentinel = {
  released:
    boolean;
  release:
    () =>
      Promise<void>;
};

type ScannerNavigatorWithWakeLock =
  Navigator & {
    wakeLock?: {
      request:
        (
          type:
            "screen",
        ) =>
          Promise<ScannerWakeLockSentinel>;
    };
    standalone?:
      boolean;
  };

type CameraFacing =
  | "environment"
  | "user";

function QrCamera(
  {
    onDecoded,
    onFailure,
  }: {
    onDecoded:
      (payload: string) =>
        void;
    onFailure:
      (message: string) =>
        void;
  },
) {
  const videoRef =
    useRef<HTMLVideoElement>(
      null,
    );

  const scannerRef =
    useRef<{
      start:
        () =>
          Promise<void>;
      stop:
        () =>
          void;
      destroy:
        () =>
          void;
    } | null>(
      null,
    );

  const wakeLockRef =
    useRef<ScannerWakeLockSentinel | null>(
      null,
    );

  const disposedRef =
    useRef(
      false,
    );

  const handledRef =
    useRef(
      false,
    );

  const generationRef =
    useRef(
      0,
    );

  const startingGenerationRef =
    useRef<number | null>(
      null,
    );

  const lastRestartAtRef =
    useRef(
      0,
    );

  const [
    cameraFacing,
    setCameraFacing,
  ] =
    useState<CameraFacing>(
      "environment",
    );

  const [
    canSwitchCamera,
    setCanSwitchCamera,
  ] =
    useState(false);

  const stopVideoStream =
    useCallback(
      () => {
        const video =
          videoRef.current;

        if (
          video?.srcObject
        ) {
          const stream =
            video.srcObject as
              MediaStream;

          for (
            const track of
            stream.getTracks()
          ) {
            track.stop();
          }

          video.srcObject =
            null;
        }
      },
      [],
    );

  const destroyScanner =
    useCallback(
      () => {
        if (
          scannerRef.current
        ) {
          scannerRef.current
            .stop();
          scannerRef.current
            .destroy();
          scannerRef.current =
            null;
        }

        stopVideoStream();
      },
      [
        stopVideoStream,
      ],
    );

  const acquireWakeLock =
    useCallback(
      async () => {
        if (
          disposedRef.current ||
          document.visibilityState !==
            "visible"
        ) {
          return;
        }

        const wakeLock =
          (
            navigator as
              ScannerNavigatorWithWakeLock
          ).wakeLock;

        if (
          !wakeLock ||
          (
            wakeLockRef.current &&
            !wakeLockRef.current
              .released
          )
        ) {
          return;
        }

        try {
          wakeLockRef.current =
            await wakeLock.request(
              "screen",
            );
        } catch {
          // Wake Lock is best effort.
        }
      },
      [],
    );

  const startScanner =
    useCallback(
      async (
        generation:
          number,
      ) => {
        if (
          disposedRef.current ||
          handledRef.current ||
          generation !==
            generationRef.current
        ) {
          return;
        }

        if (
          startingGenerationRef
            .current ===
          generation
        ) {
          return;
        }

        if (
          !navigator.mediaDevices
            ?.getUserMedia
        ) {
          onFailure(
            "This device does not provide camera access.",
          );
          return;
        }

        startingGenerationRef.current =
          generation;

        try {
          const {
            default:
              QrScanner,
          } =
            await loadQrScannerModule();

          if (
            disposedRef.current ||
            handledRef.current ||
            generation !==
              generationRef.current ||
            !videoRef.current
          ) {
            return;
          }

          destroyScanner();

          const video =
            videoRef.current;

          const instance =
            new QrScanner(
              video,
              (
                result,
              ) => {
                if (
                  disposedRef.current ||
                  handledRef.current ||
                  generation !==
                    generationRef.current
                ) {
                  return;
                }

                const value =
                  result.data.trim();

                if (!value) {
                  return;
                }

                handledRef.current =
                  true;

                instance.stop();

                onDecoded(
                  value,
                );
              },
              {
                preferredCamera:
                  cameraFacing,
                maxScansPerSecond:
                  30,
                calculateScanRegion:
                  (
                    sourceVideo,
                  ) => {
                    const width =
                      sourceVideo
                        .videoWidth;
                    const height =
                      sourceVideo
                        .videoHeight;
                    const smallest =
                      Math.min(
                        width,
                        height,
                      );
                    const size =
                      Math.max(
                        1,
                        Math.round(
                          smallest *
                            0.78,
                        ),
                      );

                    return {
                      x:
                        Math.max(
                          0,
                          Math.round(
                            (
                              width -
                              size
                            ) /
                              2,
                          ),
                        ),
                      y:
                        Math.max(
                          0,
                          Math.round(
                            (
                              height -
                              size
                            ) /
                              2,
                          ),
                        ),
                      width:
                        size,
                      height:
                        size,
                      downScaledWidth:
                        480,
                      downScaledHeight:
                        480,
                    };
                  },
                returnDetailedScanResult:
                  true,
                highlightScanRegion:
                  false,
                highlightCodeOutline:
                  false,
              },
            );

          scannerRef.current =
            instance;

          await instance.start();

          if (
            disposedRef.current ||
            handledRef.current ||
            generation !==
              generationRef.current
          ) {
            instance.stop();
            instance.destroy();
            return;
          }

          await video
            .play()
            .catch(
              () =>
                undefined,
            );

          try {
            const cameras =
              await QrScanner
                .listCameras(
                  true,
                );

            if (
              !disposedRef.current
            ) {
              setCanSwitchCamera(
                cameras.length >
                  1,
              );
            }
          } catch {
            setCanSwitchCamera(
              false,
            );
          }

          await acquireWakeLock();
        } catch {
          if (
            !disposedRef.current &&
            !handledRef.current &&
            generation ===
              generationRef.current
          ) {
            onFailure(
              "Camera paused or became unavailable. Tap the scanner to restart it.",
            );
          }
        } finally {
          if (
            startingGenerationRef
              .current ===
            generation
          ) {
            startingGenerationRef.current =
              null;
          }
        }
      },
      [
        acquireWakeLock,
        cameraFacing,
        destroyScanner,
        onDecoded,
        onFailure,
      ],
    );

  const restartScanner =
    useCallback(
      async () => {
        if (
          disposedRef.current ||
          handledRef.current
        ) {
          return;
        }

        const now =
          Date.now();

        if (
          now -
            lastRestartAtRef.current <
          350
        ) {
          return;
        }

        lastRestartAtRef.current =
          now;

        const generation =
          generationRef.current +
          1;

        generationRef.current =
          generation;

        startingGenerationRef.current =
          null;

        destroyScanner();

        await new Promise<void>(
          (
            resolve,
          ) => {
            window.requestAnimationFrame(
              () =>
                resolve(),
            );
          },
        );

        if (
          disposedRef.current ||
          handledRef.current ||
          generation !==
            generationRef.current
        ) {
          return;
        }

        await acquireWakeLock();
        await startScanner(
          generation,
        );
      },
      [
        acquireWakeLock,
        destroyScanner,
        startScanner,
      ],
    );

  useEffect(
    () => {
      disposedRef.current =
        false;
      handledRef.current =
        false;

      const initialGeneration =
        generationRef.current +
        1;

      generationRef.current =
        initialGeneration;

      void acquireWakeLock();
      void startScanner(
        initialGeneration,
      );

      function recoverCamera() {
        if (
          document.visibilityState ===
            "visible"
        ) {
          void acquireWakeLock();
          void restartScanner();
        }
      }

      document.addEventListener(
        "visibilitychange",
        recoverCamera,
      );

      window.addEventListener(
        "pageshow",
        recoverCamera,
      );

      window.addEventListener(
        "focus",
        recoverCamera,
      );

      const cameraHealthTimer =
        window.setInterval(
          () => {
            if (
              disposedRef.current ||
              handledRef.current ||
              document.visibilityState !==
                "visible"
            ) {
              return;
            }

            const video =
              videoRef.current;

            if (!video) {
              return;
            }

            const stream =
              video.srcObject as
                MediaStream | null;

            const tracks =
              stream?.getVideoTracks() ??
              [];

            const liveTrack =
              tracks.some(
                (
                  track,
                ) =>
                  track.readyState ===
                    "live" &&
                  !track.muted,
              );

            const renderingFrames =
              video.readyState >= 2 &&
              video.videoWidth > 0 &&
              video.videoHeight > 0;

            if (
              !liveTrack ||
              !renderingFrames
            ) {
              void restartScanner();
            }
          },
          2500,
        );

      return () => {
        disposedRef.current =
          true;
        generationRef.current +=
          1;
        startingGenerationRef.current =
          null;

        document.removeEventListener(
          "visibilitychange",
          recoverCamera,
        );

        window.removeEventListener(
          "pageshow",
          recoverCamera,
        );

        window.removeEventListener(
          "focus",
          recoverCamera,
        );

        window.clearInterval(
          cameraHealthTimer,
        );

        destroyScanner();

        if (
          wakeLockRef.current &&
          !wakeLockRef.current
            .released
        ) {
          void wakeLockRef.current
            .release();
        }

        wakeLockRef.current =
          null;
      };
    },
    [
      acquireWakeLock,
      cameraFacing,
      destroyScanner,
      restartScanner,
      startScanner,
    ],
  );

  const switchCamera =
    useCallback(
      () => {
        setCameraFacing(
          (
            current,
          ) =>
            current ===
              "environment"
              ? "user"
              : "environment",
        );
      },
      [],
    );

  return (
    <div
      className={
        styles.cameraFrame
      }
      role="group"
      aria-label="CASA student card scanner camera"
    >
      <video
        ref={
          videoRef
        }
        className={
          styles.camera
        }
        muted
        playsInline
        onClick={
          () => {
            void restartScanner();
          }
        }
      />

      <div
        className={
          styles.cameraHud
        }
        aria-hidden="true"
      >
        <span>
          CASA / LIVE
        </span>
        <span>
          {cameraFacing ===
            "environment"
            ? "REAR CAMERA"
            : "FRONT CAMERA"}
        </span>
      </div>

      <div
        className={
          styles.scanMark
        }
        aria-hidden="true"
      >
        <div
          className={
            styles.scanLine
          }
        />
      </div>

      <div
        className={
          styles.cameraCaption
        }
      >
        Align the card QR inside the frame
      </div>

      <div
        className={
          styles.cameraControls
        }
      >
        <button
          type="button"
          className={
            styles.cameraControl
          }
          onClick={
            (
              event,
            ) => {
              event.stopPropagation();

              void restartScanner();
            }
          }
        >
          Restart
        </button>

        {canSwitchCamera && (
          <button
            type="button"
            className={
              styles.cameraControl
            }
            onClick={
              (
                event,
              ) => {
                event.stopPropagation();
                switchCamera();
              }
            }
            onKeyDown={
              (
                event,
              ) => {
                event.stopPropagation();
              }
            }
            aria-label={
              cameraFacing ===
                "environment"
                ? "Switch to front camera"
                : "Switch to rear camera"
            }
          >
            {cameraFacing ===
              "environment"
              ? "Front camera"
              : "Rear camera"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ScannerClient() {
  useEffect(
    () => {
      // Warm the QR decoder bundle while terminal/session state is loading.
      // This removes decoder-module startup from the first card scan.
      void loadQrScannerModule();
    },
    [],
  );

  const [
    phase,
    setPhase,
  ] =
    useState<Phase>(
      "BOOTING",
    );

  const [
    token,
    setToken,
  ] =
    useState<
      string | null
    >(null);

  const [
    terminalSession,
    setTerminalSession,
  ] =
    useState<
      ScannerTerminalSession | null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState(
      "Starting scanner...",
    );

  const [
    currentAttempt,
    setCurrentAttempt,
  ] =
    useState<
      ScannerAttemptResponse | null
    >(null);

  const [
    liveness,
    setLiveness,
  ] =
    useState<
      LivenessState | null
    >(null);

  const [
    finalResult,
    setFinalResult,
  ] =
    useState<
      FinalResult | null
    >(null);

  const [
    provisionValue,
    setProvisionValue,
  ] =
    useState("");

  const [
    provisioning,
    setProvisioning,
  ] =
    useState(false);
  const [
    setupQrOpen,
    setSetupQrOpen,
  ] =
    useState(false);

  const resetTimer =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const refreshTerminal =
    useCallback(
      async (
        credential:
          string,
      ) => {
        try {
          const response =
            await terminalFetchWithRetry(
              credential,
              "/api/terminal/session",
              {},
              2,
            );

          if (
            response.status ===
              401
          ) {
            setPhase(
              "LOCKED",
            );
            setMessage(
              "This saved scanner credential is no longer accepted. If the School Technician rotated it, choose Replace credential below and paste the new one.",
            );
            return null;
          }

          if (!response.ok) {
            setPhase(
              "ERROR",
            );
            setMessage(
              "CASA could not verify this scanner right now.",
            );
            return null;
          }

          const data =
            await parseJson<
              ScannerTerminalSession
            >(
              response,
            );

          if (!data) {
            setPhase(
              "ERROR",
            );
            setMessage(
              "CASA returned an invalid scanner session.",
            );
            return null;
          }

          setTerminalSession(
            data,
          );

          const scannerCanAcceptCard =
            !data.readiness &&
            (
              data.session?.status ===
                "OPEN" ||
              data.lateStayOnly ===
                true
            );

          if (
            !scannerCanAcceptCard
          ) {
            setPhase(
              "WAITING",
            );
            setMessage(
              scannerReasonMessage(
                data.readiness
                  ?.code ??
                  "NO_ACTIVE_SESSION",
                data.readiness
                  ?.message ??
                  null,
              ),
            );
          } else {
            setPhase(
              "READY",
            );
            setMessage(
              data.lateStayOnly
                ? data.branch
                  ? `Attendance is closed at ${data.branch.name}. A late-stay checkout is authorized, so the scanner is temporarily available only for that checkout.`
                  : "Attendance is closed. A late-stay checkout is authorized, so the scanner is temporarily available only for that checkout."
                : data.branch
                  ? `Ready at ${data.branch.name}. Hold the CASA student card QR inside the frame.`
                  : "Hold your CASA student card in front of the camera.",
            );
          }

          return data;
        } catch {
          setPhase(
            "ERROR",
          );
          setMessage(
            "CASA needs an internet connection to record attendance.",
          );
          return null;
        }
      },
      [],
    );

  const recoverPendingAttempt =
    useCallback(
      async (
        credential:
          string,
      ) => {
        try {
          const response =
            await terminalFetchWithRetry(
              credential,
              "/api/terminal/attempts/pending",
            );

          if (!response.ok) {
            return false;
          }

          const data =
            await parseJson<{
              pending:
                ScannerAttemptResponse | null;
              duplicatePendingCount:
                number;
            }>(
              response,
            );

          if (
            !data?.pending
          ) {
            return false;
          }

          if (
            data.pending
              .requiresStaffAuthorization
          ) {
            setCurrentAttempt(
              data.pending,
            );
            setPhase(
              "STAFF",
            );
            setMessage(
              "Early departure is waiting for staff authorization. The scanner will continue automatically after an authorized staff member confirms the release with CASA Passkey.",
            );
            return true;
          }

          if (
            !data.pending
              .requiresBiometric
          ) {
            return false;
          }

          setCurrentAttempt(
            data.pending,
          );
          setPhase(
            "FACE_RETRY",
          );
          setMessage(
            data.duplicatePendingCount > 1
              ? "Pending face verification recovered. Continue with the latest face check; do not scan the card again."
              : "Pending face verification recovered. Continue face verification without rescanning the card.",
          );
          return true;
        } catch {
          return false;
        }
      },
      [],
    );

  useEffect(
    () => {
      if (
        "serviceWorker" in
        navigator
      ) {
        void navigator
          .serviceWorker
          .register(
            "/scanner-sw.js",
            {
              scope:
                "/scanner",
              updateViaCache:
                "none",
            },
          )
          .then(
            (registration) =>
              registration.update(),
          )
          .catch(
            () =>
              undefined,
          );
      }

      let cancelled =
        false;

      async function boot() {
        await Promise.resolve();

        if (
          cancelled
        ) {
          return;
        }

        if (
          !window
            .isSecureContext
        ) {
          setPhase(
            "ERROR",
          );
          setMessage(
            "The Scanner must run over HTTPS, except during localhost development.",
          );
          return;
        }
        try {
          const saved =
            await readTerminalCredential();

          if (cancelled) {
            return;
          }

          if (!saved) {
            setPhase(
              "UNPROVISIONED",
            );
            setMessage(
              "Provision this device with the one-time terminal credential issued by CASA.",
            );
            return;
          }

          setToken(
            saved,
          );

          const refreshed =
            await refreshTerminal(
              saved,
            );

          if (
            !cancelled &&
            refreshed?.session
          ) {
            await recoverPendingAttempt(
              saved,
            );
          }
        } catch {
          if (
            !cancelled
          ) {
            setPhase(
              "ERROR",
            );
            setMessage(
              "Scanner device storage is unavailable.",
            );
          }
        }
      }

      void boot();

      return () => {
        cancelled =
          true;
      };
    },
    [
      refreshTerminal,
      recoverPendingAttempt,
    ],
  );

  useEffect(
    () => {
      if (!token) {
        return;
      }

      const timer =
        setInterval(
          () => {
            if (
              phase ===
                "READY" ||
              phase ===
                "WAITING" ||
              phase ===
                "LOCKED"
            ) {
              void refreshTerminal(
                token,
              );
            }
          },
          phase ===
            "WAITING"
            ? 5_000
            : phase ===
                "READY"
              ? 15_000
              : 60_000,
        );

      return () =>
        clearInterval(
          timer,
        );
    },
    [
      token,
      phase,
      refreshTerminal,
    ],
  );

  useEffect(
    () => {
      if (!token) {
        return;
      }

      const refresh =
        () => {
          if (
            phase ===
              "READY" ||
            phase ===
              "WAITING"
          ) {
            void refreshTerminal(
              token,
            );
          }
        };

      window.addEventListener(
        "online",
        refresh,
      );
      window.addEventListener(
        "focus",
        refresh,
      );

      return () => {
        window.removeEventListener(
          "online",
          refresh,
        );
        window.removeEventListener(
          "focus",
          refresh,
        );
      };
    },
    [
      token,
      phase,
      refreshTerminal,
    ],
  );

  const resetToReady =
    useCallback(
      async () => {
        if (
          resetTimer.current
        ) {
          clearTimeout(
            resetTimer.current,
          );
          resetTimer.current =
            null;
        }

        setCurrentAttempt(
          null,
        );
        setLiveness(
          null,
        );
        setFinalResult(
          null,
        );

        if (!token) {
          setPhase(
            "UNPROVISIONED",
          );
          return;
        }

        await refreshTerminal(
          token,
        );
      },
      [
        token,
        refreshTerminal,
      ],
    );

  useEffect(
    () => {
      if (
        phase !==
          "RESULT"
      ) {
        return;
      }

      resetTimer.current =
        setTimeout(
          () => {
            void resetToReady();
          },
          6500,
        );

      return () => {
        if (
          resetTimer.current
        ) {
          clearTimeout(
            resetTimer.current,
          );
          resetTimer.current =
            null;
        }
      };
    },
    [
      phase,
      resetToReady,
    ],
  );

  const provision =
    async () => {
      const candidate =
        provisionValue
          .trim();

      if (
        !isTerminalCredentialShape(
          candidate,
        )
      ) {
        setMessage(
          "That is not a valid CASA terminal credential.",
        );
        return;
      }

      setProvisioning(
        true,
      );
      setMessage(
        "Verifying this scanner...",
      );

      try {
        const response =
          await terminalFetch(
            candidate,
            "/api/terminal/session",
          );

        if (!response.ok) {
          setMessage(
            response.status ===
              401
              ? "CASA did not accept this terminal credential."
              : "CASA could not verify the scanner right now.",
          );
          return;
        }

        const data =
          await parseJson<
            ScannerTerminalSession
          >(
            response,
          );

        if (!data) {
          setMessage(
            "CASA returned an invalid scanner session.",
          );
          return;
        }

        await storeTerminalCredential(
          candidate,
        );

        try {
          await navigator.storage
            ?.persist?.();
        } catch {
          // Persistence is a best-effort browser feature.
        }

        setProvisionValue(
          "",
        );
        setToken(
          candidate,
        );
        setTerminalSession(
          data,
        );

        if (
          data.session
        ) {
          setPhase(
            "READY",
          );
          setMessage(
            "Hold your CASA student card in front of the camera.",
          );
        } else {
          setPhase(
            "WAITING",
          );
          setMessage(
            "Scanner provisioned. Attendance is not open right now.",
          );
        }
      } catch {
        setMessage(
          "CASA needs an internet connection to provision this scanner.",
        );
      } finally {
        setProvisioning(
          false,
        );
      }
    };

  const startFace =
    useCallback(
      async (
        attemptId:
          string,
      ) => {
        if (!token) {
          return;
        }

        setPhase(
          "CARD",
        );
        setMessage(
          "Preparing face verification...",
        );

        try {
          const response =
            await terminalFetchWithRetry(
              token,
              `/api/terminal/attempts/${attemptId}/biometric/liveness/start`,
              {
                method:
                  "POST",
              },
            );

          const data =
            await parseJson<
              ScannerLivenessStart & {
                code?:
                  string;
              }
            >(
              response,
            );

          if (
            !response.ok ||
            !data?.liveness
          ) {
            setPhase(
              "ERROR",
            );
            setMessage(
              scannerReasonMessage(
                data?.code,
              ),
            );
            return;
          }

          setLiveness({
            attemptId,
            livenessSessionId:
              data.liveness
                .livenessSessionId,
            providerSessionId:
              data.liveness
                .providerSessionId,
            expiresAt:
              data.liveness
                .expiresAt,
            streaming:
              data.liveness
                .streaming,
          });

          setPhase(
            "LIVENESS",
          );
          setMessage(
            "Look at the camera and follow the instructions.",
          );
        } catch {
          setPhase(
            "ERROR",
          );
          setMessage(
            "CASA could not start face verification.",
          );
        }
      },
      [
        token,
      ],
    );

  useEffect(
    () => {
      if (
        phase !==
          "STAFF" ||
        !token ||
        !currentAttempt
      ) {
        return;
      }

      let cancelled =
        false;

      const attemptId =
        currentAttempt
          .attempt
          .id;

      const check =
        async () => {
          try {
            const response =
              await terminalFetch(
                token,
                `/api/terminal/attempts/${attemptId}`,
              );

            if (
              cancelled ||
              !response.ok
            ) {
              return;
            }

            const status =
              await parseJson<{
                staffAuthorized:
                  boolean;
                requiresBiometric:
                  boolean;
              }>(
                response,
              );

            if (
              !cancelled &&
              status
                ?.staffAuthorized &&
              status
                .requiresBiometric
            ) {
              setMessage(
                "Staff authorization received. Preparing face verification...",
              );

              await startFace(
                attemptId,
              );
            }
          } catch {
            // The next poll retries while the Scanner remains in STAFF state.
          }
        };

      void check();

      const timer =
        setInterval(
          () => {
            void check();
          },
          2_000,
        );

      return () => {
        cancelled =
          true;

        clearInterval(
          timer,
        );
      };
    },
    [
      phase,
      token,
      currentAttempt,
      startFace,
    ],
  );
  const processCard =
    useCallback(
      async (
        qrPayload:
          string,
      ) => {
        if (
          !token ||
          phase !==
            "READY"
        ) {
          return;
        }

        setPhase(
          "CARD",
        );
        setMessage(
          "Identifying student...",
        );

        const requestId =
          createScannerRequestId();

        try {
          const response =
            await terminalFetchWithRetry(
              token,
              "/api/terminal/scan",
              {
                method:
                  "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    requestId,
                    operation:
                      "AUTO",
                    qrPayload,
                  }),
              },
              2,
            );

          const data =
            await parseJson<
              ScannerAttemptResponse & {
                code?:
                  string;
                message?:
                  string;
              }
            >(
              response,
            );

          if (
            !response.ok ||
            !data
          ) {
            setPhase(
              "ERROR",
            );
            setMessage(
              scannerReasonMessage(
                data?.attempt
                  ?.reasonCode ??
                  data?.code ??
                  null,
                data?.message ??
                  null,
              ),
            );
            return;
          }

          setCurrentAttempt(
            data,
          );

          if (
            data
              .requiresStaffAuthorization
          ) {
            setPhase(
              "STAFF",
            );
            setMessage(
              "Early departure requires staff authorization. The scanner will continue automatically after an authorized staff member confirms the release with CASA Passkey.",
            );
            return;
          }

          if (
            !data
              .requiresBiometric
          ) {
            setPhase(
              "ERROR",
            );
            setMessage(
              scannerReasonMessage(
                data.attempt
                  .reasonCode,
                data.message ??
                  null,
              ),
            );
            return;
          }

          await startFace(
            data.attempt.id,
          );
        } catch {
          setPhase(
            "ERROR",
          );
          setMessage(
            navigator.onLine
              ? "The QR code was read, but the connection to CASA was interrupted. The scanner retried automatically; please try the card again."
              : "This scanner is offline. Reconnect to the internet, then try the card again.",
          );
        }
      },
      [
        token,
        phase,
        startFace,
      ],
    );

  const handleDecoded =
    useCallback(
      (
        payload:
          string,
      ) => {
        void processCard(
          payload,
        );
      },
      [
        processCard,
      ],
    );

  const cameraFailure =
    useCallback(
      (
        value:
          string,
      ) => {
        setPhase(
          "ERROR",
        );
        setMessage(
          value,
        );
      },
      [],
    );

  const cancelLiveness =
    useCallback(
      async (
        retry:
          boolean,
      ) => {
        if (
          !token ||
          !liveness
        ) {
          return;
        }

        const current =
          liveness;

        setLiveness(
          null,
        );

        try {
          await terminalFetch(
            token,
            `/api/terminal/attempts/${current.attemptId}/biometric/liveness/cancel`,
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  livenessSessionId:
                    current
                      .livenessSessionId,
                }),
            },
          );
        } catch {
          // Cancellation is best effort; the provider session
          // also expires and cannot record presence itself.
        }

        if (retry) {
          setPhase(
            "FACE_RETRY",
          );
          setMessage(
            "Face verification stopped. You can try the face check again.",
          );
        } else {
          await resetToReady();
        }
      },
      [
        token,
        liveness,
        resetToReady,
      ],
    );

  const completeLiveness =
    useCallback(
      async () => {
        if (
          !token ||
          !liveness
        ) {
          return;
        }

        const current =
          liveness;

        setMessage(
          "Verifying identity...",
        );

        try {
          const response =
            await terminalFetch(
              token,
              `/api/terminal/attempts/${current.attemptId}/biometric/liveness/complete`,
              {
                method:
                  "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    livenessSessionId:
                      current
                        .livenessSessionId,
                  }),
              },
            );

          const data =
            await parseJson<
              ScannerPresenceResult & {
                code?:
                  string;
              }
            >(
              response,
            );

          setLiveness(
            null,
          );

          if (
            !response.ok ||
            !data?.presence
          ) {
            setPhase(
              "ERROR",
            );
            setMessage(
              scannerReasonMessage(
                data?.code,
              ),
            );
            return;
          }

          setFinalResult({
            student:
              currentAttempt
                ?.student ??
              null,
            result:
              data,
          });

          setPhase(
            "RESULT",
          );

          setMessage(
            data.presence
              .operation ===
              "CHECK_OUT"
              ? "Signed out."
              : "Checked in.",
          );
        } catch {
          setLiveness(
            null,
          );
          setPhase(
            "ERROR",
          );
          setMessage(
            "CASA could not complete face verification.",
          );
        }
      },
      [
        token,
        liveness,
        currentAttempt,
      ],
    );

  const credentialProvider =
    useMemo<
      AwsCredentialProvider | null
    >(
      () => {
        if (!liveness) {
          return null;
        }

        const credentials =
          liveness.streaming;

        return async () => ({
          accessKeyId:
            credentials
              .accessKeyId,
          secretAccessKey:
            credentials
              .secretAccessKey,
          sessionToken:
            credentials
              .sessionToken,
          expiration:
            new Date(
              credentials
                .expiration,
            ),
        });
      },
      [
        liveness,
      ],
    );

  const replaceCredential =
    async () => {
      await clearTerminalCredential();

      setToken(
        null,
      );
      setTerminalSession(
        null,
      );
      setCurrentAttempt(
        null,
      );
      setLiveness(
        null,
      );
      setFinalResult(
        null,
      );
      setProvisionValue(
        "",
      );
      setPhase(
        "UNPROVISIONED",
      );
      setMessage(
        "Paste the replacement scanner credential issued by the School Technician.",
      );
    };

  const forgetDevice =
    async () => {
      const confirmation =
        window.prompt(
          "Type RESET to remove this scanner credential from this device.",
        );

      if (
        confirmation !==
          "RESET"
      ) {
        return;
      }

      if (liveness) {
        await cancelLiveness(
          false,
        );
      }

      await clearTerminalCredential();

      setToken(
        null,
      );
      setTerminalSession(
        null,
      );
      setCurrentAttempt(
        null,
      );
      setLiveness(
        null,
      );
      setFinalResult(
        null,
      );
      setProvisionValue(
        "",
      );
      setPhase(
        "UNPROVISIONED",
      );
      setMessage(
        "Provision this device with the one-time terminal credential issued by CASA.",
      );
    };

  const waitingTitle =
    terminalSession
      ?.readiness
      ?.code ===
        "TERMINAL_BRANCH_UNASSIGNED"
      ? "Campus not assigned."
      : terminalSession
          ?.readiness
          ?.code ===
            "ATTENDANCE_BRANCH_SESSION_NOT_PREPARED"
        ? "Attendance not prepared."
        : terminalSession
            ?.readiness
            ?.code ===
              "ATTENDANCE_BRANCH_NOT_OPEN"
          ? "Attendance not opened."
          : terminalSession
              ?.readiness
              ?.code ===
                "ATTENDANCE_POLICY_DAY_MISSING"
            ? "Policy timetable missing."
            : terminalSession
                ?.readiness
                ?.code ===
                  "BRANCH_INACTIVE"
              ? "Campus inactive."
              : "Scanner waiting.";

  const title =
    phase ===
      "UNPROVISIONED"
      ? "Provision scanner."
      : phase ===
          "WAITING"
        ? waitingTitle
        : phase ===
            "READY"
          ? "Scan student card."
          : phase ===
              "LIVENESS"
            ? "Verify face."
            : phase ===
                "RESULT"
              ? finalResult
                  ?.result
                  .presence
                  .operation ===
                "CHECK_OUT"
                ? "Signed out."
                : "Checked in."
              : phase ===
                  "STAFF"
                ? "Staff required."
                : phase ===
                    "FACE_RETRY"
                  ? "Try face again."
                  : phase ===
                      "LOCKED"
                    ? "Scanner unavailable."
                    : phase ===
                        "ERROR"
                      ? "Could not complete."
                      : "Please wait.";

  const resultName =
    finalResult
      ? scannerStudentName(
          finalResult.student,
        )
      : currentAttempt
        ? scannerStudentName(
            currentAttempt.student,
          )
        : null;

  const resultStudent =
    finalResult?.student ??
    null;

  const resultAttendanceLabel =
    finalResult
      ?.result
      .presence
      .operation ===
    "CHECK_OUT"
      ? "Signed out"
      : "Checked in";

  const resultGuardianDelivery =
    finalResult
      ?.result
      .guardianPushDelivery ??
    null;
  const resultGuardianQueued =
    finalResult
      ?.result
      .presence
      .guardianPushQueued ??
    0;
  const resultGuardianAlert =
    resultGuardianDelivery
      ?.sent
      ? (
          resultGuardianDelivery
            .retried >
              0 ||
          resultGuardianDelivery
            .failed >
              0
            ? "Partially sent"
            : "Sent"
        )
      : resultGuardianDelivery
          ?.retried
        ? "Retry scheduled"
        : resultGuardianDelivery
            ?.failed
          ? "Delivery failed"
          : resultGuardianQueued >
              0
            ? "Queued for delivery"
            : "No guardian device";

  const isEarlyDepartureRetry =
    currentAttempt
      ?.attempt
      .operation ===
      "CHECK_OUT" &&
    (
      currentAttempt
        .attempt
        .reasonCode ===
        "EARLY_DEPARTURE_AUTH_REQUIRED" ||
      currentAttempt
        .attempt
        .departureResult ===
        "EARLY"
    );

  return (
    <div
      className={
        styles.shell
      }
    >
      <header
        className={
          styles.header
        }
      >
        <h1
          className={
            styles.wordmark
          }
        >
          CASA
        </h1>

        <div
          className={
            styles.terminal
          }
        >
          {terminalSession
            ? (
                <>
                  {
                    terminalSession
                      .school
                      .name
                  }
                  <br />
                  {
                    terminalSession
                      .terminal
                      .name
                  }
                  <br />
                  {
                    terminalSession
                      .branch
                      ?.name ??
                    "Campus not assigned"
                  }
                </>
              )
            : "Attendance Scanner"}
        </div>

      </header>

      <main
        className={
          styles.main
        }
      >
        <p
          className={
            styles.kicker
          }
        >
          Identity verified attendance
        </p>

        <h2
          className={
            `${styles.title} ${
              phase ===
              "RESULT"
                ? styles.success
                : phase ===
                    "ERROR" ||
                  phase ===
                    "LOCKED"
                  ? styles.failure
                  : ""
            }`
          }
        >
          {title}
        </h2>

        <p
          className={
            styles.message
          }
        >
          {message}
        </p>



        {phase ===
          "UNPROVISIONED" && (
          <div
            className={
              styles.form
            }
          >
            <button
              className={
                styles.button
              }
              type="button"
              disabled={
                provisioning
              }
              onClick={() =>
                setSetupQrOpen(
                  (
                    value,
                  ) =>
                    !value,
                )
              }
            >
              {setupQrOpen
                ? "Close setup camera"
                : "Scan setup QR"}
            </button>

            {setupQrOpen ? (
              <QrCamera
                onDecoded={
                  (
                    payload,
                  ) => {
                    if (
                      isTerminalCredentialShape(
                        payload,
                      )
                    ) {
                      setProvisionValue(
                        payload,
                      );
                      setSetupQrOpen(
                        false,
                      );
                      setMessage(
                        "Setup QR read. Click Provision this device.",
                      );
                    } else {
                      setSetupQrOpen(
                        false,
                      );
                      setMessage(
                        "That QR code is not a CASA scanner setup credential.",
                      );
                    }
                  }
                }
                onFailure={
                  (
                    failure,
                  ) => {
                    setSetupQrOpen(
                      false,
                    );
                    setMessage(
                      failure,
                    );
                  }
                }
              />
            ) : null}

            <input
              className={
                styles.input
              }
              type="password"
              value={
                provisionValue
              }
              onChange={
                (event) =>
                  setProvisionValue(
                    event
                      .target
                      .value,
                  )
              }
              placeholder="CASAT1..."
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={
                false
              }
              aria-label="One-time CASA terminal credential"
            />

            <button
              className={
                styles.button
              }
              type="button"
              disabled={
                provisioning
              }
              onClick={
                () =>
                  void provision()
              }
            >
              {provisioning
                ? "Verifying..."
                : "Provision this device"}
            </button>

            <p
              className={
                styles.message
              }
            >
              Scan the one-time setup QR issued by the School Technician. Manual credential paste remains available only as a fallback. The credential stays in this device&apos;s private browser storage and is never placed in the URL.
            </p>
          </div>
        )}

        {phase ===
          "WAITING" &&
          terminalSession && (
          <div
            className={
              styles.student
            }
          >
            <p
              className={
                styles.studentName
              }
            >
              {
                terminalSession
                  .branch
                  ?.name ??
                "No campus assigned"
              }
            </p>
            <p
              className={
                styles.message
              }
            >
              Date:{" "}
              {
                terminalSession
                  .clock
                  ?.date ??
                "Unknown"
              }
              {" · Session: "}
              {
                terminalSession
                  .session
                  ?.status ??
                "NONE"
              }
            </p>
            <p
              className={
                styles.studentId
              }
            >
              Reason:{" "}
              {
                terminalSession
                  .readiness
                  ?.code ??
                "NO_ACTIVE_SESSION"
              }
            </p>
          </div>
        )}

        {phase ===
          "READY" && (
          <QrCamera
            onDecoded={
              handleDecoded
            }
            onFailure={
              cameraFailure
            }
          />
        )}

        {currentAttempt
          ?.student &&
          (
            phase ===
              "CARD" ||
            phase ===
              "LIVENESS" ||
            phase ===
              "FACE_RETRY" ||
            phase ===
              "STAFF"
          ) && (
          <div
            className={
              styles.student
            }
          >
            <p
              className={
                styles.studentName
              }
            >
              {scannerStudentName(
                currentAttempt.student,
              )}
            </p>
            <p
              className={
                styles.studentId
              }
            >
              {currentAttempt.student.casaStudentId}
            </p>
            <div
              className={
                styles.preVerificationDetails
              }
            >
              {currentAttempt
                .student
                .schoolName && (
                <span>
                  {
                    currentAttempt
                      .student
                      .schoolName
                  }
                </span>
              )}
              {currentAttempt
                .student
                .branchName && (
                <span>
                  {
                    currentAttempt
                      .student
                      .branchName
                  }
                </span>
              )}
              {currentAttempt
                .student
                .className && (
                <span>
                  {
                    currentAttempt
                      .student
                      .className
                  }
                </span>
              )}
              {currentAttempt
                .student
                .sex && (
                <span>
                  {displayStudentSex(
                    currentAttempt
                      .student
                      .sex,
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {phase ===
          "LIVENESS" &&
          liveness &&
          credentialProvider && (
          <>
            <div
              className={
                styles.livenessFrame
              }
            >
              <ThemeProvider>
                <FaceLivenessDetectorCore
                  sessionId={
                    liveness
                      .providerSessionId
                  }
                  region={
                    liveness
                      .streaming
                      .region
                  }
                  onAnalysisComplete={
                    completeLiveness
                  }
                  onUserCancel={
                    () =>
                      void cancelLiveness(
                        true,
                      )
                  }
                  onError={
                    () =>
                      void cancelLiveness(
                        true,
                      )
                  }
                  config={{
                    credentialProvider,
                  }}
                />
              </ThemeProvider>
            </div>
          </>
        )}

        {phase ===
          "FACE_RETRY" &&
          currentAttempt && (
          <div
            className={
              styles.actions
            }
          >
            <button
              className={
                styles.button
              }
              type="button"
              onClick={
                () =>
                  void startFace(
                    currentAttempt
                      .attempt
                      .id,
                  )
              }
            >
              Try face verification again
            </button>

            {!isEarlyDepartureRetry && (
              <button
                className={
                  styles.secondaryButton
                }
                type="button"
                onClick={
                  () =>
                    void resetToReady()
                }
              >
                Next student
              </button>
            )}
          </div>
        )}

        {phase ===
          "STAFF" && (
          <p
            className={
              styles.score
            }
          >
            Waiting for staff authorization · do not scan another card · the scanner will continue automatically
          </p>
        )}

        {phase ===
          "RESULT" &&
          finalResult && (
          <div
            className={
              styles.resultFade
            }
          >
            <div
              className={
                `${styles.student} ${styles.resultSummary}`
              }
            >
              <div
                className={
                  styles.verificationPhotoPanel
                }
              >
                {finalResult
                  .result
                  .verificationImageDataUrl ? (
                  <img
                    className={
                      styles.verificationPhoto
                    }
                    src={
                      finalResult
                        .result
                        .verificationImageDataUrl
                    }
                    alt={`${resultName ?? "Student"} verification`}
                  />
                ) : (
                  <div
                    className={
                      styles.verificationPhotoPlaceholder
                    }
                  >
                    Face verified
                  </div>
                )}
                <p
                  className={
                    styles.verificationPhotoCaption
                  }
                >
                  Current verification image
                </p>
              </div>

              <dl
                className={
                  styles.resultList
                }
              >
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Name
                  </dt>
                  <dd>
                    {resultName ??
                      "Student"}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    CASA ID
                  </dt>
                  <dd>
                    {resultStudent
                      ?.casaStudentId ??
                      "—"}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    School
                  </dt>
                  <dd>
                    {resultStudent
                      ?.schoolName ??
                      terminalSession
                        ?.school
                        .name ??
                      "—"}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Campus
                  </dt>
                  <dd>
                    {resultStudent
                      ?.branchName ??
                      terminalSession
                        ?.branch
                        ?.name ??
                      "—"}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Class
                  </dt>
                  <dd>
                    {resultStudent
                      ?.className ??
                      "—"}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Sex
                  </dt>
                  <dd>
                    {displayStudentSex(
                      resultStudent
                        ?.sex,
                    )}
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Attendance
                  </dt>
                  <dd>
                    {
                      resultAttendanceLabel
                    }
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Identity
                  </dt>
                  <dd>
                    Verified
                  </dd>
                </div>
                <div
                  className={
                    styles.resultRow
                  }
                >
                  <dt>
                    Guardian alert
                  </dt>
                  <dd>
                    {
                      resultGuardianAlert
                    }
                  </dd>
                </div>
              </dl>
            </div>

            <p
              className={
                styles.score
              }
            >
              Identity verification completed.
            </p>

            <div
              className={
                styles.actions
              }
            >
              <button
                className={
                  styles.button
                }
                type="button"
                onClick={
                  () =>
                    void resetToReady()
                }
              >
                Next student
              </button>
            </div>
          </div>
        )}

        {(phase ===
          "ERROR" ||
          phase ===
            "LOCKED" ||
          phase ===
            "WAITING") &&
          token && (
          <div
            className={
              styles.actions
            }
          >
            {phase ===
              "LOCKED" ? (
              <button
                className={
                  styles.button
                }
                type="button"
                onClick={
                  () =>
                    void replaceCredential()
                }
              >
                Replace credential
              </button>
            ) : (
              <button
                className={
                  styles.button
                }
                type="button"
                onClick={
                  () =>
                    void refreshTerminal(
                      token,
                    )
                }
              >
                Check again
              </button>
            )}

            {phase ===
              "LOCKED" && (
              <button
                className={
                  styles.secondaryButton
                }
                type="button"
                onClick={
                  () =>
                    void refreshTerminal(
                      token,
                    )
                }
              >
                Retry old credential
              </button>
            )}

            {phase ===
              "ERROR" && (
              <button
                className={
                  styles.secondaryButton
                }
                type="button"
                onClick={
                  () =>
                    void resetToReady()
                }
              >
                Next student
              </button>
            )}
          </div>
        )}
      </main>

      <footer
        className={
          styles.footer
        }
      >
        <span>
          The card identifies. The face verifies.
          <span
            className={
              styles.revision
            }
          >
            {" "}
            · {SCANNER_UI_REVISION}
          </span>
        </span>

        {token && (
          <details
            className={
              styles.deviceDetails
            }
          >
            <summary>
              Device
            </summary>
            <div
              className={
                styles.devicePanel
              }
            >
              <p>
                {
                  terminalSession
                    ?.terminal
                    .terminalCode ??
                  "CASA terminal"
                }
              </p>
              <p>
                Reset only when reprovisioning or replacing this device.
              </p>
              <button
                className={
                  styles.secondaryButton
                }
                type="button"
                onClick={
                  () =>
                    void forgetDevice()
                }
              >
                Reset scanner
              </button>
            </div>
          </details>
        )}
      </footer>
    </div>
  );
}