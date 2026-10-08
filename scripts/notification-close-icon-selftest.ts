import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/casa-in-app-notification-stack.tsx"),
  "utf8",
);

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const svgCount = source.split('d="M3 3l10 10M13 3L3 13"').length - 1;

expect(svgCount === 2, `Expected the same SVG X icon twice, found ${svgCount}`);
expect(
  source.includes('className="sticky top-1 z-[100]'),
  "Expanded sticky close control missing",
);
expect(
  source.includes('className="absolute -right-2 -top-2 z-50'),
  "Collapsed close control missing",
);
expect(
  source.includes('aria-label="Close floating notifications"'),
  "Close accessibility label missing",
);
expect(
  source.includes("hideAllFloating();"),
  "Close action missing",
);
expect(
  !source.includes("Ãƒ"),
  "Mojibake marker U+00C3 remains",
);
expect(
  !source.includes("Ã‚"),
  "Mojibake marker U+00C2 remains",
);

for (const character of source) {
  expect(
    character.charCodeAt(0) <= 127,
    `Non-ASCII character remains: U+${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

console.log("NOTIFICATION_CLOSE_ICON=GREEN");
console.log("COLLAPSED_CLOSE_ICON=GREEN");
console.log("EXPANDED_CLOSE_ICON=GREEN");
console.log("NOTIFICATION_COMPONENT_ASCII_SAFE=GREEN");
console.log("NOTIFICATION_MOJIBAKE=REMOVED");