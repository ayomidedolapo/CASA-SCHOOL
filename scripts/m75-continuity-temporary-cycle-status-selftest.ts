import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function expect(
  value: unknown,
  message: string,
) {
  if (!value) {
    throw new Error(
      message,
    );
  }
}

const sync =
  source(
    "src/server/attendance/continuity-sync.ts",
  );

const m57 =
  source(
    "drizzle/20261005013000_m57_attendance_safety_temporary_exit/migration.sql",
  );

const health =
  source(
    "src/app/api/health/route.ts",
  );

const cycleUpdateStart =
  sync.indexOf(
    "          updated_cycle as (",
  );

const cycleUpdateEnd =
  sync.indexOf(
    "          recorded_attempt as (",
    cycleUpdateStart,
  );

const cycleUpdate =
  cycleUpdateStart >= 0 &&
  cycleUpdateEnd >
    cycleUpdateStart
    ? sync.slice(
        cycleUpdateStart,
        cycleUpdateEnd,
      )
    : "";

expect(
  m57.includes(
    "status varchar(16) not null default 'AUTHORIZED'",
  ) &&
  m57.includes(
    "constraint student_temporary_exit_cycles_status_check",
  ) &&
  m57.includes(
    "status in ('AUTHORIZED','OUTSIDE','RETURNED','CANCELLED')",
  ),
  "M57 temporary-exit status schema is no longer the varchar/check-constraint contract.",
);

expect(
  !sync.includes(
    "student_temporary_exit_status",
  ),
  "Continuity reconciliation still references the nonexistent student_temporary_exit_status PostgreSQL type.",
);

expect(
  cycleUpdate.includes(
    "status =\n                ${nextCycleStatus},",
  ) &&
  cycleUpdate.includes(
    "cycle.status::text =\n                ${expectedCycleStatus}",
  ),
  "Continuity temporary-cycle transition no longer uses the M57 varchar status contract safely.",
);

expect(
  health.includes(
    '"X-CASA-Release-Revision":\n    "M73"',
  ) &&
  health.includes(
    '"X-CASA-Continuity-Sync-Revision":\n    "M74"',
  ) &&
  health.includes(
    '"X-CASA-Continuity-SQL-Revision":\n    "M75"',
  ),
  "M75 live marker is missing or cumulative release markers regressed.",
);

console.log(
  "M75 CONTINUITY TEMPORARY-CYCLE STATUS SQL SELFTEST = GREEN",
);
