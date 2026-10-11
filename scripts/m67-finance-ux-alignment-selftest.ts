import { readFileSync } from "node:fs";

import {
  allocateSessionSubtotalAcrossBranches,
  type SessionInvoiceBranch,
} from "../src/server/finance/session-branch-allocation";

function source(path:string){return readFileSync(path,"utf8")}
function ok(value:unknown,message:string){if(!value)throw new Error(message)}

const page=source("src/app/internal/finance/page.tsx");
const hub=source("src/app/internal/finance/finance-hub.tsx");
const overview=source("src/app/internal/finance/finance-overview.tsx");
const workbench=source("src/app/internal/finance/finance-workbench.tsx");
const intelligence=source("src/app/internal/finance/finance-intelligence.tsx");
const panel=source("src/app/internal/finance/session-commercial-panel.tsx");
const route=source("src/app/api/internal/finance/commercial-model/route.ts");
const invoice=source("src/app/internal/finance/invoices/[invoiceId]/page.tsx");
const email=source("src/server/messaging/finance-email.ts");

ok(
  page.includes("<FinanceHub />") &&
  !page.includes("<SessionCommercialPanel />") &&
  !page.includes("<FinanceWorkbench"),
  "Finance page is not controlled by the unified UX hub.",
);

for(const label of ["Overview","Agreements","Billing","Costs","Planning","Advanced"]){
  ok(hub.includes(label),`Finance hub is missing ${label}.`);
}

ok(
  overview.includes("Agreement → invoice → collection") &&
  overview.includes("Commercial conversion") &&
  overview.includes("Cash effort") &&
  overview.includes("School contribution") &&
  overview.includes("What needs action"),
  "Finance overview is missing the compact analysis/flow experience.",
);

ok(
  workbench.includes("Invoices come from agreed sessions") &&
  !workbench.includes("Legacy invoice drafter") &&
  !workbench.includes("per student / term"),
  "Old-model invoice UX remains visible.",
);

ok(
  intelligence.includes("visibleTabs") &&
  workbench.includes("visibleTabs"),
  "Finance subtools cannot be scoped by the UX hub.",
);

ok(
  panel.includes("Student ID Card Branding & Production Service") &&
  panel.includes("agreementForm(agreement)") &&
  panel.includes("savedId = result.agreementId ?? form.agreementId"),
  "Session agreement wording/state recovery is incomplete.",
);

const branches:SessionInvoiceBranch[]=[
  {id:"hq",name:"Headquarters",code:"HQ",isHeadquarters:true,activeStudentCount:60},
  {id:"b2",name:"North Branch",code:"NB",isHeadquarters:false,activeStudentCount:30},
  {id:"b3",name:"East Branch",code:"EB",isHeadquarters:false,activeStudentCount:10},
];

const allocation=allocateSessionSubtotalAcrossBranches(76400000,branches);
ok(allocation.length===3,"All active organization branches must be represented.");
ok(
  allocation.reduce((sum,item)=>sum+item.amountKobo,0)===76400000,
  "Organization branch allocations must equal the exact invoice subtotal.",
);
ok(
  allocation[0].amountKobo===45840000 &&
  allocation[1].amountKobo===22920000 &&
  allocation[2].amountKobo===7640000,
  "Active-student weighted branch allocation is incorrect.",
);

const rounding=allocateSessionSubtotalAcrossBranches(
  100,
  [
    {id:"a",name:"A",code:"A",isHeadquarters:true,activeStudentCount:1},
    {id:"b",name:"B",code:"B",isHeadquarters:false,activeStudentCount:1},
    {id:"c",name:"C",code:"C",isHeadquarters:false,activeStudentCount:1},
  ],
);
ok(
  rounding.reduce((sum,item)=>sum+item.amountKobo,0)===100,
  "Branch-allocation rounding must preserve the exact subtotal.",
);

ok(
  route.includes("allocateSessionSubtotalAcrossBranches") &&
  route.includes("Organization branch allocation") &&
  route.includes("they do not create additional charges"),
  "Session invoice route is missing the organization branch breakdown.",
);

ok(
  invoice.includes("lines.map") &&
  email.includes("input.lines") &&
  email.includes(".map("),
  "Printed/emailed invoices do not render the generated branch lines.",
);

console.log("M67 FINANCE UX ALIGNMENT + BRANCH INVOICE SELFTEST = GREEN");
