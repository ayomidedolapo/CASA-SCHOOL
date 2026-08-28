import {
  awsCollectionIdForSchool,
  percentToBasisPoints,
} from "../src/server/biometrics/aws-rekognition";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(
        expected,
      )}, got ${String(actual)}`,
    );
  }
}

assertEqual(
  awsCollectionIdForSchool(
    "00000000-0000-4000-8000-000000000001",
  ),
  "casa-school-00000000000040008000000000000001",
  "school collection derivation",
);

assertEqual(
  percentToBasisPoints(
    98.9735,
  ),
  9897,
  "AWS percent to basis points",
);

assertEqual(
  percentToBasisPoints(
    100,
  ),
  10000,
  "100 percent cap",
);

assertEqual(
  percentToBasisPoints(
    -1,
  ),
  0,
  "negative percent floor",
);

console.log(
  "CASA School AWS Rekognition adapter self-test passed.",
);