import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file: string) =>
  fs.readFileSync(file, "utf8");

const schema =
  read("src/db/schema/card-production.ts");
const layout =
  read("src/server/card-production/template-layout.ts");
const render =
  read("src/server/card-production/render.ts");
const production =
  read("src/server/card-production/production.ts");
const templates =
  read("src/app/api/internal/card-production/templates/route.ts");
const activate =
  read("src/app/api/internal/card-production/templates/[templateId]/activate/route.ts");
const scannerManifest =
  read("src/app/scanner/manifest.ts");
const scannerLayout =
  read("src/app/scanner/layout.tsx");
const scannerClient =
  read("src/app/scanner/scanner-client.tsx");

assert.match(
  schema,
  /studentCardTemplates[\s\S]*schoolId:\s*uuid\([\s\S]*"school_id"/,
);
assert.match(
  schema,
  /student_card_templates_school_version_unique/,
);
assert.match(
  schema,
  /student_card_templates_one_active_per_school_idx/,
);

for (const value of [
  "SCHOOL_NAME",
  "STUDENT_NAME",
  "SEX",
  "CLASS",
  "ACADEMIC_SESSION",
]) {
  assert.ok(
    layout.includes(`"${value}"`),
    `Missing visible card field ${value}`,
  );
}

for (const value of [
  "CASA_STUDENT_ID",
  "SCHOOL_STUDENT_ID",
  "DATE_OF_BIRTH",
  "CARD_SERIAL",
]) {
  assert.ok(
    !layout.includes(`"${value}"`),
    `Legacy visible field remains: ${value}`,
  );
}

assert.match(
  render,
  /ACADEMIC_SESSION:[\s\S]*snapshot\.academicSession/,
);
assert.doesNotMatch(
  render,
  /snapshot\.casaStudentId|snapshot\.admissionNumber|snapshot\.dateOfBirth|snapshot\.cardSerial/,
);

assert.match(
  production,
  /getActiveCardTemplate\(\s*schoolId: string/,
);
assert.match(
  production,
  /studentCardTemplates\.schoolId,[\s\S]*schoolId/,
);
assert.match(
  production,
  /getActiveCardTemplate\([\s\S]*input\.access\.school\.id/,
);
assert.match(
  production,
  /academic_session\.name[\s\S]*academic_session_name/,
);
assert.match(
  production,
  /academicSession:[\s\S]*academic_session_name/,
);
assert.match(
  production,
  /student\.sex ===[\s\S]*"MALE"[\s\S]*"M"[\s\S]*"FEMALE"[\s\S]*"F"/,
);

assert.match(
  templates,
  /createSchema[\s\S]*schoolId:[\s\S]*\.uuid\(\)/,
);
assert.match(
  templates,
  /export async function GET[\s\S]*schoolId:[\s\S]*studentCardTemplates\.schoolId/,
);
assert.match(
  templates,
  /export async function POST[\s\S]*schoolId:[\s\S]*body\.data\.schoolId/,
);
assert.match(
  templates,
  /\.returning\(\{[\s\S]*schoolId:[\s\S]*studentCardTemplates\.schoolId/,
);

assert.match(
  activate,
  /select[\s\S]*id,[\s\S]*school_id[\s\S]*from student_card_templates/,
);
assert.match(
  activate,
  /status =[\s\S]*'ACTIVE'[\s\S]*school_id =[\s\S]*select school_id[\s\S]*from target/,
);

assert.ok(
  !fs.existsSync("src/app/manifest.ts"),
  "Root Scanner manifest must not remain.",
);
assert.ok(
  fs.existsSync("src/app/scanner/manifest.ts"),
  "Scanner manifest missing.",
);
assert.match(
  scannerManifest,
  /start_url:[\s\S]*"\/scanner"/,
);
assert.match(
  scannerManifest,
  /scope:[\s\S]*"\/scanner"/,
);
assert.match(
  scannerLayout,
  /"\/scanner\/manifest\.webmanifest"/,
);
assert.match(
  scannerClient,
  /serviceWorker[\s\S]*register\([\s\S]*"\/scanner-sw\.js"[\s\S]*scope:[\s\S]*"\/scanner"/,
);

console.log(
  "CASA School backend-finalization contract self-test passed.",
);
