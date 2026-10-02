import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

function source(path: string) {
  return readFileSync(
    resolve(
      process.cwd(),
      path,
    ),
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function requireMarker(
  text: string,
  marker: string,
  label: string,
) {
  if (!text.includes(marker)) {
    throw new Error(
      `Missing ${label}: ${marker}`,
    );
  }
}

function forbidMarker(
  text: string,
  marker: string,
  label: string,
) {
  if (text.includes(marker)) {
    throw new Error(
      `Forbidden ${label}: ${marker}`,
    );
  }
}

const ui =
  source(
    "src/app/schools/[slug]/registry/student-cards.tsx",
  );

const production =
  source(
    "src/server/card-production/production.ts",
  );

for (
  const [
    marker,
    label,
  ] of [
    [
      "Mark lost",
      "existing Lost action label",
    ],
    [
      "Mark damaged",
      "existing Damaged action label",
    ],
    [
      ">\\n              Revoke\\n",
      "existing Revoke action label",
    ],
    [
      "Reissue card with Passkey",
      "controlled reissue label",
    ],
    [
      "Create missing first card",
      "first-card recovery label",
    ],
    [
      "!activeCard &&\\n        !replacementCase",
      "active/replacement top-action suppression",
    ],
    [
      "reissueRequired\\n          ? await obtainPasskeyStepUpGrant",
      "reissue-only Passkey branch",
    ],
    [
      "Mark the active card lost, damaged, or revoke it before creating a replacement.",
      "active-card UI guard",
    ],
    [
      "Enter a clear security or administrative reason before revoking this card.",
      "revocation reason requirement",
    ],
  ] as const
) {
  requireMarker(
    ui,
    marker.replaceAll(
      "\\n",
      "\n",
    ),
    label,
  );
}

for (
  const [
    marker,
    label,
  ] of [
    [
      "Mark expired",
      "normal-school expiry action",
    ],
    [
      'void deactivate(\\n                  activeCard.id,\\n                  "EXPIRED",',
      "expired UI mutation path",
    ],
    [
      "activeCard ||\\n        reissueRequired\\n          ? await obtainPasskeyStepUpGrant",
      "active-card generic reissue branch",
    ],
  ] as const
) {
  forbidMarker(
    ui,
    marker.replaceAll(
      "\\n",
      "\n",
    ),
    label,
  );
}

requireMarker(
  production,
  '"ACTIVE_CARD_LIFECYCLE_ACTION_REQUIRED"',
  "server active-card reissue guard",
);

requireMarker(
  production,
  "if (activeCard) {",
  "server active-card state gate",
);

console.log(
  "CASA M49A card lifecycle consistency self-test passed.",
);
