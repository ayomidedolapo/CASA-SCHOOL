import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  calculateTransportPunctuality,
} from "../src/server/attendance/transport-punctuality";

assert.deepEqual(
  calculateTransportPunctuality({
    attendanceDate:
      "2026-09-02",
    officialStartTime:
      "08:00",
    actualArrivalDate:
      "2026-09-02",
    actualArrivalClock:
      "07:59",
    arrivalMethod:
      "INDEPENDENT",
    schoolBusGraceMinutes:
      30,
    independentGraceMinutes:
      5,
  }),
  {
    graceMinutesUsed: 0,
    minutesAfterOfficialStart: 0,
    outcome: "ON_TIME",
  },
);

assert.deepEqual(
  calculateTransportPunctuality({
    attendanceDate:
      "2026-09-02",
    officialStartTime:
      "08:00",
    actualArrivalDate:
      "2026-09-02",
    actualArrivalClock:
      "08:20",
    arrivalMethod:
      "SCHOOL_BUS",
    schoolBusGraceMinutes:
      30,
    independentGraceMinutes:
      5,
  }),
  {
    graceMinutesUsed: 30,
    minutesAfterOfficialStart: 20,
    outcome:
      "ON_TIME_WITH_GRACE",
  },
);

assert.equal(
  calculateTransportPunctuality({
    attendanceDate:
      "2026-09-02",
    officialStartTime:
      "08:00",
    actualArrivalDate:
      "2026-09-02",
    actualArrivalClock:
      "08:06",
    arrivalMethod:
      "INDEPENDENT",
    schoolBusGraceMinutes:
      30,
    independentGraceMinutes:
      5,
  }).outcome,
  "LATE",
);

assert.equal(
  calculateTransportPunctuality({
    attendanceDate:
      "2026-09-02",
    officialStartTime:
      "08:00",
    actualArrivalDate:
      "2026-09-02",
    actualArrivalClock:
      "08:31",
    arrivalMethod:
      "SCHOOL_BUS",
    schoolBusGraceMinutes:
      30,
    independentGraceMinutes:
      5,
  }).outcome,
  "LATE",
);

const root =
  process.cwd();

const httpSource =
  readFileSync(
    join(
      root,
      "src/server/attendance/http.ts",
    ),
    "utf8",
  );

assert.match(
  httpSource,
  /requireAttendanceController/,
);
assert.match(
  httpSource,
  /requireAttendanceManager[\s\S]*"OWNER"[\s\S]*"ADMIN"/,
);
assert.match(
  httpSource,
  /requireEarlyDepartureAuthorizer[\s\S]*requireAttendanceManager/,
);

const lifecycleSource =
  readFileSync(
    join(
      root,
      "src/app/api/schools/[slug]/attendance/lifecycle/route.ts",
    ),
    "utf8",
  );

assert.match(
  lifecycleSource,
  /requireAttendanceController/,
);

const sessionSource =
  readFileSync(
    join(
      root,
      "src/app/api/schools/[slug]/attendance/sessions/today/route.ts",
    ),
    "utf8",
  );

assert.match(
  sessionSource,
  /requireAttendanceController/,
);

const policySource =
  readFileSync(
    join(
      root,
      "src/app/api/schools/[slug]/attendance/policies/route.ts",
    ),
    "utf8",
  );

assert.match(
  policySource,
  /requireAttendanceManager/,
);
assert.match(
  policySource,
  /schoolBusGraceMinutes/,
);
assert.match(
  policySource,
  /independentGraceMinutes/,
);

const todaySource =
  readFileSync(
    join(
      root,
      "src/server/attendance/today.ts",
    ),
    "utf8",
  );

assert.match(
  todaySource,
  /"PRESENT"/,
);
assert.match(
  todaySource,
  /ON_TIME_WITH_GRACE/,
);

console.log(
  "CASA School Wave 1 attendance transport and authority self-test passed.",
);
