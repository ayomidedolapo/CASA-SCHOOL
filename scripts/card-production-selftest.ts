import {
  calculateAgeOnDate,
} from "../src/server/card-production/manifest";
import {
  createCardPublicAccessKey,
  publicCardPath,
} from "../src/server/card-production/production";
import {
  parseCardTemplateLayout,
} from "../src/server/card-production/template-layout";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (
    actual !==
    expected
  ) {
    throw new Error(
      `${label}: expected ${String(
        expected,
      )}, got ${String(
        actual,
      )}`,
    );
  }
}

const first =
  createCardPublicAccessKey();

const second =
  createCardPublicAccessKey();

if (
  first ===
    second ||
  !/^[A-Za-z0-9_-]{43}$/.test(
    first,
  ) ||
  !/^[A-Za-z0-9_-]{43}$/.test(
    second,
  )
) {
  throw new Error(
    "Card public access keys are not independent 256-bit base64url values.",
  );
}

assertEqual(
  publicCardPath(
    first,
  ),
  `/id-card/${first}`,
  "public card path",
);

assertEqual(
  calculateAgeOnDate(
    "2010-08-29",
    "2026-08-28",
  ),
  15,
  "age before birthday",
);

assertEqual(
  calculateAgeOnDate(
    "2010-08-28",
    "2026-08-28",
  ),
  16,
  "age on birthday",
);

const layout =
  parseCardTemplateLayout({
    qr: {
      side:
        "BACK",
      x: 0.7,
      y: 0.2,
      size: 0.2,
    },
    frontText: [
      {
        source:
          "STUDENT_NAME",
        x: 0.1,
        y: 0.5,
        fontSize:
          0.04,
        color:
          "#000000",
        align:
          "LEFT",
        weight:
          "700",
        uppercase:
          false,
      },
    ],
    backText: [],
  });

assertEqual(
  layout.qr.side,
  "BACK",
  "template QR side",
);

console.log(
  "CASA School central card-production self-test passed.",
);