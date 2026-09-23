import assert from "node:assert/strict";
import fs from "node:fs";

const read = (
  path: string,
) =>
  fs.readFileSync(
    path,
    "utf8",
  );

const schema = read(
  "src/db/schema/card-production.ts",
);
const production = read(
  "src/server/card-production/production.ts",
);
const schoolPreview = read(
  "src/server/card-production/school-preview.ts",
);
const schoolPreviewRoute = read(
  "src/app/api/schools/[slug]/registry/students/[studentId]/cards/production/[jobId]/preview/route.ts",
);
const schoolProductionRoute = read(
  "src/app/api/schools/[slug]/registry/students/[studentId]/cards/production/route.ts",
);
const schoolCards = read(
  "src/app/schools/[slug]/registry/student-cards.tsx",
);
const publicCardRoute = read(
  "src/app/id-card/[publicKey]/route.ts",
);
const replacementBatch = read(
  "src/server/card-production/replacement-batch.ts",
);
const replacementRoute = read(
  "src/app/api/internal/operations/card-production/replacement-batches/route.ts",
);
const internalClient = read(
  "src/app/internal/card-production/card-production-client.tsx",
);

assert.ok(
  schema.includes(
    "CASA_INTERNAL_REPLACEMENT",
  ),
  "Card production authority must distinguish central replacement batches.",
);

assert.ok(
  production.includes(
    "CARD_REPLACEMENT_BATCH_REQUIRED",
  ),
  "School one-off production must be blocked while a replacement case is pending.",
);

assert.ok(
  schoolPreview.includes(
    'fill="#000000"',
  ) &&
    schoolPreview.includes(
      ">CASA<",
    ),
  "School preview must apply a visible black CASA watermark over the QR.",
);

assert.ok(
  schoolPreviewRoute.includes(
    "SCHOOL_WATERMARKED_QR",
  ),
  "School preview route must identify the watermarked artifact.",
);

assert.ok(
  !schoolProductionRoute.includes(
    "publicUrl",
  ),
  "School production API must not expose the clean public artifact URL.",
);

assert.ok(
  schoolCards.includes(
    "schoolPreviewUrl",
  ) &&
    !schoolCards.includes(
      ".publicUrl",
    ),
  "School Registry must use only watermarked preview URLs, including Production history.",
);

assert.ok(
  publicCardRoute.includes(
    "getSchoolWatermarkedCardProductionPreview",
  ) &&
    !publicCardRoute.includes(
      "getCurrentCardProductionPreview",
    ),
  "The legacy/public card image route must return the watermarked preview; CASA internal preview remains the clean authority.",
);

for (
  const marker of [
    "batch_eligible_on",
    "payment_status",
    "CASA_INTERNAL_REPLACEMENT",
    "replacement_card_id",
    "READY_FOR_ACTIVATION",
    "CARD_PRODUCTION_READY",
  ]
) {
  assert.ok(
    replacementBatch.includes(
      marker,
    ),
    `Replacement batch service is missing ${marker}.`,
  );
}

assert.ok(
  replacementRoute.includes(
    "CARD_REPLACEMENT_BATCH_RELEASED",
  ),
  "Central replacement release must be audited.",
);

assert.ok(
  internalClient.includes(
    "Release due batch",
  ),
  "CASA Card Production UI must expose scheduled replacement release.",
);

console.log(
  "CASA M43 school-watermark + replacement-batch selftest GREEN",
);
