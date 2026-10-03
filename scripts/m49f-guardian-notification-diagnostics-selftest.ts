import fs from "node:fs";

const source =
  fs
    .readFileSync(
      "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );

function requireText(
  marker: string,
) {
  if (
    !source.includes(
      marker,
    )
  ) {
    throw new Error(
      `Guardian notification diagnostics missing ${marker}`,
    );
  }
}

function requirePattern(
  pattern: RegExp,
  label: string,
) {
  if (
    !pattern.test(
      source,
    )
  ) {
    throw new Error(
      `Guardian notification diagnostics missing ${label}`,
    );
  }
}

for (
  const marker of [
    "type NotificationDiagnostics",
    "Notification diagnostics",
    "Browser permission",
    "Firebase worker",
    "Worker scope",
    "Firebase registration",
    "Installation ID received",
    "CASA device save",
    "Last error",
    "serviceWorker.scope",
    "Notification.permission",
    "/firebase-messaging-sw.js",
  ]
) {
  requireText(
    marker,
  );
}

requirePattern(
  /interface LinkData \{\n\s+school:/,
  "valid LinkData interface newline",
);

requirePattern(
  /serviceWorker\s*:\s*"REGISTERED"/,
  "registered service-worker diagnostic state",
);

requirePattern(
  /firebaseRegistration\s*:\s*"REGISTERED"/,
  "registered Firebase diagnostic state",
);

requirePattern(
  /installationId\s*:\s*"RECEIVED"/,
  "Installation ID received diagnostic state",
);

requirePattern(
  /casaDeviceSave\s*:\s*"SAVING"/,
  "CASA device save in-progress state",
);

requirePattern(
  /casaDeviceSave\s*:\s*"SAVED"/,
  "CASA device save success state",
);

requirePattern(
  /casaDeviceSave\s*:\s*"FAILED"/,
  "CASA device save failure state",
);

requirePattern(
  /\{diagnostics\.installationId\s*===\s*"RECEIVED"\s*\?\s*"YES"\s*:\s*"NO"\}/,
  "Installation ID YES/NO-only rendering",
);

if (
  source.includes(
    "interface LinkData {\\n",
  )
) {
  throw new Error(
    "Literal backslash-n corruption must never appear in LinkData.",
  );
}

if (
  /<dd[^>]*>\s*\{[^}]*fid[^}]*\}\s*<\/dd>/i.test(
    source,
  )
) {
  throw new Error(
    "Raw Firebase Installation ID must not be rendered.",
  );
}

console.log(
  "CASA M49F guardian notification diagnostics self-test passed.",
);