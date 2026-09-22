import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(
  relative: string,
) {
  return fs.readFileSync(
    path.join(
      root,
      relative,
    ),
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
      `${label}: missing ${needle}`,
    );
  }
}

const framework =
  read(
    "src/server/internal/operational-notifications.ts",
  );

for (
  const event of
    [
      "SCHOOL_REGISTERED",
      "SCHOOL_SUSPENDED",
      "SCHOOL_REACTIVATED",
      "BRANCH_CREATED",
      "PRIVILEGED_RECOVERY_PERFORMED",
      "PRIVILEGED_ACCESS_CHANGED",
      "AUTH_RATE_LIMIT_TRIGGERED",
      "ATTENDANCE_TERMINAL_OFFLINE",
      "ATTENDANCE_TERMINAL_ONLINE",
      "ATTENDANCE_TERMINAL_UNASSIGNED",
      "CARD_PRODUCTION_FAILURE",
      "CARD_PRODUCTION_CONFIGURATION_FAILURE",
      "CARD_PRODUCTION_BACKLOG",
      "BIOMETRIC_PROVIDER_FAILURE",
      "BIOMETRIC_CONFIGURATION_FAILURE",
      "BIOMETRIC_PROVIDER_PROFILE_MISMATCH",
      "GUARDIAN_PUSH_DELIVERY_FAILED",
      "GUARDIAN_PUSH_WORKER_STALLED",
      "GUARDIAN_EMAIL_INVITE_FAILED",
      "GUARDIAN_EMAIL_NOT_CONFIGURED",
      "PLATFORM_JOB_FAILURE",
      "PLATFORM_CONFIGURATION_FAILURE",
    ]
) {
  requireText(
    framework,
    event,
    "event catalog",
  );
}

requireText(
  framework,
  "membership.role =",
  "recipient routing",
);
requireText(
  framework,
  "CASA_SUPER_ADMIN",
  "super-admin routing",
);
requireText(
  framework,
  "casa_internal_school_assignments",
  "assigned-team routing",
);
requireText(
  framework,
  "operational,dedupKey",
  "deduplication",
);

const notificationsRoute =
  read(
    "src/app/api/internal/notifications/route.ts",
  );
requireText(
  notificationsRoute,
  "reconcileCasaOperationalNotifications",
  "notification reconciliation",
);
requireText(
  notificationsRoute,
  "operational,severity",
  "severity projection",
);
requireText(
  notificationsRoute,
  "operational,category",
  "category projection",
);

const notificationsPage =
  read(
    "src/app/internal/notifications/page.tsx",
  );
requireText(
  notificationsPage,
  "severity:",
  "notification UI severity",
);
requireText(
  notificationsPage,
  "category:",
  "notification UI category",
);

const onboarding =
  read(
    "src/server/internal/onboarding.ts",
  );
requireText(
  onboarding,
  "emitCasaAuditOperationalNotificationBestEffort",
  "audit bridge",
);

const terminal =
  read(
    "src/server/internal/terminal-health.ts",
  );
requireText(
  terminal,
  "emitCasaOperationalNotificationBestEffort",
  "terminal notification hook",
);

const guardianWorker =
  read(
    "src/server/messaging/guardian-push-worker.ts",
  );
requireText(
  guardianWorker,
  "failedBySchool",
  "guardian worker failure aggregation",
);

const guardianInvite =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/push-invite/route.ts",
  );
requireText(
  guardianInvite,
  "GUARDIAN_EMAIL_INVITE_FAILED",
  "guardian email failure hook",
);

const authLogin =
  read(
    "src/app/api/auth/login/route.ts",
  );
requireText(
  authLogin,
  "AUTH_RATE_LIMIT_TRIGGERED",
  "security rate-limit hook",
);

const cardProduction =
  read(
    "src/server/card-production/production.ts",
  );
requireText(
  cardProduction,
  "CARD_PRODUCTION_CONFIGURATION_FAILURE",
  "card configuration hook",
);
requireText(
  cardProduction,
  "CARD_PRODUCTION_FAILURE",
  "card failure hook",
);

const biometricEnrollment =
  read(
    "src/server/biometrics/enrollment.ts",
  );
requireText(
  biometricEnrollment,
  "BIOMETRIC_PROVIDER_FAILURE",
  "biometric enrollment hook",
);

const biometricVerification =
  read(
    "src/server/biometrics/verification.ts",
  );
requireText(
  biometricVerification,
  "BIOMETRIC_PROVIDER_PROFILE_MISMATCH",
  "biometric verification mismatch hook",
);
requireText(
  biometricVerification,
  "BIOMETRIC_CONFIGURATION_FAILURE",
  "biometric configuration hook",
);

if (
  framework.includes(
    "STUDENT_CHECKED_IN",
  ) ||
  framework.includes(
    "STUDENT_SIGNED_OUT",
  )
) {
  throw new Error(
    "Routine attendance events must not enter CASA operational notifications.",
  );
}

console.log(
  "CASA internal operational notification framework self-test passed.",
);
