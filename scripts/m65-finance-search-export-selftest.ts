import fs from "node:fs";
import path from "node:path";

const read=(relative:string)=>fs.readFileSync(path.join(process.cwd(),relative),"utf8");
const expect=(value:unknown,message:string)=>{if(!value)throw new Error(message)};

const route=read("src/app/api/internal/finance/workbench/route.ts");
const ui=read("src/app/internal/finance/finance-workbench.tsx");
const intelligence=read("src/app/internal/finance/finance-intelligence.tsx");
const exportRoute=read("src/app/api/internal/finance/ledger-export/route.ts");

expect(route.includes('z.literal("RESEND_INVOICE_EMAIL")'),"Invoice resend API action missing");
expect(route.includes('z.literal("RESEND_RECEIPT_EMAIL")'),"Receipt resend API action missing");
expect(route.includes('FINANCE_INVOICE_REEMAILED'),"Invoice resend audit missing");
expect(route.includes('FINANCE_RECEIPT_REEMAILED'),"Receipt resend audit missing");
expect(route.includes("previous.created_at<=p.created_at"),"Historical receipt balance reconstruction missing");

expect(ui.includes("Search this list"),"Finance register search UI missing");
expect(ui.includes("filteredInvoices"),"Invoice search filter missing");
expect(ui.includes("filteredPayments"),"Payment search filter missing");
expect(ui.includes("filteredExpenses"),"Expense search filter missing");
expect(ui.includes("filteredRecurring"),"Subscription search filter missing");
expect(ui.includes("filteredLedger"),"Ledger search filter missing");
expect(ui.includes("filteredSchoolReport"),"Report search filter missing");
expect(ui.includes("Resend invoice"),"Invoice resend UI missing");
expect(ui.includes("Resend receipt"),"Receipt resend UI missing");
expect(ui.includes("Export ledger (.xlsx)"),"Ledger export button missing");

expect(intelligence.includes("filteredBudgets"),"Budget search filter missing");
expect(intelligence.includes("filteredReminders"),"Reminder search filter missing");
expect(intelligence.includes("Search this list"),"Finance intelligence search UI missing");

expect(exportRoute.includes('from "exceljs"'),"ExcelJS ledger export missing");
expect(exportRoute.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),"XLSX content type missing");
expect(exportRoute.includes("CASA-Finance-Ledger-"),"Ledger export filename missing");
expect(!exportRoute.includes("limit "), "Ledger export must not truncate the ledger");

const sources=[route,ui,intelligence,exportRoute];
for(const source of sources){
  for(const character of source){
    expect(character.charCodeAt(0)<=127,"Finance search/export source contains non-ASCII text");
  }
}

console.log("FINANCE_SEARCH_EXPORT_SOURCE=GREEN");
console.log("LEDGER_XLSX_EXPORT=GREEN");
console.log("FINANCE_LIST_SEARCH=GREEN");
console.log("INVOICE_RESEND=GREEN");
console.log("RECEIPT_RESEND=GREEN");
console.log("HISTORICAL_RECEIPT_BALANCE=GREEN");
console.log("FINANCE_SEARCH_EXPORT_MOJIBAKE_GUARD=GREEN");
