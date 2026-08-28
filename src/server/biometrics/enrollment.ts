import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { getDb } from "@/db";
import {
  studentBiometricProfiles,
  students,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  requirePasskeyStepUpGrant,
} from "@/server/auth/passkey-step-up";

import {
  getBiometricThresholdPolicy,
} from "./policy";
import {
  enrollBiometricSubject,
} from "./provider";

export async function enrollStudentBiometric(
  input: {
    access: SchoolAccess;
    studentId: string;
    capture: File;
    stepUpToken:
      string | null | undefined;
  },
) {
  const db = getDb();

  const studentRows =
    await db
      .select({
        id:
          students.id,
        status:
          students.status,
      })
      .from(students)
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

  const existingRows =
    await db
      .select({
        id:
          studentBiometricProfiles.id,
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
    existingRows[0] ?? null;

  const action =
    previous
      ? "BIOMETRIC_REENROLL"
      : "BIOMETRIC_ENROLL";

  try {
    await requirePasskeyStepUpGrant({
      token:
        input.stepUpToken,
      access:
        input.access,
      action,
    });
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

  const policy =
    getBiometricThresholdPolicy();

  const provider =
    await enrollBiometricSubject({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
      requestId:
        randomUUID(),
      capture:
        input.capture,
    });

  if (
    !provider.liveness.passed ||
    provider.liveness.confidenceBps <
      policy.livenessMinConfidenceBps
  ) {
    return {
      ok: false as const,
      status: 422 as const,
      code:
        "ENROLLMENT_LIVENESS_FAILED",
    };
  }

  const now =
    new Date().toISOString();

  const result =
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
          id
      ),
      inserted_profile as (
        insert into student_biometric_profiles (
          school_id,
          student_id,
          provider,
          provider_subject_ref,
          status,
          enrolled_by_membership_id,
          enrolled_at,
          created_at,
          updated_at
        )
        values (
          ${input.access.school.id}::uuid,
          ${input.studentId}::uuid,
          ${provider.provider},
          ${provider.subjectRef},
          'ACTIVE'::student_biometric_profile_status,
          ${input.access.membership.id}::uuid,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
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
          ${input.access.membership.id}::uuid,
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
      )
      select
        inserted_profile.id as profile_id,
        inserted_profile.provider,
        inserted_profile.provider_subject_ref,
        inserted_event.event_type
      from inserted_profile
      join inserted_event
        on inserted_event.profile_id =
          inserted_profile.id
    `);

  const row =
    Array.isArray(result)
      ? result[0]
      : null;

  if (!row) {
    throw new Error(
      "Biometric profile activation failed.",
    );
  }

  return {
    ok: true as const,
    profile: {
      id:
        (
          row as {
            profile_id: string;
          }
        ).profile_id,
      provider:
        provider.provider,
      eventType:
        (
          row as {
            event_type:
              | "ENROLLED"
              | "REENROLLED";
          }
        ).event_type,
      livenessConfidenceBps:
        provider.liveness
          .confidenceBps,
      enrollmentId:
        provider.enrollmentId,
    },
  };
}