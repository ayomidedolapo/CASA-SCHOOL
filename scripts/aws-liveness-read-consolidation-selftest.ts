import assert from "node:assert/strict";
import fs from "node:fs";

const text =
  fs.readFileSync(
    "src/server/biometrics/aws-liveness.ts",
    "utf8",
  );

function functionText(name: string) {
  const start =
    text.indexOf(
      `export async function ${name}`,
    );

  assert.ok(
    start >= 0,
    `Missing function ${name}`,
  );

  const next =
    text.indexOf(
      "\nexport async function ",
      start + 1,
    );

  return text.slice(
    start,
    next >= 0
      ? next
      : text.length,
  );
}

const enrollment =
  functionText(
    "startAwsEnrollmentLiveness",
  );

assert.match(
  enrollment,
  /activeProfileId:[\s\S]*studentBiometricProfiles\.id/,
);

assert.match(
  enrollment,
  /\.leftJoin\([\s\S]*studentBiometricProfiles[\s\S]*studentBiometricProfiles\.studentId,[\s\S]*students\.id/,
);

assert.doesNotMatch(
  enrollment,
  /const profileRows\s*=\s*await db/,
);

assert.match(
  enrollment,
  /const action\s*=\s*student\.activeProfileId[\s\S]*BIOMETRIC_REENROLL[\s\S]*BIOMETRIC_ENROLL/,
);

assert.match(
  enrollment,
  /requirePasskeyStepUpGrant/,
);

const verification =
  functionText(
    "startAwsVerificationLiveness",
  );

assert.match(
  verification,
  /profileProvider:[\s\S]*studentBiometricProfiles\.provider/,
);

assert.match(
  verification,
  /\.leftJoin\([\s\S]*studentBiometricProfiles[\s\S]*attendanceVerificationAttempts\.studentId/,
);

assert.doesNotMatch(
  verification,
  /const profileRows\s*=\s*await db/,
);

assert.match(
  verification,
  /attempt\.profileProvider\s*!==[\s\S]*AWS_REKOGNITION_PROVIDER/,
);

assert.match(
  verification,
  /const activeSessions\s*=\s*await db/,
);

assert.match(
  verification,
  /await createBoundLivenessSession/,
);

console.log(
  "CASA School AWS liveness read-consolidation self-test passed.",
);
