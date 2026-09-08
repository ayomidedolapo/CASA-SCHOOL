import {
  boolean,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  academicSessions,
  classArms,
} from "./academic";
import {
  schoolMemberships,
} from "./users";

/**
 * Explicit teacher capability scope.
 *
 * STAFF is a broad school role. A STAFF membership does not gain
 * My-Class access unless it also has an ACTIVE assignment here.
 *
 * Assignments are academic-session scoped so access can change
 * cleanly from one school year to the next without rewriting history.
 */
export const schoolTeacherClassAssignments =
  pgTable(
    "school_teacher_class_assignments",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      schoolId:
        uuid("school_id")
          .notNull(),

      membershipId:
        uuid("membership_id")
          .notNull(),

      academicSessionId:
        uuid(
          "academic_session_id",
        ).notNull(),

      classArmId:
        uuid("class_arm_id")
          .notNull(),

      isActive:
        boolean("is_active")
          .default(true)
          .notNull(),

      assignedAt:
        timestamp(
          "assigned_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),

      assignedByMembershipId:
        uuid(
          "assigned_by_membership_id",
        ).notNull(),

      revokedAt:
        timestamp(
          "revoked_at",
          {
            withTimezone:
              true,
          },
        ),

      revokedByMembershipId:
        uuid(
          "revoked_by_membership_id",
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      unique(
        "school_teacher_class_assignments_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),

      unique(
        "school_teacher_class_assignments_teacher_session_class_unique",
      ).on(
        table.schoolId,
        table.membershipId,
        table.academicSessionId,
        table.classArmId,
      ),

      index(
        "school_teacher_class_assignments_teacher_active_idx",
      ).on(
        table.schoolId,
        table.membershipId,
        table.isActive,
        table.academicSessionId,
      ),

      index(
        "school_teacher_class_assignments_class_active_idx",
      ).on(
        table.schoolId,
        table.classArmId,
        table.isActive,
        table.academicSessionId,
      ),

      foreignKey({
        columns: [
          table.schoolId,
          table.membershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_teacher_class_assignments_membership_fk",
      }).onDelete(
        "restrict",
      ),

      foreignKey({
        columns: [
          table.schoolId,
          table.academicSessionId,
        ],
        foreignColumns: [
          academicSessions.schoolId,
          academicSessions.id,
        ],
        name:
          "school_teacher_class_assignments_session_fk",
      }).onDelete(
        "restrict",
      ),

      foreignKey({
        columns: [
          table.schoolId,
          table.classArmId,
        ],
        foreignColumns: [
          classArms.schoolId,
          classArms.id,
        ],
        name:
          "school_teacher_class_assignments_class_arm_fk",
      }).onDelete(
        "restrict",
      ),

      foreignKey({
        columns: [
          table.schoolId,
          table.assignedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_teacher_class_assignments_assigned_by_fk",
      }).onDelete(
        "restrict",
      ),

      foreignKey({
        columns: [
          table.schoolId,
          table.revokedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_teacher_class_assignments_revoked_by_fk",
      }).onDelete(
        "restrict",
      ),
    ],
  );
