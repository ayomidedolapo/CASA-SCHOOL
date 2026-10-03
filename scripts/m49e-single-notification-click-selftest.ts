import fs from "node:fs";

const stack =
  fs
    .readFileSync(
      "src/app/casa-in-app-notification-stack.tsx",
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );

function segment(
  start: string,
  end: string,
) {
  const startIndex =
    stack.indexOf(
      start,
    );
  const endIndex =
    stack.indexOf(
      end,
      startIndex +
        start.length,
    );

  if (
    startIndex < 0 ||
    endIndex < 0
  ) {
    throw new Error(
      `Could not isolate ${start} -> ${end}.`,
    );
  }

  return stack.slice(
    startIndex,
    endIndex,
  );
}

const startDrag =
  segment(
    "function startDrag",
    "function drag",
  );

const drag =
  segment(
    "function drag",
    "function endDrag",
  );

if (
  startDrag.includes(
    "setPointerCapture",
  )
) {
  throw new Error(
    "Pointer capture must not happen on pointer-down; it steals normal notification taps.",
  );
}

for (
  const marker of [
    "Math.hypot",
    "<\n        6",
    "setPointerCapture",
    "state.moved",
  ]
) {
  if (
    !drag.includes(
      marker,
    )
  ) {
    throw new Error(
      `Deferred drag capture missing ${marker}.`,
    );
  }
}

for (
  const marker of [
    "floatingItems.length >",
    "setExpanded(",
    "void viewDetails(",
    "suppressClickRef.current",
  ]
) {
  if (
    !stack.includes(
      marker,
    )
  ) {
    throw new Error(
      `Single-vs-multiple notification click routing missing ${marker}.`,
    );
  }
}

console.log(
  "CASA M49E single notification click + deferred drag self-test passed.",
);
