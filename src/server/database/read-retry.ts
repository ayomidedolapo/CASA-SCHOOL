const TRANSIENT_DATABASE_MARKERS = [
  "fetch failed",
  "econnreset",
  "econnrefused",
  "enotfound",
  "etimedout",
  "eai_again",
  "socket",
  "connection terminated",
  "connection closed",
  "other side closed",
  "headers timeout",
  "body timeout",
] as const;

const READ_RETRY_DELAYS_MS = [
  0,
  250,
  750,
  1500,
  3000,
] as const;

function errorChainText(
  error: unknown,
): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      parts.push(current.name, current.message);
    } else {
      parts.push(String(current));
    }

    if (typeof current === "object" && current !== null) {
      const record = current as Record<string, unknown>;
      if (typeof record.code === "string") parts.push(record.code);
      current = record.cause;
    } else {
      break;
    }
  }

  return parts.join(" ").toLowerCase();
}

export function isTransientDatabaseReadError(
  error: unknown,
): boolean {
  const text = errorChainText(error);
  return TRANSIENT_DATABASE_MARKERS.some((marker) => text.includes(marker));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withTransientDatabaseReadRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < READ_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = READ_RETRY_DELAYS_MS[attempt];
    if (delay > 0) await wait(delay);

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        !isTransientDatabaseReadError(error) ||
        attempt === READ_RETRY_DELAYS_MS.length - 1
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}
