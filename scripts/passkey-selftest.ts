import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from "@simplewebauthn/server";

import {
  getPasskeyRpConfig,
} from "../src/server/auth/passkey-config";
import {
  createPasskeyStepUpGrantToken,
  isPasskeyStepUpAction,
} from "../src/server/auth/passkey-step-up";

async function main(): Promise<void> {
  const config =
    getPasskeyRpConfig();

  const registration =
    await generateRegistrationOptions({
      rpName:
        config.rpName,
      rpID:
        config.rpID,
      userName:
        "selftest",
      userDisplayName:
        "CASA Self Test",
      userID:
        Buffer.from(
          "00000000-0000-4000-8000-000000000001",
          "utf8",
        ),
      attestationType:
        "none",
      authenticatorSelection: {
        residentKey:
          "required",
        userVerification:
          "required",
      },
    });

  if (
    !registration.challenge ||
    !registration.user.id
  ) {
    throw new Error(
      "Registration options were not generated.",
    );
  }

  const authentication =
    await generateAuthenticationOptions({
      rpID:
        config.rpID,
      userVerification:
        "required",
    });

  if (!authentication.challenge) {
    throw new Error(
      "Authentication options were not generated.",
    );
  }

  const grant =
    createPasskeyStepUpGrantToken();

  if (
    !/^CASASTEP1\.[A-Za-z0-9_-]{43}$/.test(
      grant,
    )
  ) {
    throw new Error(
      "Passkey step-up grant token format is invalid.",
    );
  }

  if (
    !isPasskeyStepUpAction(
      "EARLY_DEPARTURE",
    ) ||
    isPasskeyStepUpAction(
      "NOT_A_CASA_ACTION",
    )
  ) {
    throw new Error(
      "Passkey step-up action validation failed.",
    );
  }

  console.log(
    "CASA School Passkey/WebAuthn self-test passed.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});