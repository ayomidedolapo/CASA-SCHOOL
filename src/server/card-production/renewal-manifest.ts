import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (result as {
        rows?: unknown;
      }).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function safeSheetName(
  value: string,
) {
  return value
    .replace(
      /[\\/?*[\]:]/g,
      "-",
    )
    .slice(0, 31);
}

function fullName(
  row: {
    first_name: string;
    middle_name:
      string | null;
    last_name: string;
  },
) {
  return [
    row.first_name,
    row.middle_name,
    row.last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function getRenewalBatch(
  batchId: string,
) {
  const db = getDb();

  const batchResult =
    await db.execute(sql`
      select
        b.id,
        b.school_id,
        school.name
          as school_name,
        school.slug
          as school_slug,
        b.target_session_id,
        session.name
          as target_session_name,
        b.status,
        b.created_at,
        b.updated_at
      from student_card_renewal_batches b
      join schools school
        on school.id =
           b.school_id
      join academic_sessions session
        on session.school_id =
           b.school_id
       and session.id =
           b.target_session_id
      where
        b.id =
          ${batchId}::uuid
      limit 1
    `);

  const batch =
    rowsOf<{
      id: string;
      school_id: string;
      school_name: string;
      school_slug: string;
      target_session_id:
        string;
      target_session_name:
        string;
      status:
        | "PLANNED"
        | "READY"
        | "EXPORTED"
        | "PRINTED"
        | "CANCELLED";
      created_at: Date;
      updated_at: Date;
    }>(
      batchResult,
    )[0];

  if (!batch) {
    return null;
  }

  const itemResult =
    await db.execute(sql`
      select
        item.id,
        item.student_id,
        student.casa_student_id,
        student.admission_number,
        student.first_name,
        student.middle_name,
        student.last_name,
        student.sex,
        item.target_enrollment_id,
        item.branch_id,
        branch.name
          as branch_name,
        branch.code
          as branch_code,
        item.section_id,
        section.name
          as section_name,
        level.name
          as class_level_name,
        level.sort_order
          as class_level_sort_order,
        arm.name
          as class_arm_name,
        item.reason,
        item.production_job_id,
        production.status
          as production_status,
        production.public_access_key
          as public_access_key,
        item.created_at,
        item.updated_at
      from student_card_renewal_batch_items item
      join students student
        on student.school_id =
           item.school_id
       and student.id =
           item.student_id
      join student_enrollments enrollment
        on enrollment.school_id =
           item.school_id
       and enrollment.id =
           item.target_enrollment_id
      join class_arms arm
        on arm.school_id =
           enrollment.school_id
       and arm.id =
           enrollment.class_arm_id
      join class_levels level
        on level.school_id =
           arm.school_id
       and level.id =
           arm.class_level_id
      join school_branches branch
        on branch.school_id =
           item.school_id
       and branch.id =
           item.branch_id
      left join school_sections section
        on section.school_id =
           item.school_id
       and section.id =
           item.section_id
      left join student_card_production_jobs
        production
        on production.school_id =
           item.school_id
       and production.id =
           item.production_job_id
      where
        item.batch_id =
          ${batchId}::uuid
      order by
        branch.name asc,
        coalesce(
          section.sort_order,
          0
        ) asc,
        level.sort_order asc,
        arm.name asc,
        student.last_name asc,
        student.first_name asc
    `);

  return {
    batch,
    items:
      rowsOf<{
        id: string;
        student_id: string;
        casa_student_id:
          string;
        admission_number:
          string | null;
        first_name:
          string;
        middle_name:
          string | null;
        last_name:
          string;
        sex:
          string;
        target_enrollment_id:
          string;
        branch_id:
          string;
        branch_name:
          string;
        branch_code:
          string;
        section_id:
          string | null;
        section_name:
          string | null;
        class_level_name:
          string;
        class_level_sort_order:
          number;
        class_arm_name:
          string;
        reason:
          | "CLASS_CHANGE"
          | "SESSION_CHANGE"
          | "CLASS_AND_SESSION_CHANGE";
        production_job_id:
          string | null;
        production_status:
          string | null;
        public_access_key:
          string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        itemResult,
      ),
  };
}

export async function listRenewalBatches(
  input: {
    schoolId:
      string | null;
    status:
      | "PLANNED"
      | "READY"
      | "EXPORTED"
      | "PRINTED"
      | "CANCELLED"
      | null;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        b.id,
        b.school_id,
        school.name
          as school_name,
        school.slug
          as school_slug,
        b.target_session_id,
        session.name
          as target_session_name,
        b.status,
        b.created_at,
        b.updated_at,
        (
          select count(*)::int
          from student_card_renewal_batch_items item
          where item.batch_id = b.id
        ) as student_count,
        (
          select count(*)::int
          from student_card_renewal_batch_items item
          where
            item.batch_id = b.id
            and item.production_job_id
              is not null
        ) as rendered_count
      from student_card_renewal_batches b
      join schools school
        on school.id =
           b.school_id
      join academic_sessions session
        on session.school_id =
           b.school_id
       and session.id =
           b.target_session_id
      where
        (
          ${input.schoolId}::uuid
            is null
          or b.school_id =
             ${input.schoolId}::uuid
        )
        and (
          ${input.status}::student_card_renewal_batch_status
            is null
          or b.status =
             ${input.status}::student_card_renewal_batch_status
        )
      order by
        session.starts_on desc,
        school.name asc,
        b.created_at desc
      limit 1000
    `);

  return rowsOf(result);
}

export async function buildCardRenewalManifest(
  batchId: string,
) {
  const payload =
    await getRenewalBatch(
      batchId,
    );

  if (!payload) {
    return null;
  }

  const {
    batch,
    items,
  } =
    payload;

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "CASA";
  workbook.subject =
    "Student ID Card Renewal Batch";
  workbook.created =
    new Date();

  const summary =
    workbook.addWorksheet(
      "Summary",
      {
        views: [
          {
            state:
              "frozen",
            ySplit:
              7,
          },
        ],
      },
    );

  summary.addRows([
    [
      "Organization",
      batch.school_name,
    ],
    [
      "Academic Session",
      batch.target_session_name,
    ],
    [
      "Batch Status",
      batch.status,
    ],
    [
      "Total Students",
      items.length,
    ],
    [
      "Rendered",
      items.filter(
        (item) =>
          Boolean(
            item.production_job_id,
          ),
      ).length,
    ],
    [],
    [
      "Branch",
      "Section",
      "Students",
      "Rendered",
    ],
  ]);

  summary.getRow(7).font = {
    bold: true,
  };

  const groups =
    new Map<
      string,
      typeof items
    >();

  for (const item of items) {
    const section =
      item.section_name ??
      "Unsectioned";

    const key =
      `${item.branch_name}|||${section}`;

    const group =
      groups.get(key) ??
      [];

    group.push(item);
    groups.set(
      key,
      group,
    );
  }

  for (
    const [key, group]
    of groups
  ) {
    const [
      branchName,
      sectionName,
    ] =
      key.split("|||");

    summary.addRow([
      branchName,
      sectionName,
      group.length,
      group.filter(
        (item) =>
          Boolean(
            item.production_job_id,
          ),
      ).length,
    ]);

    const sheet =
      workbook.addWorksheet(
        safeSheetName(
          `${branchName} - ${sectionName}`,
        ),
        {
          views: [
            {
              state:
                "frozen",
              ySplit:
                1,
            },
          ],
        },
      );

    sheet.columns = [
      {
        header:
          "Student Name",
        key:
          "studentName",
        width:
          30,
      },
      {
        header:
          "CASA Student ID",
        key:
          "casaStudentId",
        width:
          24,
      },
      {
        header:
          "Admission Number",
        key:
          "admissionNumber",
        width:
          20,
      },
      {
        header:
          "Sex",
        key:
          "sex",
        width:
          12,
      },
      {
        header:
          "Branch",
        key:
          "branch",
        width:
          24,
      },
      {
        header:
          "Section",
        key:
          "section",
        width:
          22,
      },
      {
        header:
          "Class",
        key:
          "className",
        width:
          24,
      },
      {
        header:
          "Renewal Reason",
        key:
          "reason",
        width:
          28,
      },
      {
        header:
          "Production Status",
        key:
          "productionStatus",
        width:
          22,
      },
      {
        header:
          "Production Job ID",
        key:
          "productionJobId",
        width:
          38,
      },
    ];

    sheet.getRow(1).font = {
      bold: true,
    };

    for (const item of group) {
      sheet.addRow({
        studentName:
          fullName(item),
        casaStudentId:
          item.casa_student_id,
        admissionNumber:
          item.admission_number ??
          "",
        sex:
          item.sex,
        branch:
          item.branch_name,
        section:
          item.section_name ??
          "",
        className:
          [
            item.class_level_name,
            item.class_arm_name,
          ]
            .filter(Boolean)
            .join(" "),
        reason:
          item.reason,
        productionStatus:
          item.production_status ??
          "PENDING_PRODUCTION",
        productionJobId:
          item.production_job_id ??
          "",
      });
    }
  }

  const bytes =
    await workbook.xlsx.writeBuffer();

  return {
    batch,
    count:
      items.length,
    bytes:
      Buffer.from(bytes),
  };
}
