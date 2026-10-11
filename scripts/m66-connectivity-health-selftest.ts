import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

function expect(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const health =
  source(
    "src/scanner/connectivity-health.ts",
  );
const auth =
  source(
    "src/server/attendance/terminal-auth.ts",
  );
const ping =
  source(
    "src/app/api/terminal/connectivity/route.ts",
  );

expect(
  scanner.includes(
    "connectivityHealthLabel",
  ),
  "Scanner connectivity label is not wired.",
);

expect(
  scanner.includes(
    '"/api/terminal/connectivity"',
  ),
  "Scanner connectivity heartbeat is not wired.",
);

expect(
  scanner.includes(
    "connectivityPanel",
  ),
  "Scanner connectivity status panel is missing.",
);

expect(
  health.includes(
    '"DEGRADED"',
  ) &&
  health.includes(
    '"RECOVERING"',
  ) &&
  health.includes(
    '"OFFLINE"',
  ),
  "Connectivity state machine is incomplete.",
);

expect(
  auth.includes(
    "touch?: boolean",
  ) &&
  auth.includes(
    "options.touch !==",
  ),
  "Connectivity heartbeat would still update terminal last-seen state.",
);

expect(
  ping.includes(
    "touch: false",
  ),
  "Connectivity endpoint is not using read-only terminal authentication.",
);

console.log(
  "M66 CONNECTIVITY HEALTH FOUNDATION SELFTEST = GREEN",
);
