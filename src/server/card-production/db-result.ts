export function firstDbRow<T>(
  result: unknown,
): T | null {
  if (Array.isArray(result)) {
    return (
      (result[0] as T | undefined) ??
      null
    );
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (Array.isArray(rows)) {
      return (
        (rows[0] as T | undefined) ??
        null
      );
    }
  }

  return null;
}
