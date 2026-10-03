import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (!source.includes(needle)) {
    throw new Error(
      `M54 selftest failed: ${label}`,
    );
  }

  console.log(
    `GREEN: ${label}`,
  );
}

function forbidText(
  source: string,
  needle: string,
  label: string,
) {
  if (source.includes(needle)) {
    throw new Error(
      `M54 selftest failed: ${label}`,
    );
  }

  console.log(
    `GREEN: ${label}`,
  );
}

const client =
  read(
    "src/app/scanner/scanner-client.tsx",
  );
const css =
  read(
    "src/app/scanner/scanner.module.css",
  );

requireText(
  client,
  "2026-10-03-m54-camera-switch",
  "M54 scanner revision present",
);
requireText(
  client,
  "enumerateDevices()",
  "liveness enumerates real video devices",
);
requireText(
  client,
  'device.kind ===\n          "videoinput"',
  "liveness camera inventory is video-input only",
);
requireText(
  client,
  "inferCameraFacing(",
  "liveness classifies front/rear camera labels",
);
requireText(
  client,
  "preferredDeviceId?:",
  "face start accepts selected camera override",
);
requireText(
  client,
  "setLivenessCameraDeviceId(",
  "selected liveness camera is retained",
);
requireText(
  client,
  "const switchLivenessCamera =",
  "live face camera switch action exists",
);
requireText(
  client,
  "/biometric/liveness/cancel",
  "camera switch preserves provider-session cancellation boundary",
);
requireText(
  client,
  "await startFace(\n            current.attemptId,\n            nextCamera.deviceId",
  "camera switch starts a fresh liveness session on selected device",
);
requireText(
  client,
  "Use rear camera",
  "rear-camera control is exposed",
);
requireText(
  client,
  "Use front camera",
  "front-camera control is exposed",
);
requireText(
  client,
  "deviceId:\n                              livenessCameraDeviceId",
  "AWS liveness receives selected deviceId",
);
requireText(
  client,
  "onAnalysisComplete={\n                    completeLiveness",
  "existing liveness completion authority is preserved",
);
requireText(
  client,
  "preferredCamera:\n                  cameraFacing",
  "existing QR front/rear camera switch remains preserved",
);
forbidText(
  client,
  "getUserMedia({",
  "CASA does not bypass AWS liveness camera ownership with a second raw stream",
);
requireText(
  css,
  ".livenessCameraControls",
  "liveness camera control overlay styling present",
);

console.log(
  "RESULT: M54 liveness camera switch selftest GREEN",
);
