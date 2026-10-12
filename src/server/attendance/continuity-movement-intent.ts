export type ContinuityMovementIntent =
  | "TEMPORARY_EXIT"
  | "TEMPORARY_RETURN";

export type ContinuityOperation =
  | "CHECK_IN"
  | "CHECK_OUT";

export interface ContinuityMovementIntentInput {
  requestedMovement?:
    | ContinuityMovementIntent
    | null;
  operation:
    ContinuityOperation;
  capturedAt:
    Date;
  cycleStatus:
    | "AUTHORIZED"
    | "OUTSIDE"
    | string
    | null;
  cycleCreatedAt:
    Date | null;
  steppedOutAt:
    Date | null;
}

export type ContinuityMovementIntentResult =
  | {
      ok: true;
      movement:
        | ContinuityMovementIntent
        | null;
      effectiveOperation:
        ContinuityOperation;
      legacyInferred:
        boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function validDate(
  value:
    Date | null,
): value is Date {
  return Boolean(
    value &&
      !Number.isNaN(
        value.getTime(),
      ),
  );
}

export function resolveContinuityMovementIntent(
  input:
    ContinuityMovementIntentInput,
): ContinuityMovementIntentResult {
  const requested =
    input.requestedMovement;

  if (
    requested ===
      "TEMPORARY_EXIT" &&
    input.operation !==
      "CHECK_OUT"
  ) {
    return {
      ok: false,
      code:
        "CONTINUITY_TEMPORARY_MOVEMENT_OPERATION_MISMATCH",
      message:
        "The queued temporary step-out does not match its recorded attendance operation.",
    };
  }

  if (
    requested ===
      "TEMPORARY_RETURN" &&
    input.operation !==
      "CHECK_IN"
  ) {
    return {
      ok: false,
      code:
        "CONTINUITY_TEMPORARY_MOVEMENT_OPERATION_MISMATCH",
      message:
        "The queued temporary return does not match its recorded attendance operation.",
    };
  }

  if (
    requested ===
      "TEMPORARY_EXIT"
  ) {
    if (
      input.cycleStatus !==
        "AUTHORIZED"
    ) {
      return {
        ok: false,
        code:
          "CONTINUITY_TEMPORARY_EXIT_STATE_INVALID",
        message:
          "The temporary step-out authorization is no longer in the expected state.",
      };
    }

    if (
      !validDate(
        input.cycleCreatedAt,
      ) ||
      input.capturedAt <
        input.cycleCreatedAt
    ) {
      return {
        ok: false,
        code:
          "CONTINUITY_TEMPORARY_EXIT_ORDER_INVALID",
        message:
          "The temporary step-out scan is earlier than its authorization.",
      };
    }

    return {
      ok: true,
      movement:
        "TEMPORARY_EXIT",
      effectiveOperation:
        "CHECK_OUT",
      legacyInferred:
        false,
    };
  }

  if (
    requested ===
      "TEMPORARY_RETURN"
  ) {
    if (
      input.cycleStatus !==
        "OUTSIDE"
    ) {
      return {
        ok: false,
        code:
          "CONTINUITY_TEMPORARY_RETURN_STATE_INVALID",
        message:
          "The temporary return no longer has an active stepped-out cycle.",
      };
    }

    if (
      !validDate(
        input.steppedOutAt,
      ) ||
      input.capturedAt <
        input.steppedOutAt
    ) {
      return {
        ok: false,
        code:
          "CONTINUITY_TEMPORARY_RETURN_ORDER_INVALID",
        message:
          "The return scan is earlier than the recorded temporary step-out.",
      };
    }

    return {
      ok: true,
      movement:
        "TEMPORARY_RETURN",
      effectiveOperation:
        "CHECK_IN",
      legacyInferred:
        false,
    };
  }

  // Explicit null means a post-M68 ordinary event. A later
  // temporary authorization must never rewrite that event's intent.
  if (
    requested ===
      null
  ) {
    return {
      ok: true,
      movement:
        null,
      effectiveOperation:
        input.operation,
      legacyInferred:
        false,
    };
  }

  // Undefined is reserved for pre-M68 durable queue rows, which did
  // not have a movement field. Infer only when operation and timestamps
  // prove the event belongs to the active temporary-movement cycle.
  if (
    input.operation ===
      "CHECK_OUT" &&
    input.cycleStatus ===
      "AUTHORIZED" &&
    validDate(
      input.cycleCreatedAt,
    ) &&
    input.capturedAt >=
      input.cycleCreatedAt
  ) {
    return {
      ok: true,
      movement:
        "TEMPORARY_EXIT",
      effectiveOperation:
        "CHECK_OUT",
      legacyInferred:
        true,
    };
  }

  if (
    input.operation ===
      "CHECK_IN" &&
    input.cycleStatus ===
      "OUTSIDE" &&
    validDate(
      input.steppedOutAt,
    ) &&
    input.capturedAt >=
      input.steppedOutAt
  ) {
    return {
      ok: true,
      movement:
        "TEMPORARY_RETURN",
      effectiveOperation:
        "CHECK_IN",
      legacyInferred:
        true,
    };
  }

  return {
    ok: true,
    movement:
      null,
    effectiveOperation:
      input.operation,
    legacyInferred:
      false,
  };
}
