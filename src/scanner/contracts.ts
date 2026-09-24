export interface ScannerTerminalSession {
  school: {
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
  branch:
    | {
        id: string;
        name: string;
        status: string;
      }
    | null;
  clock: {
    date: string;
    clock: string;
    weekday: number;
  };
  session:
    | {
        id: string;
        branchSessionId:
          string | null;
        status:
          | "PLANNED"
          | "OPEN"
          | "CLOSED"
          | "CANCELLED"
          | null;
        mode:
          | "INSTRUCTIONAL"
          | "PRESENCE_ONLY";
        policyId:
          string | null;
        policyDay?:
          unknown;
        [key: string]:
          unknown;
      }
    | null;
  readiness:
    | {
        code: string;
        message: string;
      }
    | null;
  lateStayOnly:
    boolean;
}

export interface ScannerStudent {
  id: string;
  casaStudentId: string;
  firstName: string;
  middleName:
    string | null;
  lastName: string;
  schoolName?: string;
  branchName?:
    string | null;
  className?:
    string | null;
  sex?:
    string | null;
}

export interface ScannerAttemptResponse {
  attempt: {
    id: string;
    operation:
      | "CHECK_IN"
      | "CHECK_OUT";
    cardResult: string;
    timeResult: string;
    departureResult:
      string;
    outcome: string;
    reasonCode:
      string | null;
    completedAt:
      string | null;
  };
  student:
    ScannerStudent | null;
  replayed: boolean;
  requiresBiometric:
    boolean;
  requiresStaffAuthorization:
    boolean;
  classification:
    string | null;
  message?:
    string | null;
}

export interface ScannerLivenessStart {
  liveness: {
    livenessSessionId:
      string;
    providerSessionId:
      string;
    expiresAt:
      string;
    streaming: {
      region: string;
      accessKeyId:
        string;
      secretAccessKey:
        string;
      sessionToken:
        string;
      expiration:
        string;
    };
  };
}

export interface ScannerPresenceResult {
  presence: {
    operation:
      | "CHECK_IN"
      | "CHECK_OUT";
    attendanceRecordId:
      string;
    presenceEventId:
      string;
    notificationQueued:
      number;
    guardianPushQueued:
      number;
    replayed:
      boolean;
  };
  guardianPushDelivery:
    | {
        reconciled:
          number;
        claimed:
          number;
        sent:
          number;
        retried:
          number;
        failed:
          number;
      }
    | null;
  verificationImageDataUrl:
    string | null;
  scores: {
    faceConfidenceBps:
      number;
    livenessConfidenceBps:
      number;
  };
}

const terminalCredentialPattern =
  /^CASAT1\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.[A-Za-z0-9_-]{43}$/;

export function isTerminalCredentialShape(
  value: string,
): boolean {
  return terminalCredentialPattern.test(
    value.trim(),
  );
}

export function createScannerRequestId():
  string {
  const bytes =
    new Uint8Array(16);

  crypto.getRandomValues(
    bytes,
  );

  const random =
    Array.from(
      bytes,
      (value) =>
        value
          .toString(16)
          .padStart(
            2,
            "0",
          ),
    ).join("");

  return `scan_${random}`;
}

export function scannerStudentName(
  student:
    ScannerStudent | null,
): string {
  if (!student) {
    return "Student";
  }

  return [
    student.firstName,
    student.middleName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

const reasonMessages:
  Record<string, string> = {
    UNKNOWN_CARD:
      "This card is not recognized by this school.",
    CARD_NOT_ACTIVE:
      "This student card is not active.",
    STUDENT_NOT_ACTIVE:
      "This student is not active.",
    NO_ACTIVE_SESSION:
      "Attendance is not open for this scanner right now.",
    TERMINAL_BRANCH_UNASSIGNED:
      "This scanner is not assigned to a campus. Ask the School Technician to assign it to the correct campus.",
    ATTENDANCE_BRANCH_SESSION_NOT_PREPARED:
      "Attendance has not been prepared for this scanner's campus today.",
    ATTENDANCE_BRANCH_NOT_OPEN:
      "Attendance is prepared for this campus, but it has not been opened yet.",
    ATTENDANCE_BRANCH_CLOSED:
      "Attendance for this scanner's campus is closed.",
    ATTENDANCE_POLICY_DAY_MISSING:
      "Attendance is open, but today's timetable is missing from the policy bound to this campus session. Use current policy on the Attendance page, then try again.",
    TERMINAL_BRANCH_MISMATCH:
      "This student belongs to a different campus from this scanner.",
    STUDENT_BRANCH_UNRESOLVED:
      "CASA could not resolve this student's campus from the active enrollment.",
    BRANCH_INACTIVE:
      "The scanner campus or student campus is inactive.",
    NON_INSTRUCTIONAL_DAY:
      "Today is configured as a non-instructional day for this campus.",
    CHECK_IN_NOT_OPEN:
      "Check-in has not opened yet.",
    CHECK_IN_WINDOW_CLOSED:
      "The check-in window has closed.",
    ALREADY_CHECKED_IN:
      "This student is already checked in.",
    REENTRY_NOT_ENABLED:
      "This student has already signed out for this session.",
    NOT_CHECKED_IN:
      "This student has not checked in.",
    ALREADY_SIGNED_OUT:
      "This student has already signed out.",
    CHECK_OUT_WINDOW_CLOSED:
      "Attendance is closed for today. Normal student scanning has ended.",
    EARLY_DEPARTURE_AUTH_REQUIRED:
      "Early departure requires staff authorization.",
    EARLY_DEPARTURE_PREAUTHORIZATION_ALREADY_USED:
      "This early-departure approval has already been used. Ask staff to review the student.",
    ACTIVE_BIOMETRIC_PROFILE_REQUIRED:
      "Face enrollment is required before attendance can be verified.",
    AWS_ACTIVE_BIOMETRIC_PROFILE_REQUIRED:
      "AWS face enrollment is required before attendance can be verified.",
    LIVENESS_CONFIDENCE_BELOW_POLICY:
      "Liveness verification was not accepted. Please try again.",
    FACE_MISMATCH:
      "The face did not match this student's active enrollment.",
    LIVENESS_SESSION_EXPIRED:
      "The face check expired. Please try again.",
    LIVENESS_NOT_COMPLETE:
      "The face check is not complete yet.",
  };

export function scannerReasonMessage(
  code:
    string | null | undefined,
  serverMessage?:
    string | null,
): string {
  if (!code) {
    return (
      serverMessage ??
      "The attendance check could not be completed."
    );
  }

  return (
    serverMessage ??
    reasonMessages[code] ??
    `The attendance check could not be completed (${code}).`
  );
}