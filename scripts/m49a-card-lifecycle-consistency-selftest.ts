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
      ">\n              Revoke\n",
      "existing Revoke action label",
    ],
    [
      "Reissue card with Passkey",
      "controlled reissue label",
    ],
    [
      "{reissueRequired ? (",
      "reissue-only top-action visibility",
    ],
    [
      "First-card creation is automatic.",
      "automatic first-card UI guard",
    ],
    [
      'action:\n            "CARD_REISSUE"',
      "reissue-only Passkey action",
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
    marker,
    label,
  );
}

for (
  const [
    marker,
    label,
  ] of [
    [
      "Create missing first card",
      "manual first-card action",
    ],
    [
      "Missing first digital card created from the active enrollment",
      "manual first-card success copy",
    ],
    [
      "!activeCard &&\n        !replacementCase",
      "old mixed first-card/reissue top-action visibility",
    ],
    [
      "reissueRequired\n          ? await obtainPasskeyStepUpGrant",
      "old nullable Passkey branch",
    ],
    [
      "Mark expired",
      "normal-school expiry action",
    ],
    [
      'void deactivate(\n                  activeCard.id,\n                  "EXPIRED",',
      "expired UI mutation path",
    ],
    [
      "activeCard ||\n        reissueRequired\n          ? await obtainPasskeyStepUpGrant",
      "active-card generic reissue branch",
    ],
  ] as const
) {
  forbidMarker(
    ui,
    marker,
    label,
  );
}

for (
  const [
    marker,
    label,
  ] of [
    [
      '"ACTIVE_CARD_LIFECYCLE_ACTION_REQUIRED"',
      "server active-card reissue guard",
    ],
    [
      "if (activeCard) {",
      "server active-card state gate",
    ],
    [
      "if (!previousCard) {",
      "server zero-card-history gate",
    ],
    [
      '"FIRST_CARD_AUTOMATIC_ONLY"',
      "server automatic-only first-card rule",
    ],
    [
      'const action:\n    CardProductionAction =\n      "CARD_REISSUE";',
      "server manual production is reissue-only",
    ],
  ] as const
) {
  requireMarker(
    production,
    marker,
    label,
  );
}

console.log(
  "CASA M49A card lifecycle consistency self-test passed.",
);
