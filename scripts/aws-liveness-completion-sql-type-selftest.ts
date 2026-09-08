import fs from "node:fs";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const source =
  fs.readFileSync(
    "src/server/biometrics/aws-liveness.ts",
    "utf8",
  );

const start =
  source.indexOf(
    "export async function completeAwsEnrollmentLiveness",
  );

assert(
  start >= 0,
  "completeAwsEnrollmentLiveness is missing.",
);

const next =
  source.indexOf(
    "\nexport async function ",
    start + 1,
  );

const body =
  source.slice(
    start,
    next >= 0
      ? next
      : source.length,
  );

assert(
  body.includes(
    "${session.authorizationAction}::text",
  ),
  "authorizationAction JSON parameter is not explicitly typed.",
);

assert(
  body.includes(
    "${actorScope}::text =",
  ),
  "actorScope comparison parameter is not explicitly typed.",
);

assert(
  !body.includes(
    "'authorizationAction',\n            ${session.authorizationAction}\n",
  ),
  "Untyped authorizationAction JSON parameter remains.",
);

assert(
  !body.includes(
    "${actorScope} =\n            'CASA_INTERNAL'",
  ),
  "Untyped actorScope comparison parameter remains.",
);

assert(
  body.includes(
    "jsonb_build_object(",
  ) &&
    body.includes(
      "completed_session as (",
    ) &&
    body.includes(
      "STUDENT_FACE_REENROLLED",
    ),
  "Face-completion transaction semantics drifted.",
);

console.log(
  "CASA AWS liveness completion SQL parameter typing self-test passed.",
);
