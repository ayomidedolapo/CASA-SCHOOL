import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (!source.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function forbidText(
  source: string,
  needle: string,
  label: string,
) {
  if (source.includes(needle)) {
    throw new Error(`Unexpected ${label}: ${needle}`);
  }
}

const route = read(
  "src/app/api/schools/[slug]/registry/students/route.ts",
);
const client = read(
  "src/app/schools/[slug]/registry/registry-client.tsx",
);
const schoolsRoute = read(
  "src/app/api/internal/platform/schools/route.ts",
);
const schoolsClient = read(
  "src/app/internal/schools/schools-client.tsx",
);
const mailer = read(
  "src/server/messaging/account-access-email.ts",
);
const gmail = read(
  "src/server/messaging/gmail.ts",
);

requireText(
  route,
  "registrationCampuses:",
  "visible campus response",
);
requireText(
  route,
  "inArray(",
  "multi-campus student filter",
);
requireText(
  route,
  "parsed.data.branchId",
  "selected registration campus",
);
forbidText(
  route,
  "Student registration requires one unambiguous operating campus",
  "legacy multi-campus blocker",
);
requireText(
  client,
  "registrationCampuses.length >",
  "multi-campus campus selector",
);
requireText(
  client,
  "branchId:",
  "student campus request",
);
requireText(
  client,
  "Select campus",
  "campus selector copy",
);
requireText(
  schoolsRoute,
  "sendAccountAccessEmail",
  "new-school owner email delivery",
);
requireText(
  schoolsRoute,
  "emailDelivery",
  "new-school email result",
);
requireText(
  schoolsClient,
  "Email delivery:",
  "new-school email delivery UI",
);
requireText(
  mailer,
  "sendGmailEmail",
  "account access Gmail bridge",
);
for (const name of [
  "CASA_GMAIL_OAUTH_CLIENT_ID",
  "CASA_GMAIL_OAUTH_CLIENT_SECRET",
  "CASA_GMAIL_OAUTH_REFRESH_TOKEN",
  "CASA_GMAIL_SENDER_EMAIL",
]) {
  requireText(
    gmail,
    name,
    `Gmail config key ${name}`,
  );
}

console.log(
  "CASA M47A UAT Technician campus + new-school email repair self-test passed.",
);
