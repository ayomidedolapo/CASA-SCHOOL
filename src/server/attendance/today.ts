import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceEarlyDepartureAuthorizations,
  attendancePolicyDays,
  attendanceSessions,
  attendanceTerminals,
  attendanceVerificationAttempts,
  classArms,
  classLevels,
  schoolNotificationOutbox,
  studentAttendanceRecords,
  studentEnrollments,
  studentPresenceEvents,
  students,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

import {
  classifyTodayPresence,
  isTodayView,
  type TodayAttendanceView,
} from "./operations";
import {
  getSchoolClock,
} from "./terminal-session";

export async function getTodayAttendanceOperations(
  input: {
    access:
      SchoolAccess;
    query:
      string;
    view:
      string;
    page:
      number;
    pageSize:
      number;
  },
) {
  const db = getDb();

  const clock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const sessionRows =
    await db
      .select({
        id:
          attendanceSessions.id,
        policyId:
          attendanceSessions.policyId,
        attendanceDate:
          attendanceSessions.attendanceDate,
        status:
          attendanceSessions.status,
        openedAt:
          attendanceSessions.openedAt,
        closedAt:
          attendanceSessions.closedAt,
      })
      .from(
        attendanceSessions,
      )
      .where(
        and(
          eq(
            attendanceSessions.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceSessions.attendanceDate,
            clock.date,
          ),
        ),
      )
      .limit(1);

  const session =
    sessionRows[0] ??
    null;

  let policyDay:
    | {
        checkInOpensAt:
          string;
        onTimeUntil:
          string;
        checkInClosesAt:
          string;
        normalDismissalAt:
          string;
        checkOutClosesAt:
          string;
      }
    | null =
      null;

  if (session) {
    const dayRows =
      await db
        .select({
          checkInOpensAt:
            attendancePolicyDays.checkInOpensAt,
          onTimeUntil:
            attendancePolicyDays.onTimeUntil,
          checkInClosesAt:
            attendancePolicyDays.checkInClosesAt,
          normalDismissalAt:
            attendancePolicyDays.normalDismissalAt,
          checkOutClosesAt:
            attendancePolicyDays.checkOutClosesAt,
        })
        .from(
          attendancePolicyDays,
        )
        .where(
          and(
            eq(
              attendancePolicyDays.schoolId,
              input.access.school.id,
            ),
            eq(
              attendancePolicyDays.policyId,
              session.policyId,
            ),
            eq(
              attendancePolicyDays.weekday,
              clock.weekday,
            ),
          ),
        )
        .limit(1);

    policyDay =
      dayRows[0] ??
      null;
  }

  const expectedRows =
    await db
      .select({
        studentId:
          students.id,
        casaStudentId:
          students.casaStudentId,
        admissionNumber:
          students.admissionNumber,
        firstName:
          students.firstName,
        middleName:
          students.middleName,
        lastName:
          students.lastName,
        classArmId:
          classArms.id,
        classArmName:
          classArms.name,
        classLevelName:
          classLevels.name,
      })
      .from(
        studentEnrollments,
      )
      .innerJoin(
        students,
        and(
          eq(
            students.schoolId,
            studentEnrollments.schoolId,
          ),
          eq(
            students.id,
            studentEnrollments.studentId,
          ),
        ),
      )
      .innerJoin(
        classArms,
        and(
          eq(
            classArms.schoolId,
            studentEnrollments.schoolId,
          ),
          eq(
            classArms.id,
            studentEnrollments.classArmId,
          ),
        ),
      )
      .innerJoin(
        classLevels,
        and(
          eq(
            classLevels.schoolId,
            classArms.schoolId,
          ),
          eq(
            classLevels.id,
            classArms.classLevelId,
          ),
        ),
      )
      .where(
        and(
          eq(
            studentEnrollments.schoolId,
            input.access.school.id,
          ),
          eq(
            studentEnrollments.status,
            "ACTIVE",
          ),
          eq(
            students.status,
            "ACTIVE",
          ),
          sql`${studentEnrollments.startsOn} <= ${clock.date}::date`,
          sql`(${studentEnrollments.endsOn} is null or ${studentEnrollments.endsOn} >= ${clock.date}::date)`,
        ),
      )
      .orderBy(
        asc(
          classLevels.name,
        ),
        asc(
          classArms.name,
        ),
        asc(
          students.lastName,
        ),
        asc(
          students.firstName,
        ),
      );

  const records =
    session
      ? await db
          .select({
            id:
              studentAttendanceRecords.id,
            studentId:
              studentAttendanceRecords.studentId,
            status:
              studentAttendanceRecords.status,
            presenceState:
              studentAttendanceRecords.presenceState,
            recordedAt:
              studentAttendanceRecords.recordedAt,
            departureResult:
              studentAttendanceRecords.departureResult,
            checkedOutAt:
              studentAttendanceRecords.checkedOutAt,
          })
          .from(
            studentAttendanceRecords,
          )
          .where(
            and(
              eq(
                studentAttendanceRecords.schoolId,
                input.access.school.id,
              ),
              eq(
                studentAttendanceRecords.sessionId,
                session.id,
              ),
            ),
          )
      : [];

  const recordByStudent =
    new Map(
      records.map(
        (record) => [
          record.studentId,
          record,
        ],
      ),
    );

  const studentsWithState =
    expectedRows.map(
      (student) => {
        const record =
          recordByStudent.get(
            student.studentId,
          ) ??
          null;

        const presenceStatus =
          classifyTodayPresence({
            hasAttendanceRecord:
              Boolean(record),
            presenceState:
              record?.presenceState ??
              null,
            schoolClock:
              clock.clock,
            checkInClosesAt:
              session &&
              policyDay
                ? policyDay.checkInClosesAt
                : null,
          });

        return {
          ...student,
          presenceStatus,
          arrivalStatus:
            record?.status ??
            null,
          recordedAt:
            record?.recordedAt ??
            null,
          checkedOutAt:
            record?.checkedOutAt ??
            null,
          departureResult:
            record?.departureResult ??
            null,
        };
      },
    );

  const summary = {
    expected:
      studentsWithState.length,
    onCampus:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "ON_CAMPUS",
      ).length,
    signedOut:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "SIGNED_OUT",
      ).length,
    onTime:
      studentsWithState.filter(
        (student) =>
          student.arrivalStatus ===
          "ON_TIME",
      ).length,
    late:
      studentsWithState.filter(
        (student) =>
          student.arrivalStatus ===
          "LATE",
      ).length,
    manual:
      studentsWithState.filter(
        (student) =>
          student.arrivalStatus ===
          "MANUAL",
      ).length,
    notArrived:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "NOT_ARRIVED",
      ).length,
    absent:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "ABSENT",
      ).length,
  };

  const normalizedQuery =
    input.query
      .trim()
      .toLowerCase();

  const requestedView:
    TodayAttendanceView =
      isTodayView(
        input.view,
      )
        ? input.view
        : "ALL";

  const filtered =
    studentsWithState.filter(
      (student) => {
        if (
          normalizedQuery
        ) {
          const haystack =
            [
              student.casaStudentId,
              student.admissionNumber ??
                "",
              student.firstName,
              student.middleName ??
                "",
              student.lastName,
              student.classLevelName,
              student.classArmName,
            ]
              .join(" ")
              .toLowerCase();

          if (
            !haystack.includes(
              normalizedQuery,
            )
          ) {
            return false;
          }
        }

        if (
          requestedView ===
          "LATE"
        ) {
          return (
            student.arrivalStatus ===
            "LATE"
          );
        }

        if (
          requestedView !==
            "ALL" &&
          student.presenceStatus !==
            requestedView
        ) {
          return false;
        }

        return true;
      },
    );

  const total =
    filtered.length;

  const start =
    (input.page - 1) *
    input.pageSize;

  const pageRows =
    filtered.slice(
      start,
      start +
        input.pageSize,
    );

  const terminalRows =
    await db
      .select({
        id:
          attendanceTerminals.id,
        name:
          attendanceTerminals.name,
        status:
          attendanceTerminals.status,
        lastSeenAt:
          attendanceTerminals.lastSeenAt,
      })
      .from(
        attendanceTerminals,
      )
      .where(
        eq(
          attendanceTerminals.schoolId,
          input.access.school.id,
        ),
      )
      .orderBy(
        asc(
          attendanceTerminals.name,
        ),
      );

  const fiveMinutesAgo =
    Date.now() -
    5 * 60 * 1000;

  const terminalHealth = {
    total:
      terminalRows.length,
    active:
      terminalRows.filter(
        (terminal) =>
          terminal.status ===
          "ACTIVE",
      ).length,
    seenRecently:
      terminalRows.filter(
        (terminal) =>
          terminal.status ===
            "ACTIVE" &&
          terminal.lastSeenAt &&
          terminal.lastSeenAt.getTime() >=
            fiveMinutesAgo,
      ).length,
    terminals:
      terminalRows,
  };

  let earlyDepartures:
    Array<{
      attemptId: string;
      studentId: string;
      casaStudentId: string;
      studentName: string;
      createdAt: Date;
      authorized: boolean;
      reason: string | null;
    }> =
      [];

  if (session) {
    const pending =
      await db
        .select({
          attemptId:
            attendanceVerificationAttempts.id,
          studentId:
            students.id,
          casaStudentId:
            students.casaStudentId,
          firstName:
            students.firstName,
          middleName:
            students.middleName,
          lastName:
            students.lastName,
          createdAt:
            attendanceVerificationAttempts.createdAt,
          reasonCode:
            attendanceVerificationAttempts.reasonCode,
          departureResult:
            attendanceVerificationAttempts.departureResult,
        })
        .from(
          attendanceVerificationAttempts,
        )
        .innerJoin(
          students,
          and(
            eq(
              students.schoolId,
              attendanceVerificationAttempts.schoolId,
            ),
            eq(
              students.id,
              attendanceVerificationAttempts.studentId,
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
              attendanceVerificationAttempts.sessionId,
              session.id,
            ),
            eq(
              attendanceVerificationAttempts.operation,
              "CHECK_OUT",
            ),
            eq(
              attendanceVerificationAttempts.outcome,
              "PENDING",
            ),
          ),
        )
        .orderBy(
          desc(
            attendanceVerificationAttempts.createdAt,
          ),
        );

    const authorizationRows =
      await db
        .select({
          attemptId:
            attendanceEarlyDepartureAuthorizations.attemptId,
          reason:
            attendanceEarlyDepartureAuthorizations.reason,
        })
        .from(
          attendanceEarlyDepartureAuthorizations,
        )
        .where(
          and(
            eq(
              attendanceEarlyDepartureAuthorizations.schoolId,
              input.access.school.id,
            ),
            eq(
              attendanceEarlyDepartureAuthorizations.sessionId,
              session.id,
            ),
          ),
        );

    const authorizationByAttempt =
      new Map(
        authorizationRows.map(
          (authorization) => [
            authorization.attemptId,
            authorization,
          ],
        ),
      );

    earlyDepartures =
      pending
        .filter(
          (attempt) =>
            attempt.reasonCode ===
              "EARLY_DEPARTURE_AUTH_REQUIRED" ||
            attempt.departureResult ===
              "EARLY",
        )
        .map(
          (attempt) => {
            const authorization =
              authorizationByAttempt.get(
                attempt.attemptId,
              ) ??
              null;

            return {
              attemptId:
                attempt.attemptId,
              studentId:
                attempt.studentId,
              casaStudentId:
                attempt.casaStudentId,
              studentName:
                [
                  attempt.firstName,
                  attempt.middleName,
                  attempt.lastName,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(" "),
              createdAt:
                attempt.createdAt,
              authorized:
                Boolean(
                  authorization,
                ),
              reason:
                authorization?.reason ??
                null,
            };
          },
        );
  }

  let missingSignOutNotifications =
    0;

  if (session) {
    const checkedOutEvents =
      await db
        .select({
          id:
            studentPresenceEvents.id,
        })
        .from(
          studentPresenceEvents,
        )
        .where(
          and(
            eq(
              studentPresenceEvents.schoolId,
              input.access.school.id,
            ),
            eq(
              studentPresenceEvents.sessionId,
              session.id,
            ),
            eq(
              studentPresenceEvents.eventType,
              "CHECKED_OUT",
            ),
          ),
        );

    if (
      checkedOutEvents.length >
      0
    ) {
      const eventIds =
        checkedOutEvents.map(
          (event) => event.id,
        );

      const outboxRows =
        await db
          .select({
            presenceEventId:
              schoolNotificationOutbox.presenceEventId,
          })
          .from(
            schoolNotificationOutbox,
          )
          .where(
            and(
              eq(
                schoolNotificationOutbox.schoolId,
                input.access.school.id,
              ),
              inArray(
                schoolNotificationOutbox.presenceEventId,
                eventIds,
              ),
            ),
          );

      const notified =
        new Set(
          outboxRows.map(
            (row) =>
              row.presenceEventId,
          ),
        );

      missingSignOutNotifications =
        eventIds.filter(
          (id) =>
            !notified.has(
              id,
            ),
        ).length;
    }
  }

  return {
    clock,
    session,
    policyDay,
    summary,
    page: {
      number:
        input.page,
      size:
        input.pageSize,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
              input.pageSize,
          ),
        ),
      view:
        requestedView,
      query:
        input.query,
    },
    students:
      pageRows,
    earlyDepartures,
    terminalHealth,
    exceptions: {
      signOutsWithoutGuardianOutbox:
        missingSignOutNotifications,
    },
  };
}