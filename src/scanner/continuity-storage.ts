const DATABASE_NAME =
  "casa-school-scanner-continuity";

const DATABASE_VERSION =
  1;

const SNAPSHOT_STORE =
  "snapshot";

const QUEUE_STORE =
  "queue";

const SNAPSHOT_KEY =
  "current";

export type ContinuityPresenceState =
  | "ON_CAMPUS"
  | "SIGNED_OUT"
  | null;

export interface ContinuityCachedCard {
  tokenHash: string;
  studentId: string;
  casaStudentId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  presenceState:
    ContinuityPresenceState;
}

export interface ContinuitySnapshot {
  version: 1;
  serverTime: string;
  expiresAt: string;
  school: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  };
  terminal: {
    id: string;
    name: string;
    terminalCode: string;
    credentialVersion: number;
  };
  branch: {
    id: string;
    name: string;
    status: string;
  };
  clock: {
    date: string;
    clock: string;
    weekday: number;
  };
  session: {
    id: string;
    status: "OPEN";
    mode:
      | "INSTRUCTIONAL"
      | "PRESENCE_ONLY";
    attendanceDate: string;
    policyId: string | null;
  };
  policyDay:
    | {
        checkInOpensAt: string;
        onTimeUntil: string;
        checkInClosesAt: string;
        normalDismissalAt: string;
        checkOutClosesAt: string;
      }
    | null;
  cards: ContinuityCachedCard[];
}

export interface ContinuityQueuedEvent {
  requestId: string;
  sessionId: string;
  studentId: string;
  tokenHash: string;
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
  capturedAt: string;
  connectivityMode:
    | "DEGRADED"
    | "OFFLINE";
  cacheIssuedAt: string;
  cacheExpiresAt: string;
  state:
    | "PENDING"
    | "REJECTED";
  lastErrorCode:
    string | null;
  queuedAt: string;
}

function openDatabase():
  Promise<IDBDatabase> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const request =
        indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        );

      request.onupgradeneeded =
        () => {
          const db =
            request.result;

          if (
            !db.objectStoreNames
              .contains(
                SNAPSHOT_STORE,
              )
          ) {
            db.createObjectStore(
              SNAPSHOT_STORE,
            );
          }

          if (
            !db.objectStoreNames
              .contains(
                QUEUE_STORE,
              )
          ) {
            db.createObjectStore(
              QUEUE_STORE,
              {
                keyPath:
                  "requestId",
              },
            );
          }
        };

      request.onsuccess =
        () =>
          resolve(
            request.result,
          );

      request.onerror =
        () =>
          reject(
            request.error ??
              new Error(
                "Unable to open scanner continuity storage.",
              ),
          );
    },
  );
}

export async function saveContinuitySnapshot(
  snapshot:
    ContinuitySnapshot,
): Promise<void> {
  const db =
    await openDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            SNAPSHOT_STORE,
            "readwrite",
          );

        tx.oncomplete =
          () => resolve();

        tx.onerror =
          () =>
            reject(
              tx.error ??
                new Error(
                  "Unable to save scanner continuity snapshot.",
                ),
            );

        tx.objectStore(
          SNAPSHOT_STORE,
        ).put(
          snapshot,
          SNAPSHOT_KEY,
        );
      },
    );
  } finally {
    db.close();
  }
}

export async function readContinuitySnapshot():
  Promise<
    ContinuitySnapshot |
    null
  > {
  const db =
    await openDatabase();

  try {
    return await new Promise(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            SNAPSHOT_STORE,
            "readonly",
          );

        const request =
          tx.objectStore(
            SNAPSHOT_STORE,
          ).get(
            SNAPSHOT_KEY,
          );

        request.onsuccess =
          () => {
            const value =
              request.result;

            resolve(
              value &&
              typeof value ===
                "object"
                ? value as
                    ContinuitySnapshot
                : null,
            );
          };

        request.onerror =
          () =>
            reject(
              request.error ??
                new Error(
                  "Unable to read scanner continuity snapshot.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}

export function continuitySnapshotUsable(
  snapshot:
    ContinuitySnapshot |
    null,
  terminalId?:
    string | null,
  now =
    Date.now(),
): boolean {
  if (!snapshot) {
    return false;
  }

  if (
    terminalId &&
    snapshot.terminal.id !==
      terminalId
  ) {
    return false;
  }

  const expiresAt =
    Date.parse(
      snapshot.expiresAt,
    );

  const issuedAt =
    Date.parse(
      snapshot.serverTime,
    );

  return (
    Number.isFinite(
      issuedAt,
    ) &&
    Number.isFinite(
      expiresAt,
    ) &&
    issuedAt <=
      now + 120_000 &&
    expiresAt >
      now &&
    expiresAt >
      issuedAt
  );
}

export async function putContinuityEvent(
  event:
    ContinuityQueuedEvent,
): Promise<void> {
  const db =
    await openDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            QUEUE_STORE,
            "readwrite",
          );

        tx.oncomplete =
          () => resolve();

        tx.onerror =
          () =>
            reject(
              tx.error ??
                new Error(
                  "Unable to queue scanner continuity event.",
                ),
            );

        tx.objectStore(
          QUEUE_STORE,
        ).put(
          event,
        );
      },
    );
  } finally {
    db.close();
  }
}

export async function listContinuityEvents():
  Promise<
    ContinuityQueuedEvent[]
  > {
  const db =
    await openDatabase();

  try {
    return await new Promise(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            QUEUE_STORE,
            "readonly",
          );

        const request =
          tx.objectStore(
            QUEUE_STORE,
          ).getAll();

        request.onsuccess =
          () =>
            resolve(
              (
                request.result ??
                []
              ) as
                ContinuityQueuedEvent[],
            );

        request.onerror =
          () =>
            reject(
              request.error ??
                new Error(
                  "Unable to read scanner continuity queue.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}

export async function listPendingContinuityEvents(
  limit =
    100,
): Promise<
    ContinuityQueuedEvent[]
  > {
  const rows =
    await listContinuityEvents();

  return rows
    .filter(
      (
        row,
      ) =>
        row.state ===
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
    )
    .slice(
      0,
      Math.max(
        1,
        Math.min(
          100,
          limit,
        ),
      ),
    );
}

export async function continuityPendingCount():
  Promise<number> {
  const rows =
    await listContinuityEvents();

  return rows.filter(
    (
      row,
    ) =>
      row.state ===
        "PENDING",
  ).length;
}

export async function deleteContinuityEvents(
  requestIds:
    string[],
): Promise<void> {
  if (
    requestIds.length ===
      0
  ) {
    return;
  }

  const db =
    await openDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            QUEUE_STORE,
            "readwrite",
          );

        const store =
          tx.objectStore(
            QUEUE_STORE,
          );

        for (
          const requestId of
            requestIds
        ) {
          store.delete(
            requestId,
          );
        }

        tx.oncomplete =
          () => resolve();

        tx.onerror =
          () =>
            reject(
              tx.error ??
                new Error(
                  "Unable to clear synchronized continuity events.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}

export async function rejectContinuityEvents(
  rejected:
    Array<{
      requestId: string;
      code: string;
    }>,
): Promise<void> {
  if (
    rejected.length ===
      0
  ) {
    return;
  }

  const db =
    await openDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            QUEUE_STORE,
            "readwrite",
          );

        const store =
          tx.objectStore(
            QUEUE_STORE,
          );

        for (
          const item of
            rejected
        ) {
          const request =
            store.get(
              item.requestId,
            );

          request.onsuccess =
            () => {
              const current =
                request.result as
                  | ContinuityQueuedEvent
                  | undefined;

              if (!current) {
                return;
              }

              store.put({
                ...current,
                state:
                  "REJECTED",
                lastErrorCode:
                  item.code,
              });
            };
        }

        tx.oncomplete =
          () => resolve();

        tx.onerror =
          () =>
            reject(
              tx.error ??
                new Error(
                  "Unable to mark rejected continuity events.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}

export async function clearContinuityStorage():
  Promise<void> {
  const db =
    await openDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            [
              SNAPSHOT_STORE,
              QUEUE_STORE,
            ],
            "readwrite",
          );

        tx.objectStore(
          SNAPSHOT_STORE,
        ).clear();

        tx.objectStore(
          QUEUE_STORE,
        ).clear();

        tx.oncomplete =
          () => resolve();

        tx.onerror =
          () =>
            reject(
              tx.error ??
                new Error(
                  "Unable to clear scanner continuity storage.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}
