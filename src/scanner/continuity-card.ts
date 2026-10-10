import type {
  ContinuityCachedCard,
  ContinuityQueuedEvent,
  ContinuitySnapshot,
} from "./continuity-storage";

const STUDENT_CARD_PREFIX =
  "CASA1.";

const CARD_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{43}$/;

function bytesToHex(
  bytes:
    Uint8Array,
) {
  return Array.from(
    bytes,
    (
      value,
    ) =>
      value
        .toString(16)
        .padStart(
          2,
          "0",
        ),
  ).join("");
}

export async function hashContinuityCardPayload(
  payload: string,
): Promise<
  string | null
> {
  const value =
    payload.trim();

  if (
    !value.startsWith(
      STUDENT_CARD_PREFIX,
    )
  ) {
    return null;
  }

  const token =
    value.slice(
      STUDENT_CARD_PREFIX.length,
    );

  if (
    !CARD_TOKEN_PATTERN.test(
      token,
    )
  ) {
    return null;
  }

  const encoded =
    new TextEncoder()
      .encode(
        token,
      );

  const digest =
    await crypto.subtle
      .digest(
        "SHA-256",
        encoded,
      );

  return bytesToHex(
    new Uint8Array(
      digest,
    ),
  );
}

function clockSeconds(
  value: string,
): number {
  const match =
    /^(?:([01]\d|2[0-3])):([0-5]\d)(?::([0-5]\d))?$/.exec(
      value,
    );

  if (!match) {
    throw new Error(
      "Invalid continuity policy clock.",
    );
  }

  return (
    Number(
      match[1],
    ) *
      3600 +
    Number(
      match[2],
    ) *
      60 +
    Number(
      match[3] ??
        "0",
    )
  );
}

export function continuityLocalClock(
  at: Date,
  timezone: string,
): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          timezone,
        hour:
          "2-digit",
        minute:
          "2-digit",
        second:
          "2-digit",
        hourCycle:
          "h23",
      },
    ).formatToParts(
      at,
    );

  const value = (
    type: string,
  ) =>
    parts.find(
      (
        part,
      ) =>
        part.type ===
          type,
    )?.value;

  const hour =
    value(
      "hour",
    );
  const minute =
    value(
      "minute",
    );
  const second =
    value(
      "second",
    );

  if (
    !hour ||
    !minute ||
    !second
  ) {
    throw new Error(
      "Unable to resolve continuity local time.",
    );
  }

  return `${hour}:${minute}:${second}`;
}

function effectivePresenceState(
  card:
    ContinuityCachedCard,
  pending:
    ContinuityQueuedEvent[],
) {
  let state =
    card.presenceState;

  const studentEvents =
    pending
      .filter(
        (
          event,
        ) =>
          event.studentId ===
            card.studentId &&
          event.state ===
            "PENDING",
      )
      .sort(
        (
          left,
          right,
        ) =>
          Date.parse(
            left.capturedAt,
          ) -
          Date.parse(
            right.capturedAt,
          ),
      );

  for (
    const event of
      studentEvents
  ) {
    state =
      event.operation ===
        "CHECK_IN"
        ? "ON_CAMPUS"
        : "SIGNED_OUT";
  }

  return state;
}

export type ContinuityDecision =
  | {
      ok: true;
      operation:
        | "CHECK_IN"
        | "CHECK_OUT";
      timeResult:
        | "NOT_RUN"
        | "ON_TIME"
        | "LATE";
      departureResult:
        | "NOT_RUN"
        | "NORMAL";
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export function decideContinuityAttendance(
  input: {
    snapshot:
      ContinuitySnapshot;
    card:
      ContinuityCachedCard;
    pending:
      ContinuityQueuedEvent[];
    capturedAt: Date;
  },
): ContinuityDecision {
  const {
    snapshot,
    card,
    pending,
    capturedAt,
  } =
    input;

  const state =
    effectivePresenceState(
      card,
      pending,
    );

  if (
    state ===
      "SIGNED_OUT"
  ) {
    return {
      ok: false,
      code:
        "REENTRY_NOT_ENABLED",
      message:
        "This student has already signed out for this attendance session.",
    };
  }

  const operation =
    state ===
      "ON_CAMPUS"
      ? "CHECK_OUT"
      : "CHECK_IN";

  if (
    snapshot.session.mode ===
      "PRESENCE_ONLY"
  ) {
    return operation ===
      "CHECK_IN"
      ? {
          ok: true,
          operation,
          timeResult:
            "ON_TIME",
          departureResult:
            "NOT_RUN",
        }
      : {
          ok: true,
          operation,
          timeResult:
            "NOT_RUN",
          departureResult:
            "NORMAL",
        };
  }

  const policy =
    snapshot.policyDay;

  if (!policy) {
    return {
      ok: false,
      code:
        "ATTENDANCE_POLICY_DAY_MISSING",
      message:
        "Offline continuity is unavailable because today's attendance timetable is not cached.",
    };
  }

  const now =
    clockSeconds(
      continuityLocalClock(
        capturedAt,
        snapshot.school
          .timezone,
      ),
    );

  if (
    operation ===
      "CHECK_IN"
  ) {
    const opens =
      clockSeconds(
        policy
          .checkInOpensAt,
      );
    const onTime =
      clockSeconds(
        policy
          .onTimeUntil,
      );
    const closes =
      clockSeconds(
        policy
          .checkInClosesAt,
      );

    if (
      now < opens
    ) {
      return {
        ok: false,
        code:
          "CHECK_IN_NOT_OPEN",
        message:
          "Check-in has not opened yet.",
      };
    }

    if (
      now > closes
    ) {
      return {
        ok: false,
        code:
          "CHECK_IN_WINDOW_CLOSED",
        message:
          "The normal check-in window has closed. Use supervised late arrival when CASA is online.",
      };
    }

    return {
      ok: true,
      operation,
      timeResult:
        now <= onTime
          ? "ON_TIME"
          : "LATE",
      departureResult:
        "NOT_RUN",
    };
  }

  const dismissal =
    clockSeconds(
      policy
        .normalDismissalAt,
    );
  const checkoutCloses =
    clockSeconds(
      policy
        .checkOutClosesAt,
    );

  if (
    now < dismissal
  ) {
    return {
      ok: false,
      code:
        "EARLY_DEPARTURE_AUTH_REQUIRED",
      message:
        "Early departure cannot use offline continuity. Authorized staff must complete the normal online early-departure flow.",
    };
  }

  if (
    now >
      checkoutCloses
  ) {
    return {
      ok: false,
      code:
        "CHECK_OUT_WINDOW_CLOSED",
      message:
        "The normal check-out window has closed.",
    };
  }

  return {
    ok: true,
    operation,
    timeResult:
      "NOT_RUN",
    departureResult:
      "NORMAL",
  };
}
