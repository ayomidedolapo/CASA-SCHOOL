import assert from "node:assert/strict";
import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(
    path,
    "utf8",
  );
}

const students =
  read(
    "src/db/schema/students.ts",
  );
const validation =
  read(
    "src/server/registry/validation.ts",
  );
const registration =
  read(
    "src/server/students/registration.ts",
  );
const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );
const guardianOps =
  read(
    "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
  );
const inviteRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/push-invite/route.ts",
  );
const guardianPage =
  read(
    "src/app/guardian-notifications/[token]/page.tsx",
  );
const guardianApi =
  read(
    "src/app/api/guardian-notifications/[token]/route.ts",
  );
const idCard =
  read(
    "src/app/id-card/[publicKey]/route.ts",
  );
const internalPreview =
  read(
    "src/app/api/internal/operations/card-production/jobs/[jobId]/preview/route.ts",
  );
const renderer =
  read(
    "src/server/card-production/render.ts",
  );
const renderHealth =
  read(
    "src/app/api/internal/operations/card-production/render-health/route.ts",
  );
const summer =
  read(
    "src/app/schools/[slug]/summer/summer-client.tsx",
  );
const migration =
  read(
    "drizzle/20260921173000_m41_product_trust_intake_closure/migration.sql",
  );

assert.match(
  students,
  /admissionDate:\s*date\(\s*"admission_date",\s*\),/,
  "Admission date must be nullable in the Drizzle schema.",
);
assert.doesNotMatch(
  students,
  /admissionDate:\s*date\(\s*"admission_date",\s*\)\.notNull\(\)/,
);
assert.match(
  validation,
  /admissionDate:[\s\S]*?nullable\(\)[\s\S]*?optional\(\)/,
  "Admission date must be optional/nullable in registry validation.",
);
assert.match(
  registration,
  /admissionDate\?:[\s\S]*?string[\s\S]*?null/,
);
assert.match(
  registration,
  /\$\{input\.admissionDate \?\? null\}::date/,
);
assert.match(
  registry,
  /Admission date \/ optional/,
);
assert.match(
  registry,
  /Enrollment starts on/,
);
assert.match(
  registry,
  /date this student starts this class\/session/i,
);

assert.match(
  inviteRoute,
  /sendGuardianInviteEmail/,
);
assert.match(
  inviteRoute,
  /buildTrustedSchoolLinkMessage/,
);
assert.match(
  inviteRoute,
  /shareText/,
);
assert.match(
  inviteRoute,
  /whatsappUrl/,
);
assert.match(
  guardianOps,
  /Copy message \+ link/,
);
assert.match(
  guardianOps,
  /Open WhatsApp/,
);
assert.match(
  guardianOps,
  /\{inviteUrl\}/,
  "Raw guardian link must remain visible.",
);
assert.match(
  guardianPage,
  /generateMetadata/,
);
assert.match(
  guardianPage,
  /notification-logo/,
);
assert.match(
  guardianApi,
  /notification-logo/,
);

assert.match(
  renderer,
  /renderExistingStudentCardPreview/,
);
assert.match(
  renderer,
  /CARD_TEXT_FONT_FILE/,
);
assert.match(
  renderer,
  /fontfile:\s*CARD_TEXT_FONT_FILE/,
);
assert.match(
  renderer,
  /NotoSans\.ttf/,
);
assert.match(
  renderer,
  /AYỌMÍDÉ ỌLÁYÍWỌLÁ/,
);
assert.doesNotMatch(
  renderer,
  /function textSvg/,
  "Card text must not depend on host SVG font discovery.",
);
assert.match(
  renderHealth,
  /sharp-text-fontfile-noto-sans/,
);
assert.match(
  renderHealth,
  /fontFileBytes/,
);
assert.match(
  renderer,
  /qrImage/,
);
assert.match(
  idCard,
  /getCurrentCardProductionPreview/,
);
assert.match(
  idCard,
  /LIVE_RENDER_WITH_PRESERVED_QR/,
);
assert.match(
  internalPreview,
  /getCurrentCardProductionPreview/,
);
assert.match(
  renderer,
  /\.source\s*!==\s*"ACADEMIC_SESSION"/,
  "Academic session must remain suppressed on permanent physical cards regardless of renderer callback variable naming.",
);
assert.match(
  renderer,
  /\.source\s*!==\s*"CLASS"/,
  "Class must remain suppressed on permanent physical cards regardless of renderer callback variable naming.",
);
assert.match(
  renderer,
  /ACADEMIC_SESSION:\s*""/,
  "Academic session resolver must stay blank on permanent physical cards.",
);
assert.match(
  renderer,
  /CLASS:\s*""/,
  "Class resolver must stay blank on permanent physical cards.",
);

assert.match(
  summer,
  /How Summer registration works/,
);
assert.match(
  summer,
  /Register school student/,
);
assert.match(
  summer,
  /Register Summer-only guest/,
);
assert.match(
  summer,
  /does not create a normal academic enrollment or ID card/i,
);

assert.match(
  migration,
  /ALTER COLUMN "admission_date"[\s\S]*DROP NOT NULL/,
);

console.log(
  "CASA post-M40 product/trust closure self-test passed.",
);
