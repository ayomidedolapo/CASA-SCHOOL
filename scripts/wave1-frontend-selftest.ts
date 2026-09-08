import assert from "node:assert/strict";
import fs from "node:fs";

const transport =
  fs.readFileSync(
    "src/app/schools/[slug]/attendance/transport/transport-client.tsx",
    "utf8",
  );
const tech =
  fs.readFileSync(
    "src/app/schools/[slug]/technician/attendance/technician-attendance-client.tsx",
    "utf8",
  );
const onboarding =
  fs.readFileSync(
    "src/app/internal/onboarding/onboarding-client.tsx",
    "utf8",
  );
const attendancePage =
  fs.readFileSync(
    "src/app/schools/[slug]/attendance/page.tsx",
    "utf8",
  );

assert.match(
  transport,
  /schoolBusGraceMinutes/,
);
assert.match(
  transport,
  /independentGraceMinutes/,
);
assert.match(
  transport,
  /arrival-method/,
);
assert.match(
  transport,
  /Historical attendance remains unchanged/,
);
assert.doesNotMatch(
  transport,
  /useState\(\s*["'](?:45|20)["']\s*\)/,
  "Wave 1 UI must not initialize transport grace with hard-coded 45/20-minute defaults.",
);
assert.doesNotMatch(
  transport,
  /(?:schoolBusGraceMinutes|independentGraceMinutes)\s*:\s*(?:45|20)\b/,
  "Wave 1 UI must not submit hard-coded 45/20-minute grace values.",
);
assert.doesNotMatch(
  transport,
  /(?:busGrace|independentGrace)\s*=\s*(?:45|20)\b/,
  "Wave 1 UI must not assign hard-coded 45/20-minute grace values.",
);

assert.match(
  tech,
  /attendance\/lifecycle/,
);
assert.match(
  tech,
  /attendance\/sessions\/today/,
);
assert.match(
  tech,
  /"PRESENT"/,
);
assert.match(
  tech,
  /"LATE"/,
);
assert.doesNotMatch(
  tech,
  /attendance\/policies/,
  "Technician operational UI must not expose policy mutation.",
);

assert.match(
  onboarding,
  /CASA \/ capture operations/,
);
assert.match(
  onboarding,
  /\/lock/,
);
assert.match(
  onboarding,
  /Face capture remains provider-gated/,
);
assert.match(
  onboarding,
  /PRIMARY/,
);
assert.match(
  onboarding,
  /SECONDARY/,
);

for (const source of [
  transport,
  tech,
  onboarding,
  attendancePage,
]) {
  assert.match(
    source,
    /#f2f2ef/,
  );
  assert.doesNotMatch(
    source,
    /rounded-3xl|rounded-full/,
    "CASA operational pages must not drift into generic rounded-card SaaS styling.",
  );
}

console.log(
  "CASA School Wave 1 frontend self-test passed.",
);
