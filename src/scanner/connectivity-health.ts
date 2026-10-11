export type ConnectivityHealth =
  | "CHECKING"
  | "HEALTHY"
  | "UNSTABLE"
  | "DEGRADED"
  | "OFFLINE"
  | "RECOVERING";

export interface ConnectivitySample {
  at: number;
  ok: boolean;
  latencyMs: number | null;
  offline: boolean;
}

const HEALTHY_LATENCY_MS = 1200;
const DEGRADED_LATENCY_MS = 1800;

function recent(
  history: ConnectivitySample[],
  count: number,
) {
  return history.slice(
    Math.max(
      0,
      history.length - count,
    ),
  );
}

export function calculateConnectivityHealth(
  current: ConnectivityHealth,
  history: ConnectivitySample[],
): ConnectivityHealth {
  const latest =
    history[history.length - 1];

  if (!latest) {
    return "CHECKING";
  }

  if (latest.offline) {
    return "OFFLINE";
  }

  const last3 =
    recent(
      history,
      3,
    );
  const last4 =
    recent(
      history,
      4,
    );

  const failures =
    last3.filter(
      (sample) =>
        !sample.ok,
    ).length;

  const slow =
    last4.filter(
      (sample) =>
        sample.ok &&
        (
          sample.latencyMs ??
          Number.POSITIVE_INFINITY
        ) >=
          DEGRADED_LATENCY_MS,
    ).length;

  if (
    current ===
      "OFFLINE" ||
    current ===
      "DEGRADED" ||
    current ===
      "RECOVERING"
  ) {
    const goodRecovery =
      recent(
        history,
        3,
      );

    if (
      goodRecovery.length >=
        3 &&
      goodRecovery.every(
        (sample) =>
          sample.ok &&
          !sample.offline &&
          (
            sample.latencyMs ??
            Number.POSITIVE_INFINITY
          ) <=
            HEALTHY_LATENCY_MS,
      )
    ) {
      return "HEALTHY";
    }

    if (latest.ok) {
      return "RECOVERING";
    }
  }

  if (
    failures >=
      2 ||
    slow >=
      3
  ) {
    return "DEGRADED";
  }

  if (
    !latest.ok ||
    (
      latest.latencyMs ??
      0
    ) >=
      DEGRADED_LATENCY_MS
  ) {
    return "UNSTABLE";
  }

  if (
    current ===
      "UNSTABLE"
  ) {
    const last2 =
      recent(
        history,
        2,
      );

    if (
      last2.length <
        2 ||
      !last2.every(
        (sample) =>
          sample.ok &&
          (
            sample.latencyMs ??
            Number.POSITIVE_INFINITY
          ) <=
            HEALTHY_LATENCY_MS,
      )
    ) {
      return "UNSTABLE";
    }
  }

  return "HEALTHY";
}

export function connectivityHealthLabel(
  value: ConnectivityHealth,
): string {
  switch (value) {
    case "CHECKING":
      return "Checking network";
    case "HEALTHY":
      return "Network healthy";
    case "UNSTABLE":
      return "Network unstable";
    case "DEGRADED":
      return "Degraded connectivity";
    case "OFFLINE":
      return "Offline";
    case "RECOVERING":
      return "Network recovering";
  }
}
