import { pgEnum } from "drizzle-orm/pg-core";

export const authWebauthnChallengePurposeEnum =
  pgEnum(
    "auth_webauthn_challenge_purpose",
    [
      "REGISTRATION",
      "LOGIN",
      "STEP_UP",
    ],
  );