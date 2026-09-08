import assert from "node:assert/strict";
import fs from "node:fs";

const schema =
  fs.readFileSync(
    "src/db/schema/card-production.ts",
    "utf8",
  );

const layout =
  fs.readFileSync(
    "src/server/card-production/template-layout.ts",
    "utf8",
  );

const render =
  fs.readFileSync(
    "src/server/card-production/render.ts",
    "utf8",
  );

const production =
  fs.readFileSync(
    "src/server/card-production/production.ts",
    "utf8",
  );

const manifest =
  fs.readFileSync(
    "src/server/card-production/manifest.ts",
    "utf8",
  );

for (const internalField of [
  "casaStudentId",
  "admissionNumber",
  "dateOfBirth",
  "cardSerial",
]) {
  assert.ok(
    schema.includes(internalField),
    `Internal production snapshot field missing: ${internalField}`,
  );
}

for (const visibleSource of [
  "SCHOOL_NAME",
  "STUDENT_NAME",
  "SEX",
  "CLASS",
  "ACADEMIC_SESSION",
]) {
  assert.ok(
    layout.includes(`"${visibleSource}"`),
    `Visible template source missing: ${visibleSource}`,
  );
}

for (const forbiddenVisibleSource of [
  "CASA_STUDENT_ID",
  "SCHOOL_STUDENT_ID",
  "DATE_OF_BIRTH",
  "CARD_SERIAL",
]) {
  assert.ok(
    !layout.includes(`"${forbiddenVisibleSource}"`),
    `Internal field leaked into visible template vocabulary: ${forbiddenVisibleSource}`,
  );
}

assert.doesNotMatch(
  render,
  /snapshot\.casaStudentId|snapshot\.admissionNumber|snapshot\.dateOfBirth|snapshot\.cardSerial/,
  "Renderer must not place internal metadata on card artwork.",
);

assert.match(
  render,
  /ACADEMIC_SESSION:[\s\S]*snapshot\.academicSession/,
);

assert.match(
  production,
  /casaStudentId:[\s\S]*student\./,
);
assert.match(
  production,
  /admissionNumber:[\s\S]*student\./,
);
assert.match(
  production,
  /dateOfBirth:[\s\S]*student\./,
);
assert.match(
  production,
  /cardSerial:[\s\S]*credential\.serialNumber/,
);
assert.match(
  production,
  /academicSession:[\s\S]*academic_session_name/,
);
assert.match(
  production,
  /student\.sex ===[\s\S]*"MALE"[\s\S]*"M"[\s\S]*"FEMALE"[\s\S]*"F"/,
);

// The internal XLSX manifest is allowed to use production/audit
// metadata; it is not the physical-card render surface.
assert.match(
  manifest,
  /snapshot\.casaStudentId/,
);
assert.match(
  manifest,
  /snapshot\.cardSerial/,
);

console.log(
  "CASA School card-production visible/internal boundary self-test passed.",
);
