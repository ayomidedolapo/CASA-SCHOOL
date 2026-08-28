import {
  hashStudentCardToken,
  STUDENT_CARD_QR_PREFIX,
} from "@/server/identity/student-card";

const cardTokenPattern =
  /^[A-Za-z0-9_-]{43}$/;

export function parseStudentCardPayload(
  payload: string,
): {
  tokenHash: string;
} | null {
  if (
    !payload.startsWith(
      STUDENT_CARD_QR_PREFIX,
    )
  ) {
    return null;
  }

  const token =
    payload.slice(
      STUDENT_CARD_QR_PREFIX.length,
    );

  if (
    !cardTokenPattern.test(token)
  ) {
    return null;
  }

  return {
    tokenHash:
      hashStudentCardToken(token),
  };
}