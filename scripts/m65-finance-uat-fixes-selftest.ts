import fs from "node:fs";
import path from "node:path";

const read=(relative:string)=>fs.readFileSync(path.join(process.cwd(),relative),"utf8");
const expect=(value:unknown,message:string)=>{if(!value)throw new Error(message)};

const route=read("src/app/api/internal/finance/workbench/route.ts");
const workbench=read("src/app/internal/finance/finance-workbench.tsx");
const intelligence=read("src/app/internal/finance/finance-intelligence.tsx");
const page=read("src/app/internal/finance/page.tsx");

expect(route.includes("invoiceBranches"),"Organization branch invoice query missing");
expect(route.includes("p.scope_kind='BRANCH'"),"Branch pricing precedence missing");
expect(route.includes("Students not assigned to an active branch"),"Unassigned student protection missing");
expect(workbench.includes("Organization branch breakdown"),"Branch preview missing");
expect(page.includes("<FinanceWorkbench branches={branches} />"),"Branches not passed to Finance workbench");
expect(workbench.includes("emailErrorCode"),"Finance email failure code UI missing");
expect(route.includes("emailErrorCode"),"Finance email failure code API missing");
expect(intelligence.includes("setSelectedEvent(null)")&&intelligence.includes("Close"),"Financial calendar Close action missing");
expect(intelligence.includes("Applies to"),"Clear Applies-to wording missing");
expect(!intelligence.includes(">Scope</"),"Old Scope wording remains");

const badC3=String.fromCharCode(0x00c3);
const badC2=String.fromCharCode(0x00c2);
for(const source of [route,workbench,intelligence,page]){
  expect(!source.includes(badC3)&&!source.includes(badC2),"Finance mojibake marker remains");
}

console.log("FINANCE_UAT_FIXES=GREEN");
console.log("ORGANIZATION_BRANCH_INVOICE=GREEN");
console.log("BRANCH_PRICING_PRECEDENCE=GREEN");
console.log("FINANCIAL_CALENDAR_CLOSE=GREEN");
console.log("APPLIES_TO_WORDING=GREEN");
console.log("FINANCE_EMAIL_ERROR_DETAIL=GREEN");
console.log("FINANCE_MOJIBAKE_GUARD=GREEN");
