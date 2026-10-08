import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/casa-in-app-notification-stack.tsx"),
  "utf8",
);

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

expect(
  source.includes('{expanded ? (') &&
    source.includes('className="sticky top-1 z-[100]'),
  "Expanded sticky close control is missing",
);

expect(
  source.includes('aria-label="Close floating notifications"'),
  "Expanded close control accessibility label is missing",
);

expect(
  source.includes('data-floating-close="true"'),
  "Expanded close control drag exclusion marker is missing",
);

expect(
  source.includes("hideAllFloating();"),
  "Expanded close control does not dismiss the floating stack",
);

expect(
  source.includes("for (const item of floatingItems) next.add(item.id);"),
  "Floating close must hide locally without marking notifications read",
);

expect(
  source.includes("setExpanded(false);"),
  "Floating close must reset expanded state",
);

expect(
  source.includes("View notification centre"),
  "Notification Centre access must remain available",
);

for (const bad of ["Ãƒ", "Ã‚", "Ã¢â‚¬", "Ã¢â€šÂ¬"]) {
  expect(!source.includes(bad), `Notification stack contains mojibake marker: ${bad}`);
}

console.log("NOTIFICATION_EXPANDED_CLOSE=GREEN");
console.log("NOTIFICATION_CLOSE_STICKY_TOP=GREEN");
console.log("NOTIFICATION_CLOSE_STAYS_UNREAD=GREEN");
console.log("NOTIFICATION_CENTRE_PRESERVED=GREEN");
console.log("NOTIFICATION_MOJIBAKE_GUARD=GREEN");