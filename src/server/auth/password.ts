import {
  hash,
  verify,
} from "@node-rs/argon2";

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

/**
 * @node-rs/argon2 uses Argon2id by default.
 *
 * We intentionally do not import its exported `Algorithm` const enum
 * because CASA School compiles with TypeScript `isolatedModules`.
 *
 * Explicit cost parameters remain pinned to the OWASP baseline:
 * 19 MiB memory, 2 iterations, 1 lane, 32-byte output.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function assertPasswordPolicy(
  password: string,
): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
}

export async function hashPassword(
  password: string,
): Promise<string> {
  assertPasswordPolicy(password);

  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return false;
  }

  try {
    return await verify(
      passwordHash,
      password,
    );
  } catch {
    return false;
  }
}