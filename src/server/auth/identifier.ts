export type LoginIdentifier =
  | {
      kind: "EMAIL";
      value: string;
    }
  | {
      kind: "PHONE";
      value: string;
    };

const E164_PHONE =
  /^\+[1-9][0-9]{7,14}$/;

export function normalizeLoginIdentifier(
  input: string,
): LoginIdentifier | null {
  const value = input.trim();

  if (!value) {
    return null;
  }

  if (value.includes("@")) {
    const email = value.toLowerCase();

    if (
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      return null;
    }

    return {
      kind: "EMAIL",
      value: email,
    };
  }

  if (E164_PHONE.test(value)) {
    return {
      kind: "PHONE",
      value,
    };
  }

  return null;
}