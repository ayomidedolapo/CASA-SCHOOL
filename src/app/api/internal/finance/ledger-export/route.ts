import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export async function GET() {
  try {
    await requireCasaSuperAdmin();
    const db = getDb();

    const ledger = rowsOf<{
      journal_entry_id: string;
      source_type: string;
      source_id: string;
      school_name: string | null;
      description: string;
      posted_on: string;
      account_code: string;
      account_name: string;
      account_type: string;
      debit_kobo: string | number;
      credit_kobo: string | number;
      memo: string | null;
    }>(await db.execute(sql`
      select
        j.id as journal_entry_id,
        j.source_type,
        j.source_id,
        s.name as school_name,
        j.description,
        j.posted_on::text as posted_on,
        a.code as account_code,
        a.name as account_name,
        a.account_type,
        l.debit_kobo,
        l.credit_kobo,
        l.memo
      from casa_finance_journal_entries j
      join casa_finance_journal_lines l
        on l.journal_entry_id=j.id
      join casa_finance_ledger_accounts a
        on a.code=l.account_code
      left join schools s
        on s.id=j.school_id
      order by j.posted_on asc,j.created_at asc,a.code asc
    `));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CASA School";
    workbook.subject = "CASA Finance Ledger";
    workbook.title = "CASA Finance Ledger";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Ledger", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Source Type", key: "sourceType", width: 22 },
      { header: "Source ID", key: "sourceId", width: 38 },
      { header: "Organization", key: "organization", width: 32 },
      { header: "Description", key: "description", width: 44 },
      { header: "Account Code", key: "accountCode", width: 16 },
      { header: "Account Name", key: "accountName", width: 30 },
      { header: "Account Type", key: "accountType", width: 18 },
      { header: "Debit (NGN)", key: "debit", width: 18 },
      { header: "Credit (NGN)", key: "credit", width: 18 },
      { header: "Memo", key: "memo", width: 40 },
      { header: "Journal Entry ID", key: "journalEntryId", width: 38 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = {
      from: "A1",
      to: "L1",
    };

    for (const item of ledger) {
      sheet.addRow({
        date: item.posted_on,
        sourceType: item.source_type,
        sourceId: item.source_id,
        organization: item.school_name ?? "CASA-wide",
        description: item.description,
        accountCode: item.account_code,
        accountName: item.account_name,
        accountType: item.account_type,
        debit: Number(item.debit_kobo) / 100,
        credit: Number(item.credit_kobo) / 100,
        memo: item.memo ?? "",
        journalEntryId: item.journal_entry_id,
      });
    }

    sheet.getColumn("debit").numFmt = "#,##0.00";
    sheet.getColumn("credit").numFmt = "#,##0.00";

    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `CASA-Finance-Ledger-${date}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...casaInternalNoStoreHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;

    console.error("CASA Finance ledger export failed", error);
    return NextResponse.json(
      { message: "CASA could not export the Finance ledger." },
      {
        status: 500,
        headers: casaInternalNoStoreHeaders,
      },
    );
  }
}
