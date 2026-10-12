import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(
    path,
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function expect(
  value: unknown,
  message: string,
) {
  if (!value) {
    throw new Error(
      message,
    );
  }
}

const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const sync =
  source(
    "src/server/attendance/continuity-sync.ts",
  );
const route =
  source(
    "src/app/api/terminal/continuity/sync/route.ts",
  );
const temporaryExit =
  source(
    "src/server/attendance/temporary-exit.ts",
  );
const guardianPresence =
  source(
    "src/server/messaging/guardian-presence-push.ts",
  );
const guardianWorker =
  source(
    "src/server/messaging/guardian-push-worker.ts",
  );

expect(
  scanner.includes(
    "movement:\n                              event.movement,",
  ),
  "Scanner continuity payload does not preserve null versus legacy undefined movement intent.",
);

expect(
  scanner.includes(
    '| "DEFERRED"',
  ) &&
    scanner.includes(
      'result.status ===\n                      "REJECTED"',
    ),
  "Scanner does not preserve DEFERRED rows as pending background work.",
);

expect(
  scanner.includes(
    "listPendingContinuityEvents(\n                1,",
  ),
  "Background reconciliation is not limited to one durable event per request.",
);

expect(
  scanner.includes(
    "const continuitySyncingRef =\n    useRef(false);",
  ) &&
    scanner.includes(
      "while (\n            continuitySyncingRef\n              .current &&",
    ) &&
    scanner.includes(
      "Finishing an earlier attendance reconciliation before this scan...",
    ),
  "A scanned card is not serialized safely behind an in-flight background reconciliation.",
);

const effectNeedle =
`      if (
        connectivityHealth !==
          "HEALTHY" ||
        continuityPending <=
          0 ||
        continuitySyncing ||
        (
          phase !==
            "READY" &&
          phase !==
            "WAITING"
        )
      ) {`;

expect(
  scanner.includes(
    effectNeedle,
  ) &&
    scanner.includes(
      "      phase,\n      connectivityHealth,\n      continuityPending,",
    ),
  "Background continuity sync is not isolated from active Scanner phases.",
);

const guardStart =
  sync.indexOf(
    "  const protectedOnlineAttempt =",
  );
const guardEnd =
  sync.indexOf(
    "  let timeResult:",
    guardStart,
  );
const guardBlock =
  guardStart >= 0 &&
  guardEnd > guardStart
    ? sync.slice(
        guardStart,
        guardEnd,
      )
    : "";

expect(
  guardBlock.includes(
    "CONTINUITY_ONLINE_ATTEMPT_ACTIVE",
  ) &&
    guardBlock.includes(
      "biometric_liveness_sessions",
    ) &&
    guardBlock.includes(
      "now() -\n                interval '2 minutes'",
    ) &&
    !guardBlock.includes(
      "attempt.occurred_at >\n              ${input.capturedAt}::timestamptz",
    ) &&
    !guardBlock.includes(
      "TEMPORARY_EXIT_AUTHORIZED",
    ) &&
    !guardBlock.includes(
      "TEMPORARY_RETURN_AUTHORIZED",
    ),
  "Server live-online deferral boundary is incomplete or can still be permanently blocked by an abandoned older attempt.",
);

expect(
  !sync.includes(
    "CONNECTIVITY_CONTINUITY_SUPERSEDED",
  ) &&
    !sync.includes(
      "update attendance_verification_attempts\n      attempt\n    set\n      face_result =\n        'UNAVAILABLE'",
    ),
  "Continuity reconciliation must not reject or mutate unrelated online attendance attempts.",
);

expect(
  route.includes(
    "result.status !==\n        \"RECORDED\"",
  ) &&
    sync.includes(
      "queueTemporaryMovementNotification",
    ) &&
    sync.includes(
      "queueSchoolNotification",
    ) &&
    sync.includes(
      "queueGuardianPresencePushBestEffort",
    ) &&
    sync.includes(
      "queueSchoolMovementNotifications",
    ) &&
    temporaryExit.includes(
      "STUDENT_TEMPORARILY_OUT",
    ) &&
    temporaryExit.includes(
      "STUDENT_RETURNED_TO_CAMPUS",
    ) &&
    guardianPresence.includes(
      "STUDENT_TEMPORARILY_OUT",
    ) &&
    guardianPresence.includes(
      "STUDENT_RETURNED_TO_CAMPUS",
    ) &&
    guardianWorker.includes(
      "presenceEventId",
    ),
  "Notification semantics or dedupe/retry proof regressed.",
);

expect(
  sync.includes(
    "resolveContinuityMovementIntent",
  ) &&
    scanner.includes(
      "TEMPORARY_RETURN_REQUIRES_FRESH_SCAN",
    ),
  "M69 intent safety or M68 legacy-return recovery regressed.",
);

console.log(
  "M70 CONTINUITY/ONLINE RACE + NOTIFICATION SAFETY SELFTEST = GREEN",
);
