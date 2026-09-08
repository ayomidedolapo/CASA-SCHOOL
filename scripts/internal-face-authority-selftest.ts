import assert from "node:assert/strict";
import fs from "node:fs";

function read(
  path: string,
) {
  return fs.readFileSync(
    path,
    "utf8",
  );
}

const migration =
  read(
    "drizzle/20260905030000_internal_face_authority/migration.sql",
  );
const passkeys =
  read(
    "src/db/schema/passkeys.ts",
  );
const livenessSchema =
  read(
    "src/db/schema/biometric-provider-sessions.ts",
  );
const profileSchema =
  read(
    "src/db/schema/student-biometrics.ts",
  );
const eventSchema =
  read(
    "src/db/schema/biometric-profile-events.ts",
  );
const passkeyStepUp =
  read(
    "src/server/auth/passkey-step-up.ts",
  );
const internalAuthorization =
  read(
    "src/server/internal/authorization.ts",
  );
const awsLiveness =
  read(
    "src/server/biometrics/aws-liveness.ts",
  );
const onboarding =
  read(
    "src/app/internal/onboarding/onboarding-client.tsx",
  );
const internalStart =
  read(
    "src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/biometrics/liveness/start/route.ts",
  );
const internalComplete =
  read(
    "src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/biometrics/liveness/complete/route.ts",
  );
const internalOptions =
  read(
    "src/app/api/internal/onboarding/schools/[schoolId]/auth/passkey/step-up/options/route.ts",
  );
const internalVerify =
  read(
    "src/app/api/internal/onboarding/schools/[schoolId]/auth/passkey/step-up/verify/route.ts",
  );
const internalCancel =
  read(
    "src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/biometrics/liveness/cancel/route.ts",
  );
const passkeyClient =
  read(
    "src/client/passkey-step-up.ts",
  );

for (
  const marker of [
    "internal_membership_id",
    "initiated_by_internal_membership_id",
    "enrolled_by_internal_membership_id",
    "actor_internal_membership_id",
    "auth_passkey_step_up_grants_actor_scope_check",
    "student_biometric_profiles_enroller_scope_check",
    "student_biometric_profile_events_actor_scope_check",
    "biometric_liveness_sessions_internal_membership_fk",
  ]
) {
  assert.match(
    migration,
    new RegExp(
      marker,
    ),
    `migration marker: ${marker}`,
  );
}

assert.match(
  passkeys,
  /internalMembershipId/,
);
assert.match(
  passkeys,
  /auth_passkey_step_up_grants_actor_scope_check/,
);
assert.match(
  livenessSchema,
  /initiatedByInternalMembershipId/,
);
assert.match(
  profileSchema,
  /enrolledByInternalMembershipId/,
);
assert.match(
  eventSchema,
  /actorInternalMembershipId/,
);
for (
  const schema of [
    passkeys,
    livenessSchema,
    eventSchema,
  ]
) {
  assert.match(
    schema,
    /\.where\([\s\S]*internalMembershipId[\s\S]*is not null/i,
  );
}

assert.match(
  internalAuthorization,
  /requireCasaInternalOnboardingCapability/,
);
assert.match(
  internalAuthorization,
  /"FACE_ENROLL"/,
);

assert.match(
  passkeyStepUp,
  /beginCasaInternalPasskeyStepUp/,
);
assert.match(
  passkeyStepUp,
  /finishCasaInternalPasskeyStepUp/,
);
assert.match(
  passkeyStepUp,
  /requireCasaInternalPasskeyStepUpGrant/,
);
assert.match(
  passkeyStepUp,
  /internal_membership_id/,
);
assert.match(
  passkeyStepUp,
  /export async function beginPasskeyStepUp/,
);
assert.match(
  passkeyStepUp,
  /export async function finishPasskeyStepUp/,
);

assert.match(
  awsLiveness,
  /actorScope\?:/,
);
assert.match(
  awsLiveness,
  /"CASA_INTERNAL"/,
);
assert.match(
  awsLiveness,
  /initiatedByInternalMembershipId/,
);
assert.match(
  awsLiveness,
  /enrolled_by_internal_membership_id/,
);
assert.match(
  awsLiveness,
  /actor_internal_membership_id/,
);
assert.match(
  awsLiveness,
  /STUDENT_FACE_ENROLLED/,
);

for (
  const route of [
    internalStart,
    internalComplete,
    internalOptions,
    internalVerify,
    internalCancel,
  ]
) {
  assert.match(
    route,
    /requireCasaInternalOnboardingCapability/,
  );
  assert.match(
    route,
    /"FACE_ENROLL"/,
  );
}

assert.match(
  internalStart,
  /actorScope:\s*"CASA_INTERNAL"/,
);
assert.match(
  internalComplete,
  /actorScope:\s*"CASA_INTERNAL"/,
);
assert.match(
  passkeyClient,
  /obtainCasaInternalPasskeyStepUpGrant/,
);
assert.match(
  passkeyClient,
  /\/api\/internal\/onboarding\/schools\/\$\{encodeURIComponent/,
);
assert.match(
  onboarding,
  /obtainCasaInternalPasskeyStepUpGrant/,
);
assert.match(
  onboarding,
  /FaceLivenessDetectorCore/,
);
assert.match(
  onboarding,
  /Capture face with Passkey/,
);
assert.match(
  onboarding,
  /Face capture remains provider-gated/,
);
assert.doesNotMatch(
  onboarding,
  /Open identity operations \/ school role required/,
);

console.log(
  "CASA School internal face-authority source self-test passed.",
);
