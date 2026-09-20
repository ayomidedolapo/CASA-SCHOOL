import assert from "node:assert/strict";
import fs from "node:fs";

import {
  probeCardTextRuntime,
} from "../src/server/card-production/render";

const read =
  (path: string) =>
    fs.readFileSync(
      path,
      "utf8",
    );

async function main() {
  const renderer =
    read(
      "src/server/card-production/render.ts",
    );
  const lifecycle =
    read(
      "src/server/card-production/m38-lifecycle.ts",
    );
  const designer =
    read(
      "src/app/internal/templates/template-designer.tsx",
    );
  const cardProduction =
    read(
      "src/app/internal/card-production/card-production-client.tsx",
    );
  const refreshRoute =
    read(
      "src/app/api/internal/operations/card-production/refresh-unprinted/route.ts",
    );
  const healthRoute =
    read(
      "src/app/api/internal/operations/card-production/render-health/route.ts",
    );
  const attendance =
    read(
      "src/app/schools/[slug]/attendance/attendance-client.tsx",
    );
  const today =
    read(
      "src/server/attendance/today.ts",
    );
  const notifications =
    read(
      "src/app/internal/notifications/page.tsx",
    );
  const terminalHealth =
    read(
      "src/server/internal/terminal-health.ts",
    );
  const terminalAuth =
    read(
      "src/server/attendance/terminal-auth.ts",
    );

  assert.match(
    renderer,
    /CARD_TEXT_FONT_FAMILY\s*=\s*"sans-serif"\s*;/,
    "Card renderer must use the deployment-safe generic family.",
  );

  assert.ok(
    renderer.includes(
      "probeCardTextRuntime",
    ),
    "Card renderer runtime glyph probe is missing.",
  );

  const probe =
    await probeCardTextRuntime();

  assert.equal(
    probe.healthy,
    true,
    `Local Sharp glyph probe failed: sampleA=${probe.sampleABytes}, sampleB=${probe.sampleBBytes}`,
  );

  for (
    const marker of [
      "refreshUnprintedCardsForTemplate",
      "'READY'::student_card_production_status",
      "'EXPORTED'::student_card_production_status",
      "'READY_FOR_ACTIVATION'::student_identity_card_status",
      "artifactRevision",
    ]
  ) {
    assert.ok(
      lifecycle.includes(
        marker,
      ),
      `Unprinted-card lifecycle missing ${marker}`,
    );
  }

  assert.ok(
    !/job\.status\s*in\s*\([^)]*PRINTED/i.test(
      lifecycle,
    ),
    "Printed card jobs must not be part of unprinted-card refresh.",
  );

  for (
    const marker of [
      "Refresh unprinted cards",
      "/api/internal/operations/card-production/render-health",
      "/api/internal/operations/card-production/refresh-unprinted",
      "Renderer healthy.",
    ]
  ) {
    assert.ok(
      cardProduction.includes(
        marker,
      ),
      `Card Production UI missing ${marker}`,
    );
  }

  for (
    const marker of [
      "refreshUnprintedCardsForTemplate",
      "CARD_PRODUCTION_ADMIN",
    ]
  ) {
    assert.ok(
      refreshRoute.includes(
        marker,
      ),
      `Refresh API missing ${marker}`,
    );
  }

  for (
    const marker of [
      "probeCardTextRuntime",
      "CARD_PRODUCTION_ADMIN",
      "healthy",
    ]
  ) {
    assert.ok(
      healthRoute.includes(
        marker,
      ),
      `Renderer-health API missing ${marker}`,
    );
  }

  assert.ok(
    designer.includes(
      '(["FRONT", "BACK"] as Side[]).map((side)',
    ),
    "Six-card preview must render both FRONT and BACK.",
  );

  assert.ok(
    designer.includes(
      "These six samples cover",
    ),
    "Six-card preview guidance is missing.",
  );

  for (
    const marker of [
      "Attendance date",
      "recordCardReplacementException",
      "/attendance/card-exceptions/",
      "firstCardPendingHandover",
      "CARD_REPLACEMENT",
      "Lost-card face - 3-day grace",
      "Lost-card face - replacement pending",
    ]
  ) {
    assert.ok(
      attendance.includes(
        marker,
      ),
      `Attendance UI missing ${marker}`,
    );
  }

  for (
    const marker of [
      "student_identity_cards",
      "student_card_replacement_cases",
      "card_replacement_case_id",
      "firstCardPendingHandover",
      "cardReplacement:",
    ]
  ) {
    assert.ok(
      today.includes(
        marker,
      ),
      `Attendance payload missing ${marker}`,
    );
  }

  assert.ok(
    notifications.includes(
      "window.setInterval",
    ) &&
      notifications.includes(
        "30_000",
      ),
    "Internal notifications must reconcile every 30 seconds while open.",
  );

  assert.ok(
    terminalHealth.includes(
      "ATTENDANCE_TERMINAL_OFFLINE",
    ),
    "Terminal OFFLINE notification authority is missing.",
  );

  assert.ok(
    terminalHealth.includes(
      "ATTENDANCE_TERMINAL_ONLINE",
    ),
    "Terminal ONLINE notification authority is missing.",
  );

  assert.ok(
    terminalAuth.includes(
      "reconcileTerminalHealthNotifications",
    ),
    "Terminal heartbeat health reconciliation is missing.",
  );

  console.log(
    "CASA post-M39 card + operational closure focused proof GREEN.",
  );
  console.log(
    `Local Sharp glyph runtime healthy: sampleA=${probe.sampleABytes}, sampleB=${probe.sampleBBytes}.`,
  );
  console.log(
    "Unprinted-card rerender, six previews, first/lost-card Attendance, and live notification polling are present.",
  );
}

void main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);