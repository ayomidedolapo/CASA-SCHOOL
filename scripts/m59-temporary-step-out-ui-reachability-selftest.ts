import fs from "node:fs";
import path from "node:path";

function read(rel: string) {
  return fs
    .readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\r\n/g, "\n");
}

function need(ok: boolean, label: string) {
  if (!ok) throw new Error(`M59 failed: ${label}`);
  console.log(`GREEN: ${label}`);
}

const client = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);
const temporary = read(
  "src/server/attendance/temporary-exit.ts",
);

need(
  temporary.includes("session.status = 'OPEN'::attendance_session_status") &&
    temporary.includes("branch_session.status = 'OPEN'"),
  "temporary-exit backend still requires open school + branch attendance",
);
need(
  temporary.includes('state.presence_state !== "ON_CAMPUS"'),
  "temporary-exit backend still requires current ON_CAMPUS attendance",
);
need(
  temporary.includes('"ACTIVE_CARD_REQUIRED"'),
  "temporary-exit backend still requires ACTIVE card",
);
need(
  temporary.includes('"ACTIVE_BIOMETRIC_PROFILE_REQUIRED"'),
  "temporary-exit backend still requires ACTIVE biometric profile",
);
need(
  temporary.includes('"PASSKEY_STEP_UP_REQUIRED"'),
  "temporary-exit backend still requires Passkey authorization",
);

const authorizeNeedle =
  `>
                                  Authorize step-out
                                </button>`;
const authorizeIndex = client.indexOf(authorizeNeedle);
need(authorizeIndex >= 0, "Authorize step-out control exists");
need(
  client.indexOf(authorizeNeedle, authorizeIndex + authorizeNeedle.length) < 0,
  "Authorize step-out button has one authoritative rendering location",
);

const priorOpen = client.lastIndexOf(
  'data?.session?.status === "OPEN"',
  authorizeIndex,
);
const priorClosed = client.lastIndexOf(
  'data?.session?.status === "CLOSED"',
  authorizeIndex,
);
need(
  priorOpen >= 0 && priorOpen > priorClosed,
  "Authorize step-out is reachable from OPEN-session action flow, not CLOSED-session flow",
);

const authorizeArea = client.slice(
  Math.max(0, authorizeIndex - 1600),
  authorizeIndex + 500,
);
need(
  authorizeArea.includes('student.presenceStatus === "ON_CAMPUS"'),
  "Authorize step-out requires ON_CAMPUS student",
);
need(
  authorizeArea.includes("student.scannerCheckoutEligible"),
  "Authorize step-out requires active Scanner-capable card",
);
need(
  authorizeArea.includes('data?.session?.mode === "INSTRUCTIONAL"') &&
    authorizeArea.includes('data?.session?.mode === "PRESENCE_ONLY"'),
  "Authorize step-out is available for both open instructional and presence-only attendance",
);
need(
  authorizeArea.includes('student.temporaryExit?.status === "AUTHORIZED"'),
  "already-authorized step-out renders status instead of duplicate authorization",
);
need(
  client.includes("Step-out authorized - student may scan to leave"),
  "authorized step-out gives clear next Scanner instruction",
);
need(
  client.includes('student.presenceStatus === "TEMPORARILY_OUT"') &&
    client.includes('student.temporaryExit?.status === "OUTSIDE"') &&
    client.includes("Temporarily out - awaiting return scan"),
  "temporary-out state clearly tells staff that Scanner return is pending",
);

const closedIndex = client.indexOf('data?.session?.status === "CLOSED"');
const openIndex = client.indexOf(
  'data?.session?.status === "OPEN"',
  closedIndex + 1,
);
need(
  closedIndex >= 0 &&
    openIndex > closedIndex &&
    !client.slice(closedIndex, openIndex).includes("Authorize step-out"),
  "closed-session after-hours block no longer contains unreachable step-out control",
);

need(
  client.includes('kind: "TEMPORARY_EXIT"'),
  "temporary step-out dialog/action wiring preserved",
);
need(
  client.includes(
    "One Passkey authorization covers this step-out and the student's verified return scan.",
  ),
  "single-authorization return semantics remain explained",
);
need(
  !client.includes("Authorize return") &&
    !client.includes("Mark back in") &&
    !client.includes("Return student"),
  "no manual return bypass was introduced",
);

console.log("RESULT: M59 TEMPORARY STEP-OUT UI REACHABILITY GREEN");
