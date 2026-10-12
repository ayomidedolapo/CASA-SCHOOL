import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const route = source("src/app/id-card/[publicKey]/route.ts");
const enums = source("src/db/schema/student-enums.ts");
const production = source("src/server/card-production/production.ts");
const schoolPreview = source("src/server/card-production/school-preview.ts");

expect(
  route.includes('"X-CASA-Card-Preview-Revision":\n    "M72"'),
  "M72 public card revision marker is missing.",
);


expect(
  route.includes(
    "studentIdentityCards.schoolId,\n            studentCardProductionJobs.schoolId",
  ) &&
  route.includes(
    "studentIdentityCards.id,\n            studentCardProductionJobs.cardId",
  ),
  "Public card lookup weakened the school+card identity boundary.",
);

expect(
  route.includes("cardStatus:\n          studentIdentityCards.status") &&
  route.includes(
    "studentCardProductionJobs.publicAccessKey,\n          publicKey",
  ) &&
  !route.includes(
    'eq(\n            studentIdentityCards.status,\n            "ACTIVE"',
  ),
  "Public card lookup still filters only ACTIVE cards.",
);

expect(
  route.includes(
    'cardStatus !==\n      "READY_FOR_ACTIVATION"',
  ) &&
  route.includes(
    'cardStatus !==\n      "ACTIVE"',
  ),
  "READY_FOR_ACTIVATION and ACTIVE are not both previewable.",
);

for (const [status, state, phrase] of [
  ["LOST", "CARD_LOST", "marked lost"],
  ["REVOKED", "CARD_REVOKED", "revoked"],
  ["REPLACED", "CARD_REPLACED", "replaced"],
  ["EXPIRED", "CARD_EXPIRED", "expired"],
]) {
  expect(
    route.includes(`case "${status}"`) &&
    route.includes(`"${state}"`) &&
    route.includes(phrase),
    `Correct public lifecycle response missing for ${status}.`,
  );
}

expect(
  route.includes("getSchoolWatermarkedCardProductionPreview") &&
  route.includes('"PUBLIC_WATERMARKED_QR"'),
  "Public card preview no longer preserves the protected watermark path.",
);

expect(
  !route.includes("student_biometric_profiles") &&
  !route.includes("biometric") &&
  !route.includes("requireCasa") &&
  !route.includes("requireSchool") &&
  !route.includes("requireRegistry"),
  "Public card preview must not depend on biometric readiness or authenticated operators.",
);

for (const status of [
  "READY_FOR_ACTIVATION",
  "ACTIVE",
  "LOST",
  "REVOKED",
  "REPLACED",
  "EXPIRED",
]) {
  expect(
    enums.includes(`"${status}"`),
    `Card lifecycle enum missing ${status}.`,
  );
}

expect(
  production.includes("publicCardUrl(") &&
  production.includes("publicAccessKey") &&
  schoolPreview.includes("getCurrentCardProductionPreview"),
  "Production/export public-link or protected preview pipeline regressed.",
);

console.log("M72 PUBLIC CARD PREVIEW LIFECYCLE SELFTEST = GREEN");
