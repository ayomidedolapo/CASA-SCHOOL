import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
function requireText(source: string, marker: string, label: string) {
  if (!source.includes(marker)) throw new Error(`${label}: missing ${marker}`);
}
function rejectText(source: string, marker: string, label: string) {
  if (source.includes(marker)) throw new Error(`${label}: still contains ${marker}`);
}

const stack = read("src/app/casa-in-app-notification-stack.tsx");
for (const marker of [
  "Drag notifications",
  "Hide all floating notifications",
  "stays unread",
  "View details",
  "hiddenIds",
  "setPointerCapture",
  "releasePointerCapture",
]) requireText(stack, marker, "M46C floating notification UX");
rejectText(stack, "bg-black/5 p-2 backdrop-blur-xl", "M46C expanded grey backing");

for (const path of [
  "src/app/internal/notifications/page.tsx",
  "src/app/schools/[slug]/notifications/notifications-client.tsx",
]) {
  const source = read(path);
  requireText(source, "View details", "M46C notification action wording");
  requireText(source, "Mark read", "M46C notification read wording");
  rejectText(source, "Open context", "M46C old context wording");
}

const terminalHealth = read("src/server/internal/terminal-health.ts");
for (const marker of [
  "supersededEvent",
  "read_at = coalesce(read_at, now())",
  "payload ->> 'terminalId'",
  "authenticated heartbeat for more than five minutes",
  'actionUrl: "/internal/health"',
]) requireText(terminalHealth, marker, "M46C scanner state reconciliation");

const home = read("src/app/internal/page.tsx");
for (const marker of [
  "attendance_terminals terminal",
  "terminal.last_seen_at is null",
  "interval '5 minutes'",
  "not responding for more than five minutes",
]) requireText(home, marker, "M46C current scanner count");
rejectText(home, "attendance_terminal_health_states h where h.observed_status='OFFLINE'", "M46C stale scanner count");

const health = read("src/app/internal/health/page.tsx");
requireText(health, "interval '5 minutes'", "M46C health heartbeat threshold");
requireText(health, "last 5 minutes", "M46C health heartbeat wording");

console.log("CASA M46C notification UX + scanner current-state self-test passed.");
