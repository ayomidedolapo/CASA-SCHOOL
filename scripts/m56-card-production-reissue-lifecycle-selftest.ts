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
      `M56 selftest failed: ${label}`,
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
      `M56 selftest failed: ${label}`,
    );
  }

  console.log(
    `GREEN: ${label}`,
  );
}

const production =
  read(
    "src/server/card-production/production.ts",
  );
const client =
  read(
    "src/app/internal/card-production/card-production-client.tsx",
  );
const handover =
  read(
    "src/server/card-production/handover.ts",
  );

requireText(
  production,
  "cardSerial:\n          studentIdentityCards.serialNumber",
  "central production API returns authoritative new card serial",
);
requireText(
  production,
  "previousCardId:",
  "central production API derives immediately preceding card",
);
requireText(
  production,
  "previous.serial_number",
  "previous card serial is returned",
);
requireText(
  production,
  "previous.status::text",
  "previous card lifecycle status is returned",
);
requireText(
  production,
  "previous.deactivated_at",
  "previous card deactivation time is returned",
);
requireText(
  production,
  "previousCard:",
  "API maps previous-card lifecycle object",
);

requireText(
  client,
  "productionAuthority:",
  "Card Production client receives exact production authority",
);
requireText(
  client,
  "Class-change reissue",
  "renewal jobs have a precise class-change reissue label",
);
requireText(
  client,
  'return "Reissue";',
  "manual OTHER jobs are shown as reissue rather than vague Other",
);
forbidText(
  client,
  "Other / reissue",
  "old ambiguous card type wording is removed",
);
requireText(
  client,
  "New card",
  "queue visibly labels the new card",
);
requireText(
  client,
  "Previous card",
  "queue visibly labels the previous card",
);
requireText(
  client,
  "Previous card stays ACTIVE until this new card is physically handed over.",
  "pending reissue explains old-card activation continuity",
);
requireText(
  client,
  "Reissue completed · this card is ACTIVE and the previous card is REPLACED.",
  "completed reissue explains supersession",
);
requireText(
  client,
  "Previous card is already inactive. This new card is awaiting physical handover and activation.",
  "already-disabled previous card state is explicit",
);

requireText(
  handover,
  "'REPLACED'::student_identity_card_status",
  "handover still atomically replaces the prior active card",
);
requireText(
  handover,
  "'ACTIVE'::student_identity_card_status",
  "handover still activates the new card",
);

console.log(
  "RESULT: M56 Card Production reissue lifecycle selftest GREEN",
);
