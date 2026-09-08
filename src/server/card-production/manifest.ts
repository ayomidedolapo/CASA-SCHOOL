import ExcelJS from "exceljs";

import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";

export function calculateAgeOnDate(
  dateOfBirth:
    string,
  asOfDate:
    string,
): number {
  const [
    birthYear,
    birthMonth,
    birthDay,
  ] =
    dateOfBirth
      .split("-")
      .map(
        Number,
      );

  const [
    year,
    month,
    day,
  ] =
    asOfDate
      .split("-")
      .map(
        Number,
      );

  let age =
    year -
    birthYear;

  if (
    month <
      birthMonth ||
    (
      month ===
        birthMonth &&
      day <
        birthDay
    )
  ) {
    age -= 1;
  }

  return age;
}

export async function buildCardProductionManifest(
  input: {
    jobs:
      Array<{
        id: string;
        status:
          string;
        publicUrl:
          string;
        renderSnapshot:
          StudentCardRenderSnapshot;
        queuedAt:
          Date;
        templateVersion:
          string;
      }>;
    exportDate:
      string;
  },
): Promise<Buffer> {
  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "CASA";
  workbook.subject =
    "Student ID Card Production Manifest";
  workbook.created =
    new Date();

  const sheet =
    workbook.addWorksheet(
      "Card Production",
      {
        views: [
          {
            state:
              "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  sheet.columns = [
    {
      header:
        "School",
      key:
        "school",
      width: 28,
    },
    {
      header:
        "Student Name",
      key:
        "studentName",
      width: 30,
    },
    {
      header:
        "CASA Student ID",
      key:
        "casaStudentId",
      width: 24,
    },
    {
      header:
        "School Student/Admission Number",
      key:
        "admissionNumber",
      width: 26,
    },
    {
      header:
        "Date of Birth",
      key:
        "dateOfBirth",
      width: 16,
    },
    {
      header:
        "Age",
      key:
        "age",
      width: 10,
    },
    {
      header:
        "Gender/Sex",
      key:
        "sex",
      width: 14,
    },
    {
      header:
        "Class",
      key:
        "className",
      width: 22,
    },
    {
      header:
        "Card Serial",
      key:
        "cardSerial",
      width: 22,
    },
    {
      header:
        "ID Card URL",
      key:
        "publicUrl",
      width: 54,
    },
    {
      header:
        "Template Version",
      key:
        "templateVersion",
      width: 20,
    },
    {
      header:
        "Production Status",
      key:
        "status",
      width: 18,
    },
    {
      header:
        "Queued At",
      key:
        "queuedAt",
      width: 24,
    },
  ];

  const header =
    sheet.getRow(
      1,
    );

  header.font = {
    bold: true,
  };
  header.alignment = {
    vertical:
      "middle",
  };

  for (
    const job of
    input.jobs
  ) {
    const snapshot =
      job.renderSnapshot;

    const row =
      sheet.addRow({
        school:
          snapshot.schoolName,
        studentName:
          snapshot.studentName,
        casaStudentId:
          snapshot.casaStudentId,
        admissionNumber:
          snapshot.admissionNumber ??
          "",
        dateOfBirth:
          snapshot.dateOfBirth,
        age:
          calculateAgeOnDate(
            snapshot.dateOfBirth,
            input.exportDate,
          ),
        sex:
          snapshot.sex,
        className:
          snapshot.className ??
          "",
        cardSerial:
          snapshot.cardSerial,
        publicUrl:
          job.publicUrl,
        templateVersion:
          job.templateVersion,
        status:
          job.status,
        queuedAt:
          job.queuedAt
            .toISOString(),
      });

    const urlCell =
      row.getCell(
        "publicUrl",
      );

    urlCell.value = {
      text:
        job.publicUrl,
      hyperlink:
        job.publicUrl,
    };

    urlCell.font = {
      underline: true,
    };
  }

  sheet.autoFilter = {
    from: "A1",
    to: "M1",
  };

  const value =
    await workbook.xlsx
      .writeBuffer();

  return Buffer.from(
    value,
  );
}