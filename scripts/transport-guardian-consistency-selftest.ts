import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative: string) {
  return fs
    .readFileSync(
      path.join(root, relative),
      "utf8",
    )
    .replace(/\r\n/g, "\n");
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

function requireRegex(
  source: string,
  pattern: RegExp,
  label: string,
) {
  if (!pattern.test(source)) {
    throw new Error(
      `${label}: expected pattern not found`,
    );
  }
}

function rejectRegex(
  source: string,
  pattern: RegExp,
  label: string,
) {
  if (pattern.test(source)) {
    throw new Error(
      `${label}: forbidden pattern still present`,
    );
  }
}

const transportPage =
  read(
    "src/app/schools/[slug]/attendance/transport/page.tsx",
  );

requireText(
  transportPage,
  "listVisibleBranches",
  "transport campus authority",
);

requireText(
  transportPage,
  "branches={branches}",
  "transport campus handoff",
);

const transportClient =
  read(
    "src/app/schools/[slug]/attendance/transport/transport-client.tsx",
  );

requireText(
  transportClient,
  "selectedBranchId",
  "transport selected campus",
);

requireText(
  transportClient,
  "normalizePolicyTime",
  "transport persisted time normalization",
);

requireText(
  transportClient,
  "body.issues",
  "transport validation issue source",
);

requireText(
  transportClient,
  "body.issues[0]?.message",
  "transport validation issue message",
);

requireRegex(
  transportClient,
  /\/branches\/\$\{encodeURIComponent\(\s*selectedBranchId,\s*\)\}\/attendance\/policies/g,
  "transport branch policy endpoint",
);

rejectRegex(
  transportClient,
  /\/api\/schools\/\$\{encodeURIComponent\(\s*slug,\s*\)\}\/attendance\/policies/g,
  "transport old school-wide policy endpoint",
);

requireText(
  transportClient,
  "day.checkOutClosesAt",
  "transport preserves checkout close",
);

const guardianRoute =
  read(
    "src/app/api/schools/[slug]/registry/guardians/route.ts",
  );

requireText(
  guardianRoute,
  "from student_guardians sg",
  "guardian relationship truth",
);

requireText(
  guardianRoute,
  "device.student_guardian_link_id =",
  "guardian device relationship join",
);

requireText(
  guardianRoute,
  "sg.receives_notifications = true",
  "guardian notification opt-in truth",
);

requireText(
  guardianRoute,
  "group by",
  "guardian notification aggregate",
);

requireText(
  guardianRoute,
  "notificationCountByGuardian",
  "guardian device count merge",
);

rejectRegex(
  guardianRoute,
  /\$\{guardians\.id\}/g,
  "guardian correlated raw SQL",
);

const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );

requireText(
  registry,
  "activeNotificationDevices: number;",
  "guardian list device count type",
);

requireText(
  registry,
  "Notifications enabled ·",
  "guardian list enabled label",
);

requireText(
  registry,
  "await response.text()",
  "registry resilient response parsing",
);

requireText(
  registry,
  "JSON.parse(",
  "registry guarded JSON parsing",
);

console.log(
  "CASA transport + guardian consistency self-test passed.",
);
