import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  CASA_INTERNAL_ROLES,
  CASA_SENSITIVE_CAPABILITIES,
  CASA_TEAM_ONBOARDING_CAPABILITIES,
} from "../src/server/internal/authorization";

assert.deepEqual(
  CASA_INTERNAL_ROLES,
  [
    "CASA_SUPER_ADMIN",
    "CASA_TEAM",
  ],
);

assert.ok(
  CASA_TEAM_ONBOARDING_CAPABILITIES.includes(
    "FACE_ENROLL",
  ),
);
assert.ok(
  CASA_TEAM_ONBOARDING_CAPABILITIES.includes(
    "CARD_READINESS",
  ),
);

assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "ORGANIZATION_RESTRUCTURE",
  ),
);
assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "MASTER_TEMPLATE_ADMIN",
  ),
);
assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "CARD_PRODUCTION_ADMIN",
  ),
);
assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "IDENTITY_SECURITY_INVESTIGATION",
  ),
);
assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "AUDIT_READ",
  ),
);
assert.ok(
  CASA_SENSITIVE_CAPABILITIES.includes(
    "PLATFORM_CONFIGURATION",
  ),
);

const root =
  process.cwd();

const migration =
  readFileSync(
    join(
      root,
      "drizzle/20260902190300_wave1_transport_casa_internal/migration.sql",
    ),
    "utf8",
  );

assert.match(
  migration,
  /casa_internal_memberships/,
);
assert.match(
  migration,
  /casa_internal_school_assignments/,
);
assert.match(
  migration,
  /casa_internal_capability_grants/,
);
assert.match(
  migration,
  /casa_internal_onboarding_locks/,
);
assert.match(
  migration,
  /casa_internal_audit_logs/,
);
assert.doesNotMatch(
  migration,
  /UNIQUE\s*\(\s*"role"\s*\)/i,
);

const onboarding =
  readFileSync(
    join(
      root,
      "src/server/internal/onboarding.ts",
    ),
    "utf8",
  );

assert.match(
  onboarding,
  /guardian_search_text/,
);
assert.match(
  onboarding,
  /class_level_name/,
);
assert.match(
  onboarding,
  /face_status/,
);
assert.match(
  onboarding,
  /card_production_need/,
);
assert.match(
  onboarding,
  /interval '15 minutes'/,
);

const authorization =
  readFileSync(
    join(
      root,
      "src/server/internal/authorization.ts",
    ),
    "utf8",
  );

assert.match(
  authorization,
  /CASA_SUPER_ADMIN/,
);
assert.match(
  authorization,
  /casa_internal_school_assignments/,
);
assert.match(
  authorization,
  /casa_internal_capability_grants/,
);

console.log(
  "CASA School Wave 1 CASA internal authority and onboarding self-test passed.",
);
