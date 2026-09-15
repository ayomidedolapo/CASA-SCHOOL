import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) =>
  fs.readFileSync(p, "utf8");

const login =
  read("src/server/auth/passkey-login.ts");
const registration =
  read("src/server/auth/passkey-registration.ts");
const onboarding =
  read("src/app/internal/onboarding/onboarding-client.tsx");
const health =
  read("src/app/internal/health/page.tsx");

assert.match(
  login,
  /"rows" in consumed/,
  "Passkey login must accept QueryResult.rows",
);
assert.doesNotMatch(
  login,
  /!Array\.isArray\(consumed\)[\s\S]{0,80}!consumed\[0\]/,
  "Passkey login must not regress to array-only RETURNING handling",
);

assert.match(
  registration,
  /"rows" in result/,
  "Passkey registration must accept QueryResult.rows",
);
assert.doesNotMatch(
  registration,
  /const inserted\s*=\s*Array\.isArray\(result\)[\s\S]{0,80}\?\s*result\[0\]/,
  "Passkey registration must not regress to array-only RETURNING handling",
);

assert.match(
  onboarding,
  /Face capture needs a fresh session/,
  "Onboarding must preserve a visible recovery state after runtime rejection",
);
assert.match(
  onboarding,
  /Start fresh face capture with Passkey/,
  "Onboarding must make the required new ceremony explicit",
);

for (const required of [
  "CASA_BIOMETRIC_PROVIDER_MODE",
  "CASA_AWS_REKOGNITION_REGION",
  "CASA_AWS_REKOGNITION_COLLECTION_PREFIX",
  "CASA_AWS_LIVENESS_STREAM_ROLE_ARN",
  "CASA_BIOMETRIC_FACE_MIN_CONFIDENCE_BPS",
  "CASA_BIOMETRIC_LIVENESS_MIN_CONFIDENCE_BPS",
  "CASA_BIOMETRIC_ASSERTION_HMAC_SECRET",
]) {
  assert.ok(
    health.includes(required),
    `System Health missing biometric requirement ${required}`,
  );
}

assert.match(
  health,
  /CONFIG COMPLETE/,
  "System Health must distinguish complete biometric configuration",
);
assert.doesNotMatch(
  health,
  /Collection prefix configured; credentials hidden/,
  "System Health must not call a collection-prefix-only check configured",
);

console.log(
  "CASA UAT Passkey + biometric truth source self-test passed.",
);
