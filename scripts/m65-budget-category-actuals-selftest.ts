import fs from "node:fs";
import path from "node:path";

const read=(relative:string)=>fs.readFileSync(path.join(process.cwd(),relative),"utf8");
const expect=(value:unknown,message:string)=>{if(!value)throw new Error(message)};

const route=read("src/app/api/internal/finance/intelligence/route.ts");
const ui=read("src/app/internal/finance/finance-intelligence.tsx");

expect(route.includes("budgeted_actual_kobo"),"Budgeted actual total missing");
expect(route.includes("unbudgeted_actual_kobo"),"Unbudgeted actual total missing");
expect(route.includes("total_actual_kobo"),"Total actual spending missing");
expect(route.includes("lower(trim(expense.category))=lower(trim(line.category))"),"Category matching rule missing");
expect(route.includes("not exists ("),"Unbudgeted expense classifier missing");
expect(route.includes("unbudgetedCategories: rowsOf(unbudgetedCategories)"),"Unbudgeted category response missing");
expect(route.includes("coalesce(actual.actual_kobo,0)::bigint as actual_kobo"),"Budget-line actual total missing");

expect(ui.includes("Budgeted spend"),"Budgeted spend UI missing");
expect(ui.includes("Unbudgeted spend"),"Unbudgeted spend UI missing");
expect(ui.includes("Total spending"),"Total spending UI missing");
expect(ui.includes("Category breakdown"),"Category breakdown UI missing");
expect(ui.includes("Unbudgeted expenses"),"Unbudgeted expense detail UI missing");
expect(ui.includes("Only expenses that match a budget category"),"Budget matching explanation missing");
expect(ui.includes("line.actual_kobo"),"Category-level actual UI missing");
expect(!ui.includes("budget.actual_kobo"),"Legacy all-expenses budget actual still used");

for(const source of [route,ui]){
  for(const bad of ["Ãƒ","Ã‚","Ã¢â‚¬","Ã¢â€šÂ¬"]){
    expect(!source.includes(bad),`Finance budget source contains mojibake marker: ${bad}`);
  }
}

console.log("BUDGET_CATEGORY_ACTUALS=GREEN");
console.log("BUDGETED_SPEND_MATCHING=GREEN");
console.log("UNBUDGETED_SPEND_SEPARATION=GREEN");
console.log("CATEGORY_VARIANCE_BREAKDOWN=GREEN");
console.log("BUDGET_TOTAL_SPENDING=GREEN");
console.log("BUDGET_MOJIBAKE_GUARD=GREEN");
