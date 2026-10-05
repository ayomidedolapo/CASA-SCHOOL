import assert from "node:assert/strict";
import fs from "node:fs";

const push = fs.readFileSync(
  "src/server/messaging/guardian-presence-push.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "drizzle/20261005040000_m62_temporary_movement_guardian_push_truth/migration.sql",
  "utf8",
);

assert.equal(
  (
    push.match(
      /event_type\s*=\s*\n\s*excluded\.event_type/g,
    ) ?? []
  ).length,
  2,
  "Both guardian-push upsert paths must repair event_type on conflict.",
);

for (const marker of [
  "STUDENT_TEMPORARILY_OUT",
  "STUDENT_RETURNED_TO_CAMPUS",
  "TEMPORARY_EXITED",
  "TEMPORARY_RETURNED",
]) {
  assert.ok(
    push.includes(marker),
    `Guardian push source must retain ${marker}.`,
  );
}

for (const allowed of [
  "STUDENT_CHECKED_IN",
  "STUDENT_SIGNED_OUT",
  "STUDENT_EARLY_DEPARTURE",
  "STUDENT_TEMPORARILY_OUT",
  "STUDENT_RETURNED_TO_CAMPUS",
  "SUMMER_PRESENT",
  "SUMMER_LATE",
  "SUMMER_SIGNED_OUT",
  "SCHOOL_CALENDAR_NOTICE",
]) {
  assert.ok(
    migration.includes(`'${allowed}'`),
    `M62 DB constraint must preserve/allow ${allowed}.`,
  );
}

assert.ok(
  migration.includes(
    "when NEW.event_type::text = 'TEMPORARY_EXITED'",
  ) &&
    migration.includes(
      "then 'STUDENT_TEMPORARILY_OUT'",
    ),
  "M62 DB trigger must map TEMPORARY_EXITED to temporary-out guardian push.",
);

assert.ok(
  migration.includes(
    "when NEW.event_type::text = 'TEMPORARY_RETURNED'",
  ) &&
    migration.includes(
      "then 'STUDENT_RETURNED_TO_CAMPUS'",
    ),
  "M62 DB trigger must map TEMPORARY_RETURNED to return guardian push.",
);

assert.ok(
  migration.includes(
    "stepped out briefly from school at",
  ) &&
    migration.includes(
      "and is expected back on campus soon. Reason:",
    ),
  "M62 DB trigger must use reason-aware temporary step-out wording.",
);

assert.ok(
  migration.includes(
    "is now back on the school campus premises at",
  ),
  "M62 DB trigger must use explicit return-to-campus wording.",
);

assert.ok(
  migration.includes(
    "and outbox.device_displayed_at is null",
  ),
  "M62 must only rewrite historical temporary rows that have not been displayed.",
);

assert.ok(
  migration.includes(
    "event_type = excluded.event_type",
  ),
  "M62 DB trigger conflict path must repair event_type.",
);

console.log(
  "GREEN: guardian push source repairs event type on both conflict paths",
);
console.log(
  "GREEN: DB trigger distinguishes temporary exit and return",
);
console.log(
  "GREEN: DB constraint preserves attendance + Summer + calendar push types",
);
console.log(
  "GREEN: undisplayed historical temporary rows are repaired without rewriting displayed history",
);
console.log(
  "RESULT: M62 TEMPORARY MOVEMENT GUARDIAN PUSH DB CLOSURE GREEN",
);
