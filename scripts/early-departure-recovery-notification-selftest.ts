import fs from "node:fs";
import path from "node:path";

const root =
  process.cwd();

function read(
  relative: string,
) {
  return fs
    .readFileSync(
      path.join(
        root,
        relative,
      ),
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (
    !source.includes(
      needle,
    )
  ) {
    throw new Error(
      `${label}: missing ${needle}`,
    );
  }
}

function rejectText(
  source: string,
  needle: string,
  label: string,
) {
  if (
    source.includes(
      needle,
    )
  ) {
    throw new Error(
      `${label}: still contains ${needle}`,
    );
  }
}

const scanner =
  read(
    "src/app/scanner/scanner-client.tsx",
  );

if (
  !/data\.pending\s*\.requiresStaffAuthorization/.test(
    scanner,
  )
) {
  throw new Error(
    "pending early departure recovery: requiresStaffAuthorization is not read from data.pending",
  );
}
requireText(
  scanner,
  "Waiting for staff authorization",
  "scanner staff waiting state",
);
requireText(
  scanner,
  "The scanner will continue automatically",
  "scanner automatic continuation",
);

rejectText(
  scanner,
  'phase ===\\n          "STAFF" && (\\n          <div\\n            className={\\n              styles.actions',
  "staff next-student action",
);

const pending =
  read(
    "src/app/api/terminal/attempts/pending/route.ts",
  );

for (
  const marker of [
    "'CHECK_OUT'::attendance_operation",
    "attendance_early_departure_authorizations",
    "'ON_CAMPUS'::attendance_presence_state",
    "EARLY_DEPARTURE_AUTH_REQUIRED",
    "has_early_authorization",
    "requiresStaffAuthorization",
    "requiresBiometric",
  ]
) {
  requireText(
    pending,
    marker,
    "pending attempt recovery",
  );
}

const today =
  read(
    "src/server/attendance/today.ts",
  );

rejectText(
  today,
  "school_notification_outbox",
  "legacy notification outbox must not mask guardian push gaps",
);
for (
  const marker of [
    "guardian_push_outbox",
    "guardian_push_devices",
    "interval '2 hours'",
  ]
) {
  requireText(
    today,
    marker,
    "browser push notification truth",
  );
}

if (
  !/relationship\.receives_notifications\s*=\s*true/.test(
    today,
  )
) {
  throw new Error(
    "browser push notification truth: receives_notifications=true relationship filter is missing",
  );
}

const attendanceClient =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );

requireText(
  attendanceClient,
  "waiting for guardian push reconciliation",
  "notification warning wording",
);
rejectText(
  attendanceClient,
  "no guardian notification outbox row",
  "legacy-only warning wording",
);

console.log(
  "CASA early-departure recovery + guardian notification truth self-test passed.",
);
