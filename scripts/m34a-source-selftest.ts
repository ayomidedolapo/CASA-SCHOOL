import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

function body(
  relative: string,
) {
  return readFileSync(
    join(
      process.cwd(),
      relative,
    ),
    "utf8",
  );
}

function need(
  relative: string,
  markers:
    string[],
) {
  const text =
    body(relative);

  for (
    const marker of
    markers
  ) {
    if (
      !text.includes(
        marker,
      )
    ) {
      throw new Error(
        `${relative} missing ${marker}`,
      );
    }
  }
}

function reject(
  relative: string,
  markers:
    string[],
) {
  const text =
    body(relative);

  for (
    const marker of
    markers
  ) {
    if (
      text.includes(
        marker,
      )
    ) {
      throw new Error(
        `${relative} still contains ${marker}`,
      );
    }
  }
}

need(
  "drizzle/20260916043000_guardian_fcm_and_notification_branding/migration.sql",
  [
    "guardian_push_devices",
    "guardian_push_outbox",
    "school_notification_branding",
    "guardian_push_devices_relationship_fid_unique",
  ],
);

need(
  "src/server/messaging/firebase-fcm.ts",
  [
    "CASA_FIREBASE_SERVICE_ACCOUNT_BASE64",
    "message: {",
    "fid:",
  ],
);

need(
  "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
  [
    "onRegistered",
    "Add to Home Screen",
    "Allow school notifications",
  ],
);

need(
  "src/app/api/guardian-notifications/[token]/route.ts",
  [
    "sendFcmToFid",
    "FCM_TEST_DELIVERY_FAILED",
    "testPushDelivered",
  ],
);

need(
  "src/app/api/public/schools/[schoolId]/notification-logo/route.ts",
  [
    "school_notification_branding",
    "DejaVu Sans",
  ],
);

need(
  "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
  [
    "Every linked guardian may enable notifications",
    "Save enrollment correction",
    "Save relationship",
    "Create notification link",
  ],
);

need(
  "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/route.ts",
  [
    "relationshipLabel",
    "isEmergencyContact",
    "pickupAuthorized",
  ],
);

need(
  "src/app/schools/[slug]/registry/registry-client.tsx",
  [
    "RegistryM34AOperations",
    "arrivalMethod",
    "Student enrollment and arrival method saved.",
  ],
);

reject(
  "src/app/schools/[slug]/registry/registry-client.tsx",
  [
    "Attendance SMS recipient",
    "Send attendance SMS here",
  ],
);

need(
  "src/server/card-production/bulk-activation.ts",
  [
    "not face_ready",
  ],
);

need(
  "src/server/card-production/render.ts",
  [
    "DejaVu Sans",
  ],
);

need(
  "src/app/internal/templates/template-designer.tsx",
  [
    'STUDENT_NAME: "John Deo"',
  ],
);

need(
  "src/server/school-operations/operations.ts",
  [
    "HEADQUARTERS_OPERATION_SCOPE_REQUIRED",
    "branchAssignment",
    "is_headquarters = true",
  ],
);

need(
  "src/app/api/schools/[slug]/branches/provisioning/route.ts",
  [
    "requireOrganizationAdmin",
    "schoolOperationsErrorResponse",
  ],
);

console.log(
  "CASA M34A focused source self-test passed.",
);
