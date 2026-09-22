import {
  and,
  eq,
  gt,
  inArray,
  lte,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import {
  randomBytes,
} from "node:crypto";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
  biometricLivenessSessions,
  biometricProviderCleanupJobs,
  studentBiometricProfiles,
  students,
} from "@/db/schema";
import {
  createBiometricAssertion,
  verifyBiometricAssertion,
} from "@/server/attendance/biometric-assertion";
import {
  finalizeVerifiedPresence,
} from "@/server/attendance/finalize-presence-dispatch";
import type {
  TerminalAccess,
} from "@/server/attendance/terminal-auth";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  requireCasaInternalPasskeyStepUpGrant,
  requirePasskeyStepUpGrant,
} from "@/server/auth/passkey-step-up";

import {
  AWS_REKOGNITION_PROVIDER,
  AwsBiometricUnavailableError,
  awsCollectionIdForSchool,
  createAwsFaceLivenessSession,
  deleteAwsFace,
  getAwsFaceLivenessResult,
  indexAwsStudentFace,
  issueAwsLivenessStreamingCredentials,
  searchAwsExpectedFace,
  searchAwsFaceCandidates,
} from "./aws-rekognition";
import {
  getBiometricThresholdPolicy,
} from "./policy";
import {
  assertBiometricProviderMode,
} from "./provider-mode";

type EnrollmentActorScope =
  | "SCHOOL"
  | "CASA_INTERNAL";

interface EnrollmentAccess {
  session: {
    userId: string;
  };
  school: {
    id: string;
  };
  membership: {
    id: string;
  };
}

function enrollmentActorIds(
  access:
    EnrollmentAccess,
  scope:
    EnrollmentActorScope,
) {
  return {
    schoolMembershipId:
      scope ===
      "SCHOOL"
        ? access.membership.id
        : null,
    internalMembershipId:
      scope ===
      "CASA_INTERNAL"
        ? access.membership.id
        : null,
  };
}

function enrollmentLivenessActorCondition(
  input: {
    access:
      EnrollmentAccess;
    scope:
      EnrollmentActorScope;
  },
) {
  if (
    input.scope ===
    "SCHOOL"
  ) {
    return and(
      eq(
        biometricLivenessSessions.initiatedByMembershipId,
        input.access.membership.id,
      ),
      isNull(
        biometricLivenessSessions.initiatedByInternalMembershipId,
      ),
    );
  }

  return and(
    isNull(
      biometricLivenessSessions.initiatedByMembershipId,
    ),
    eq(
      biometricLivenessSessions.initiatedByInternalMembershipId,
      input.access.membership.id,
    ),
  );
}

function expired(
  value: Date,
): boolean {
  return value.getTime() <=
    Date.now();
}

function verificationImageDataUrl(
  image: Uint8Array,
): string | null {
  if (
    image.byteLength === 0 ||
    image.byteLength >
      1_500_000
  ) {
    return null;
  }

  let mime =
    "image/jpeg";

  if (
    image.length >= 8 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47
  ) {
    mime =
      "image/png";
  } else if (
    image.length >= 12 &&
    image[0] === 0x52 &&
    image[1] === 0x49 &&
    image[2] === 0x46 &&
    image[3] === 0x46 &&
    image[8] === 0x57 &&
    image[9] === 0x45 &&
    image[10] === 0x42 &&
    image[11] === 0x50
  ) {
    mime =
      "image/webp";
  }

  return `data:${mime};base64,${Buffer.from(
    image,
  ).toString(
    "base64",
  )}`;
}

async function markLivenessSession(
  input: {
    schoolId: string;
    id: string;
    status:
      | "COMPLETED"
      | "FAILED"
      | "EXPIRED";
    livenessConfidenceBps?:
      number | null;
    faceSimilarityBps?:
      number | null;
    providerSubjectRef?:
      string | null;
    failureCode?:
      string | null;
  },
): Promise<void> {
  const db = getDb();

  const now =
    new Date();

  await db
    .update(
      biometricLivenessSessions,
    )
    .set({
      status:
        input.status,
      livenessConfidenceBps:
        input.livenessConfidenceBps ??
        null,
      faceSimilarityBps:
        input.faceSimilarityBps ??
        null,
      providerSubjectRef:
        input.providerSubjectRef ??
        null,
      failureCode:
        input.failureCode ??
        null,
      completedAt:
        input.status ===
        "COMPLETED"
          ? now
          : null,
      updatedAt:
        now,
    })
    .where(
      and(
        eq(
          biometricLivenessSessions.schoolId,
          input.schoolId,
        ),
        eq(
          biometricLivenessSessions.id,
          input.id,
        ),
        eq(
          biometricLivenessSessions.status,
          "CREATED",
        ),
      ),
    );
}

async function createBoundLivenessSession(
  input: {
    schoolId: string;
    studentId: string;
    attemptId?: string | null;
    terminalId?: string | null;
    membershipId?: string | null;
    internalMembershipId?:
      string | null;
    purpose:
      | "ENROLLMENT"
      | "VERIFICATION";
    authorizationAction?:
      | "BIOMETRIC_ENROLL"
      | "BIOMETRIC_REENROLL"
      | null;
  },
) {
  const aws =
    await createAwsFaceLivenessSession();

  const credentials =
    await issueAwsLivenessStreamingCredentials(
      aws.providerSessionId,
    );

  const db = getDb();

  const rows =
    await db
      .insert(
        biometricLivenessSessions,
      )
      .values({
        schoolId:
          input.schoolId,
        studentId:
          input.studentId,
        attemptId:
          input.attemptId ??
          null,
        terminalId:
          input.terminalId ??
          null,
        initiatedByMembershipId:
          input.membershipId ??
          null,
        initiatedByInternalMembershipId:
          input.internalMembershipId ??
          null,
        purpose:
          input.purpose,
        authorizationAction:
          input.authorizationAction ??
          null,
        provider:
          AWS_REKOGNITION_PROVIDER,
        providerSessionId:
          aws.providerSessionId,
        status:
          "CREATED",
        expiresAt:
          aws.expiresAt,
      })
      .returning({
        id:
          biometricLivenessSessions.id,
      });

  if (!rows[0]) {
    throw new Error(
      "Unable to bind AWS liveness session.",
    );
  }

  return {
    livenessSessionId:
      rows[0].id,
    providerSessionId:
      aws.providerSessionId,
    expiresAt:
      aws.expiresAt,
    streaming: {
      region:
        credentials.region,
      accessKeyId:
        credentials.accessKeyId,
      secretAccessKey:
        credentials.secretAccessKey,
      sessionToken:
        credentials.sessionToken,
      expiration:
        credentials.expiration,
    },
  };
}

export async function startAwsEnrollmentLiveness(
  input: {
    access:
      EnrollmentAccess;
    studentId: string;
    stepUpToken:
      string | null | undefined;
    actorScope?:
      EnrollmentActorScope;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();

  const studentRows =
    await db
      .select({
        id:
          students.id,
        status:
          students.status,
        activeProfileId:
          studentBiometricProfiles.id,
      })
      .from(students)
      .leftJoin(
        studentBiometricProfiles,
        and(
          eq(
            studentBiometricProfiles.schoolId,
            students.schoolId,
          ),
          eq(
            studentBiometricProfiles.studentId,
            students.id,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .where(
        and(
          eq(
            students.schoolId,
            input.access.school.id,
          ),
          eq(
            students.id,
            input.studentId,
          ),
        ),
      )
      .limit(1);

  const student =
    studentRows[0];

  if (!student) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "STUDENT_NOT_FOUND",
    };
  }

  if (
    student.status !==
      "ACTIVE"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "STUDENT_NOT_ACTIVE",
    };
  }
  const action =
    student.activeProfileId
      ? "BIOMETRIC_REENROLL"
      : "BIOMETRIC_ENROLL";

  const actorScope =
    input.actorScope ??
    "SCHOOL";

  try {
    if (
      actorScope ===
      "CASA_INTERNAL"
    ) {
      await requireCasaInternalPasskeyStepUpGrant({
        token:
          input.stepUpToken,
        access:
          input.access,
        action,
      });
    } else {
      await requirePasskeyStepUpGrant({
        token:
          input.stepUpToken,
        access:
          input.access as
            SchoolAccess,
        action,
      });
    }
  } catch {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        action,
    };
  }

  const activeSessionRows =
    await db
      .select({
        id:
          biometricLivenessSessions.id,
        expiresAt:
          biometricLivenessSessions.expiresAt,
      })
      .from(
        biometricLivenessSessions,
      )
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.studentId,
            input.studentId,
          ),
          eq(
            biometricLivenessSessions.purpose,
            "ENROLLMENT",
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
          gt(
            biometricLivenessSessions.expiresAt,
            new Date(),
          ),
        ),
      )
      .limit(1);

  if (activeSessionRows[0]) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_SESSION_ALREADY_ACTIVE",
    };
  }

  const actorIds =
    enrollmentActorIds(
      input.access,
      actorScope,
    );

  const session =
    await createBoundLivenessSession({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
      membershipId:
        actorIds.schoolMembershipId,
      internalMembershipId:
        actorIds.internalMembershipId,
      purpose:
        "ENROLLMENT",
      authorizationAction:
        action,
    });

  return {
    ok: true as const,
    action,
    session,
  };
}

export async function completeAwsEnrollmentLiveness(
  input: {
    access:
      EnrollmentAccess;
    studentId: string;
    livenessSessionId:
      string;
    actorScope?:
      EnrollmentActorScope;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();
  const actorScope =
    input.actorScope ??
    "SCHOOL";
  const actorIds =
    enrollmentActorIds(
      input.access,
      actorScope,
    );
  const actorCondition =
    enrollmentLivenessActorCondition({
      access:
        input.access,
      scope:
        actorScope,
    });

  const sessionRows =
    await db
      .select({
        id:
          biometricLivenessSessions.id,
        providerSessionId:
          biometricLivenessSessions.providerSessionId,
        expiresAt:
          biometricLivenessSessions.expiresAt,
        authorizationAction:
          biometricLivenessSessions.authorizationAction,
      })
      .from(
        biometricLivenessSessions,
      )
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.id,
            input.livenessSessionId,
          ),
          eq(
            biometricLivenessSessions.studentId,
            input.studentId,
          ),
          actorCondition,
          eq(
            biometricLivenessSessions.purpose,
            "ENROLLMENT",
          ),
          eq(
            biometricLivenessSessions.provider,
            AWS_REKOGNITION_PROVIDER,
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
        ),
      )
      .limit(1);

  const session =
    sessionRows[0];

  if (!session) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_SESSION_UNAVAILABLE",
    };
  }

  if (
    expired(
      session.expiresAt,
    )
  ) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "EXPIRED",
      failureCode:
        "LIVENESS_SESSION_EXPIRED",
    });

    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_SESSION_EXPIRED",
    };
  }

  const result =
    await getAwsFaceLivenessResult(
      session.providerSessionId,
    );

  if (
    result.status ===
      "CREATED" ||
    result.status ===
      "IN_PROGRESS"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_NOT_COMPLETE",
    };
  }

  if (
    result.status ===
      "FAILED" ||
    result.status ===
      "EXPIRED"
  ) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        result.status ===
          "EXPIRED"
          ? "EXPIRED"
          : "FAILED",
      failureCode:
        `AWS_LIVENESS_${result.status}`,
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        `AWS_LIVENESS_${result.status}`,
    };
  }

  const policy =
    getBiometricThresholdPolicy();

  if (
    result.confidenceBps <
    policy.livenessMinConfidenceBps
  ) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "FAILED",
      livenessConfidenceBps:
        result.confidenceBps,
      failureCode:
        "LIVENESS_CONFIDENCE_BELOW_POLICY",
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        "LIVENESS_CONFIDENCE_BELOW_POLICY",
    };
  }

  if (!result.referenceImage) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "AWS_REFERENCE_IMAGE_UNAVAILABLE",
    };
  }

  const activeProfiles =
    await db
      .select({
        id:
          studentBiometricProfiles.id,
        provider:
          studentBiometricProfiles.provider,
        providerSubjectRef:
          studentBiometricProfiles.providerSubjectRef,
      })
      .from(
        studentBiometricProfiles,
      )
      .where(
        and(
          eq(
            studentBiometricProfiles.schoolId,
            input.access.school.id,
          ),
          eq(
            studentBiometricProfiles.studentId,
            input.studentId,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  const previous =
    activeProfiles[0] ??
    null;

  if (
    session.authorizationAction ===
      "BIOMETRIC_ENROLL" &&
    previous
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "BIOMETRIC_PROFILE_STATE_CHANGED",
    };
  }

  if (
    session.authorizationAction ===
      "BIOMETRIC_REENROLL" &&
    !previous
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "BIOMETRIC_PROFILE_STATE_CHANGED",
    };
  }

  const faceCandidates =
    await searchAwsFaceCandidates({
      schoolId:
        input.access.school.id,
      referenceImage:
        result.referenceImage,
      thresholdBps:
        policy.faceMinConfidenceBps,
    });

  const candidateFaceIds =
    [
      ...new Set(
        faceCandidates
          .filter(
            (candidate) =>
              candidate.similarityBps >=
              policy.faceMinConfidenceBps,
          )
          .map(
            (candidate) =>
              candidate.faceId,
          ),
      ),
    ];

  if (
    candidateFaceIds.length >
      0
  ) {
    const duplicateProfiles =
      await db
        .select({
          id:
            studentBiometricProfiles.id,
          studentId:
            studentBiometricProfiles.studentId,
        })
        .from(
          studentBiometricProfiles,
        )
        .where(
          and(
            eq(
              studentBiometricProfiles.schoolId,
              input.access.school.id,
            ),
            eq(
              studentBiometricProfiles.provider,
              AWS_REKOGNITION_PROVIDER,
            ),
            eq(
              studentBiometricProfiles.status,
              "ACTIVE",
            ),
            ne(
              studentBiometricProfiles.studentId,
              input.studentId,
            ),
            inArray(
              studentBiometricProfiles.providerSubjectRef,
              candidateFaceIds,
            ),
          ),
        )
        .limit(1);

    if (
      duplicateProfiles.length >
        0
    ) {
      await markLivenessSession({
        schoolId:
          input.access.school.id,
        id:
          session.id,
        status:
          "FAILED",
        livenessConfidenceBps:
          result.confidenceBps,
        failureCode:
          "FACE_ALREADY_ENROLLED_TO_ANOTHER_STUDENT",
      });

      return {
        ok: false as const,
        status: 409 as const,
        code:
          "FACE_ALREADY_ENROLLED_TO_ANOTHER_STUDENT",
      };
    }
  }

  const indexed =
    await indexAwsStudentFace({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
      referenceImage:
        result.referenceImage,
    });

  const now =
    new Date().toISOString();

  let activated = false;

  try {
    await db.execute(sql`
      with previous_profile as (
        update student_biometric_profiles
        set
          status =
            'REVOKED'::student_biometric_profile_status,
          revoked_at =
            ${now}::timestamptz,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'ACTIVE'::student_biometric_profile_status
        returning
          id,
          provider,
          provider_subject_ref
      ),
      inserted_profile as (
        insert into student_biometric_profiles (
          school_id,
          student_id,
          provider,
          provider_subject_ref,
          status,
          enrolled_by_membership_id,
          enrolled_by_internal_membership_id,
          enrolled_at,
          created_at,
          updated_at
        )
        select
          ${input.access.school.id}::uuid,
          ${input.studentId}::uuid,
          ${AWS_REKOGNITION_PROVIDER},
          ${indexed.faceId},
          'ACTIVE'::student_biometric_profile_status,
          ${actorIds.schoolMembershipId}::uuid,
          ${actorIds.internalMembershipId}::uuid,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from (
          select count(*)
          from previous_profile
        ) as previous_profile_transition
        returning
          id,
          school_id,
          student_id,
          provider,
          provider_subject_ref
      ),
      inserted_event as (
        insert into student_biometric_profile_events (
          school_id,
          student_id,
          profile_id,
          previous_profile_id,
          actor_membership_id,
          actor_internal_membership_id,
          event_type,
          provider,
          provider_subject_ref,
          created_at
        )
        select
          inserted_profile.school_id,
          inserted_profile.student_id,
          inserted_profile.id,
          (
            select id
            from previous_profile
            limit 1
          ),
          ${actorIds.schoolMembershipId}::uuid,
          ${actorIds.internalMembershipId}::uuid,
          case
            when exists (
              select 1
              from previous_profile
            )
            then
              'REENROLLED'::student_biometric_profile_event_type
            else
              'ENROLLED'::student_biometric_profile_event_type
          end,
          inserted_profile.provider,
          inserted_profile.provider_subject_ref,
          ${now}::timestamptz
        from inserted_profile
        returning
          profile_id,
          event_type
      ),
      cleanup_job as (
        insert into biometric_provider_cleanup_jobs (
          school_id,
          provider,
          collection_ref,
          subject_ref,
          status,
          attempt_count,
          available_at,
          created_at,
          updated_at
        )
        select
          ${input.access.school.id}::uuid,
          previous_profile.provider,
          ${indexed.collectionId},
          previous_profile.provider_subject_ref,
          'PENDING'::biometric_provider_cleanup_status,
          0,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from previous_profile
        where
          previous_profile.provider =
            ${AWS_REKOGNITION_PROVIDER}
        on conflict do nothing
        returning id
      ),
      completed_session as (
        update biometric_liveness_sessions
        set
          status =
            'COMPLETED'::biometric_liveness_status,
          liveness_confidence_bps =
            ${result.confidenceBps},
          provider_subject_ref =
            ${indexed.faceId},
          completed_at =
            ${now}::timestamptz,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${input.access.school.id}::uuid
          and id =
            ${session.id}::uuid
          and status =
            'CREATED'::biometric_liveness_status
        returning id
      ),
      internal_audit as (
        insert into casa_internal_audit_logs (
          actor_membership_id,
          school_id,
          action,
          subject_type,
          subject_id,
          metadata,
          created_at
        )
        select
          ${actorIds.internalMembershipId}::uuid,
          inserted_profile.school_id,
          case
            when inserted_event.event_type =
              'REENROLLED'::student_biometric_profile_event_type
            then
              'STUDENT_FACE_REENROLLED'
            else
              'STUDENT_FACE_ENROLLED'
          end,
          'STUDENT',
          inserted_profile.student_id,
          jsonb_build_object(
            'biometricEvent',
            inserted_event.event_type,
            'authorizationAction',
            ${session.authorizationAction}::text
          ),
          ${now}::timestamptz
        from inserted_profile
        join inserted_event
          on inserted_event.profile_id =
            inserted_profile.id
        where
          ${actorScope}::text =
            'CASA_INTERNAL'
          and exists (
            select 1
            from completed_session
          )
        returning id
      )
      select
        inserted_profile.id as profile_id,
        inserted_event.event_type
      from inserted_profile
      join inserted_event
        on inserted_event.profile_id =
          inserted_profile.id
      where exists (
        select 1
        from completed_session
      )
    `);

    activated = true;
  } finally {
    if (!activated) {
      try {
        await deleteAwsFace({
          collectionId:
            indexed.collectionId,
          faceId:
            indexed.faceId,
        });
      } catch {
        // No CASA profile points to this vector. A later
        // collection hygiene process can remove the orphan.
      }
    }
  }

  if (
    previous?.provider ===
      AWS_REKOGNITION_PROVIDER
  ) {
    try {
      await deleteAwsFace({
        collectionId:
          indexed.collectionId,
        faceId:
          previous.providerSubjectRef,
      });

      await db
        .update(
          biometricProviderCleanupJobs,
        )
        .set({
          status:
            "DONE",
          attemptCount:
            1,
          completedAt:
            new Date(),
          updatedAt:
            new Date(),
          lastError:
            null,
        })
        .where(
          and(
            eq(
              biometricProviderCleanupJobs.schoolId,
              input.access.school.id,
            ),
            eq(
              biometricProviderCleanupJobs.provider,
              AWS_REKOGNITION_PROVIDER,
            ),
            eq(
              biometricProviderCleanupJobs.collectionRef,
              indexed.collectionId,
            ),
            eq(
              biometricProviderCleanupJobs.subjectRef,
              previous.providerSubjectRef,
            ),
          ),
        );
    } catch {
      await db
        .update(
          biometricProviderCleanupJobs,
        )
        .set({
          attemptCount:
            1,
          lastError:
            "AWS_DELETE_FACE_FAILED",
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              biometricProviderCleanupJobs.schoolId,
              input.access.school.id,
            ),
            eq(
              biometricProviderCleanupJobs.provider,
              AWS_REKOGNITION_PROVIDER,
            ),
            eq(
              biometricProviderCleanupJobs.collectionRef,
              indexed.collectionId,
            ),
            eq(
              biometricProviderCleanupJobs.subjectRef,
              previous.providerSubjectRef,
            ),
          ),
        );
    }
  }

  return {
    ok: true as const,
    profile: {
      provider:
        AWS_REKOGNITION_PROVIDER,
      subjectRef:
        indexed.faceId,
      livenessConfidenceBps:
        result.confidenceBps,
      eventType:
        previous
          ? "REENROLLED"
          : "ENROLLED",
    },
  };
}

export async function startAwsVerificationLiveness(
  input: {
    access:
      TerminalAccess;
    attemptId:
      string;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();

  const attemptRows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        studentId:
          attendanceVerificationAttempts.studentId,
        outcome:
          attendanceVerificationAttempts.outcome,
        profileProvider:
          studentBiometricProfiles.provider,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .leftJoin(
        studentBiometricProfiles,
        and(
          eq(
            studentBiometricProfiles.schoolId,
            attendanceVerificationAttempts.schoolId,
          ),
          eq(
            studentBiometricProfiles.studentId,
            attendanceVerificationAttempts.studentId,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalId,
            input.access.terminal.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            input.attemptId,
          ),
        ),
      )
      .limit(1);

  const attempt =
    attemptRows[0];

  if (
    !attempt ||
    !attempt.studentId
  ) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "ATTEMPT_NOT_FOUND",
    };
  }

  if (
    attempt.outcome !==
      "PENDING"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTEMPT_NOT_FINALIZABLE",
    };
  }
  if (
    !attempt.profileProvider ||
    attempt.profileProvider !==
      AWS_REKOGNITION_PROVIDER
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "AWS_ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    };
  }

  const now =
    new Date();

  await db
    .update(
      biometricLivenessSessions,
    )
    .set({
      status:
        "EXPIRED",
      failureCode:
        "LIVENESS_SESSION_EXPIRED",
      updatedAt:
        now,
    })
    .where(
      and(
        eq(
          biometricLivenessSessions.schoolId,
          input.access.school.id,
        ),
        eq(
          biometricLivenessSessions.attemptId,
          input.attemptId,
        ),
        eq(
          biometricLivenessSessions.purpose,
          "VERIFICATION",
        ),
        eq(
          biometricLivenessSessions.status,
          "CREATED",
        ),
        lte(
          biometricLivenessSessions.expiresAt,
          now,
        ),
      ),
    );

  const activeSessions =
    await db
      .select({
        id:
          biometricLivenessSessions.id,
        providerSessionId:
          biometricLivenessSessions.providerSessionId,
        expiresAt:
          biometricLivenessSessions.expiresAt,
      })
      .from(
        biometricLivenessSessions,
      )
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.attemptId,
            input.attemptId,
          ),
          eq(
            biometricLivenessSessions.purpose,
            "VERIFICATION",
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
          gt(
            biometricLivenessSessions.expiresAt,
            now,
          ),
        ),
      )
      .limit(1);

  const activeSession =
    activeSessions[0];

  if (activeSession) {
    const credentials =
      await issueAwsLivenessStreamingCredentials(
        activeSession.providerSessionId,
      );

    return {
      ok: true as const,
      replayed:
        true as const,
      session: {
        livenessSessionId:
          activeSession.id,
        providerSessionId:
          activeSession.providerSessionId,
        expiresAt:
          activeSession.expiresAt,
        streaming: {
          region:
            credentials.region,
          accessKeyId:
            credentials.accessKeyId,
          secretAccessKey:
            credentials.secretAccessKey,
          sessionToken:
            credentials.sessionToken,
          expiration:
            credentials.expiration,
        },
      },
    };
  }

  const session =
    await createBoundLivenessSession({
      schoolId:
        input.access.school.id,
      studentId:
        attempt.studentId,
      attemptId:
        attempt.id,
      terminalId:
        input.access.terminal.id,
      purpose:
        "VERIFICATION",
    });

  return {
    ok: true as const,
    session,
  };
}

export async function completeAwsVerificationLiveness(
  input: {
    access:
      TerminalAccess;
    attemptId:
      string;
    livenessSessionId:
      string;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();

  const sessionRows =
    await db
      .select({
        id:
          biometricLivenessSessions.id,
        studentId:
          biometricLivenessSessions.studentId,
        providerSessionId:
          biometricLivenessSessions.providerSessionId,
        expiresAt:
          biometricLivenessSessions.expiresAt,
      })
      .from(
        biometricLivenessSessions,
      )
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.id,
            input.livenessSessionId,
          ),
          eq(
            biometricLivenessSessions.attemptId,
            input.attemptId,
          ),
          eq(
            biometricLivenessSessions.terminalId,
            input.access.terminal.id,
          ),
          eq(
            biometricLivenessSessions.purpose,
            "VERIFICATION",
          ),
          eq(
            biometricLivenessSessions.provider,
            AWS_REKOGNITION_PROVIDER,
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
        ),
      )
      .limit(1);

  const session =
    sessionRows[0];

  if (!session) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_SESSION_UNAVAILABLE",
    };
  }

  if (
    expired(
      session.expiresAt,
    )
  ) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "EXPIRED",
      failureCode:
        "LIVENESS_SESSION_EXPIRED",
    });

    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_SESSION_EXPIRED",
    };
  }

  const liveness =
    await getAwsFaceLivenessResult(
      session.providerSessionId,
    );

  if (
    liveness.status ===
      "CREATED" ||
    liveness.status ===
      "IN_PROGRESS"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "LIVENESS_NOT_COMPLETE",
    };
  }

  if (
    liveness.status ===
      "FAILED" ||
    liveness.status ===
      "EXPIRED"
  ) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        liveness.status ===
          "EXPIRED"
          ? "EXPIRED"
          : "FAILED",
      failureCode:
        `AWS_LIVENESS_${liveness.status}`,
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        `AWS_LIVENESS_${liveness.status}`,
    };
  }

  const policy =
    getBiometricThresholdPolicy();

  if (
    liveness.confidenceBps <
    policy.livenessMinConfidenceBps
  ) {
    await db
      .update(
        attendanceVerificationAttempts,
      )
      .set({
        faceResult:
          "NOT_RUN",
        livenessResult:
          "FAILED",
        livenessConfidenceBps:
          liveness.confidenceBps,
        outcome:
          "REJECTED",
        reasonCode:
          "LIVENESS_CONFIDENCE_BELOW_POLICY",
        completedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            input.attemptId,
          ),
          eq(
            attendanceVerificationAttempts.outcome,
            "PENDING",
          ),
        ),
      );

    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "FAILED",
      livenessConfidenceBps:
        liveness.confidenceBps,
      failureCode:
        "LIVENESS_CONFIDENCE_BELOW_POLICY",
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        "LIVENESS_CONFIDENCE_BELOW_POLICY",
    };
  }

  if (!liveness.referenceImage) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "AWS_REFERENCE_IMAGE_UNAVAILABLE",
    };
  }

  const currentVerificationImageDataUrl =
    verificationImageDataUrl(
      liveness.referenceImage,
    );

  const profileRows =
    await db
      .select({
        id:
          studentBiometricProfiles.id,
        provider:
          studentBiometricProfiles.provider,
        providerSubjectRef:
          studentBiometricProfiles.providerSubjectRef,
      })
      .from(
        studentBiometricProfiles,
      )
      .where(
        and(
          eq(
            studentBiometricProfiles.schoolId,
            input.access.school.id,
          ),
          eq(
            studentBiometricProfiles.studentId,
            session.studentId,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  const profile =
    profileRows[0];

  if (
    !profile ||
    profile.provider !==
      AWS_REKOGNITION_PROVIDER
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "AWS_ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    };
  }

  const face =
    await searchAwsExpectedFace({
      schoolId:
        input.access.school.id,
      expectedFaceId:
        profile.providerSubjectRef,
      referenceImage:
        liveness.referenceImage,
      thresholdBps:
        policy.faceMinConfidenceBps,
    });

  if (!face.matched) {
    await db
      .update(
        attendanceVerificationAttempts,
      )
      .set({
        faceResult:
          "FAILED",
        faceConfidenceBps:
          face.similarityBps,
        livenessResult:
          "PASSED",
        livenessConfidenceBps:
          liveness.confidenceBps,
        outcome:
          "REJECTED",
        reasonCode:
          "FACE_MISMATCH",
        completedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            input.attemptId,
          ),
          eq(
            attendanceVerificationAttempts.outcome,
            "PENDING",
          ),
        ),
      );

    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "FAILED",
      livenessConfidenceBps:
        liveness.confidenceBps,
      faceSimilarityBps:
        face.similarityBps,
      failureCode:
        "FACE_MISMATCH",
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        "FACE_MISMATCH",
    };
  }

  const secret =
    process.env
      .CASA_BIOMETRIC_ASSERTION_HMAC_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503 as const,
      code:
        "BIOMETRIC_ASSERTION_NOT_CONFIGURED",
    };
  }

  const now =
    new Date();

  const token =
    createBiometricAssertion(
      {
        version: 1,
        assertionId:
          randomBytes(18)
            .toString(
              "base64url",
            ),
        attemptId:
          input.attemptId,
        studentId:
          session.studentId,
        profileId:
          profile.id,
        provider:
          AWS_REKOGNITION_PROVIDER,
        providerVerificationId:
          session.providerSessionId,
        faceResult:
          "PASSED",
        livenessResult:
          "PASSED",
        faceConfidenceBps:
          face.similarityBps,
        livenessConfidenceBps:
          liveness.confidenceBps,
        issuedAt:
          now.toISOString(),
        expiresAt:
          new Date(
            now.getTime() +
              60_000,
          ).toISOString(),
      },
      secret,
    );

  const assertion =
    verifyBiometricAssertion(
      token,
      secret,
      now,
    );

  const finalized =
    await finalizeVerifiedPresence(
      input.access,
      input.attemptId,
      assertion,
    );

  if (!finalized.ok) {
    await markLivenessSession({
      schoolId:
        input.access.school.id,
      id:
        session.id,
      status:
        "FAILED",
      livenessConfidenceBps:
        liveness.confidenceBps,
      faceSimilarityBps:
        face.similarityBps,
      failureCode:
        finalized.code,
    });

    return {
      ok: false as const,
      status:
        finalized.status,
      code:
        finalized.code,
    };
  }

  await markLivenessSession({
    schoolId:
      input.access.school.id,
    id:
      session.id,
    status:
      "COMPLETED",
    livenessConfidenceBps:
      liveness.confidenceBps,
    faceSimilarityBps:
      face.similarityBps,
    providerSubjectRef:
      profile.providerSubjectRef,
  });

  return {
    ok: true as const,
    presence: {
      operation:
        finalized.operation,
      attendanceRecordId:
        finalized
          .attendanceRecordId,
      presenceEventId:
        finalized
          .presenceEventId,
      notificationQueued:
        finalized
          .notificationQueued,
      guardianPushQueued:
        finalized
          .guardianPushQueued,
      replayed:
        finalized.replayed,
    },
    verificationImageDataUrl:
      currentVerificationImageDataUrl,
    scores: {
      faceConfidenceBps:
        face.similarityBps,
      livenessConfidenceBps:
        liveness.confidenceBps,
    },
  };
}

export async function cancelAwsEnrollmentLiveness(
  input: {
    access:
      EnrollmentAccess;
    studentId:
      string;
    livenessSessionId:
      string;
    actorScope?:
      EnrollmentActorScope;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();
  const actorScope =
    input.actorScope ??
    "SCHOOL";
  const actorCondition =
    enrollmentLivenessActorCondition({
      access:
        input.access,
      scope:
        actorScope,
    });

  const rows =
    await db
      .update(
        biometricLivenessSessions,
      )
      .set({
        status:
          "FAILED",
        failureCode:
          "CLIENT_CANCELLED",
        updatedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.id,
            input.livenessSessionId,
          ),
          eq(
            biometricLivenessSessions.studentId,
            input.studentId,
          ),
          actorCondition,
          eq(
            biometricLivenessSessions.purpose,
            "ENROLLMENT",
          ),
          eq(
            biometricLivenessSessions.provider,
            AWS_REKOGNITION_PROVIDER,
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
        ),
      )
      .returning({
        id:
          biometricLivenessSessions.id,
      });

  return {
    ok:
      Boolean(
        rows[0],
      ),
  };
}

export async function cancelAwsVerificationLiveness(
  input: {
    access:
      TerminalAccess;
    attemptId:
      string;
    livenessSessionId:
      string;
  },
) {
  assertBiometricProviderMode(
    "AWS_REKOGNITION",
  );

  const db = getDb();

  const rows =
    await db
      .update(
        biometricLivenessSessions,
      )
      .set({
        status:
          "FAILED",
        failureCode:
          "CLIENT_CANCELLED",
        updatedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            biometricLivenessSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            biometricLivenessSessions.id,
            input.livenessSessionId,
          ),
          eq(
            biometricLivenessSessions.attemptId,
            input.attemptId,
          ),
          eq(
            biometricLivenessSessions.terminalId,
            input.access.terminal.id,
          ),
          eq(
            biometricLivenessSessions.purpose,
            "VERIFICATION",
          ),
          eq(
            biometricLivenessSessions.provider,
            AWS_REKOGNITION_PROVIDER,
          ),
          eq(
            biometricLivenessSessions.status,
            "CREATED",
          ),
        ),
      )
      .returning({
        id:
          biometricLivenessSessions.id,
      });

  return {
    ok:
      Boolean(
        rows[0],
      ),
  };
}

export {
  AwsBiometricUnavailableError,
  awsCollectionIdForSchool,
};