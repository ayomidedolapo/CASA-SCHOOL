import {
  hashPassword,
  verifyPassword,
} from "../src/server/auth/password";
import {
  createSessionToken,
  hashSessionToken,
} from "../src/server/auth/token";

async function main(): Promise<void> {
  const password =
    "CASA School Test Password 2026!";
  const wrongPassword =
    "CASA School Wrong Password 2026!";

  const passwordHash =
    await hashPassword(password);

  if (
    !(await verifyPassword(
      passwordHash,
      password,
    ))
  ) {
    throw new Error(
      "Argon2id verification failed for the correct password.",
    );
  }

  if (
    await verifyPassword(
      passwordHash,
      wrongPassword,
    )
  ) {
    throw new Error(
      "Argon2id accepted an incorrect password.",
    );
  }

  const tokenA =
    createSessionToken();
  const tokenB =
    createSessionToken();

  if (
    tokenA === tokenB ||
    tokenA.length < 40
  ) {
    throw new Error(
      "Session token generation is not producing independent high-entropy tokens.",
    );
  }

  const tokenHash =
    hashSessionToken(tokenA);

  if (
    !/^[0-9a-f]{64}$/.test(
      tokenHash,
    )
  ) {
    throw new Error(
      "Session token hash is not a SHA-256 hex digest.",
    );
  }

  console.log(
    "CASA School auth cryptographic self-test passed.",
  );
}

main().catch((error: unknown) => {
  console.error(
    "CASA School auth cryptographic self-test failed.",
  );
  console.error(error);
  process.exit(1);
});