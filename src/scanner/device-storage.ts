const DATABASE_NAME =
  "casa-school-scanner-device";

const DATABASE_VERSION =
  1;

const STORE_NAME =
  "device";

const TERMINAL_KEY =
  "terminal-credential";

function openDeviceDatabase():
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
                STORE_NAME,
              )
          ) {
            db.createObjectStore(
              STORE_NAME,
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
                "Unable to open scanner device storage.",
              ),
          );
    },
  );
}

export async function readTerminalCredential():
  Promise<string | null> {
  const db =
    await openDeviceDatabase();

  try {
    return await new Promise(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          db.transaction(
            STORE_NAME,
            "readonly",
          );

        const request =
          transaction
            .objectStore(
              STORE_NAME,
            )
            .get(
              TERMINAL_KEY,
            );

        request.onsuccess =
          () =>
            resolve(
              typeof request
                .result ===
              "string"
                ? request.result
                : null,
            );

        request.onerror =
          () =>
            reject(
              request.error ??
                new Error(
                  "Unable to read scanner credential.",
                ),
            );
      },
    );
  } finally {
    db.close();
  }
}

export async function storeTerminalCredential(
  value: string,
): Promise<void> {
  const db =
    await openDeviceDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          db.transaction(
            STORE_NAME,
            "readwrite",
          );

        transaction.oncomplete =
          () => resolve();

        transaction.onerror =
          () =>
            reject(
              transaction.error ??
                new Error(
                  "Unable to save scanner credential.",
                ),
            );

        transaction
          .objectStore(
            STORE_NAME,
          )
          .put(
            value,
            TERMINAL_KEY,
          );
      },
    );
  } finally {
    db.close();
  }
}

export async function clearTerminalCredential():
  Promise<void> {
  const db =
    await openDeviceDatabase();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          db.transaction(
            STORE_NAME,
            "readwrite",
          );

        transaction.oncomplete =
          () => resolve();

        transaction.onerror =
          () =>
            reject(
              transaction.error ??
                new Error(
                  "Unable to clear scanner credential.",
                ),
            );

        transaction
          .objectStore(
            STORE_NAME,
          )
          .delete(
            TERMINAL_KEY,
          );
      },
    );
  } finally {
    db.close();
  }
}