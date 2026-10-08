import fs from "node:fs";

const route=fs.readFileSync("src/app/api/internal/finance/workbench/route.ts","utf8");
const ui=fs.readFileSync("src/app/internal/finance/finance-workbench.tsx","utf8");
const expect=(value:unknown,message:string)=>{if(!value)throw new Error(message)};

expect(route.includes("budgetCategoryOptions"),"category options missing");
expect(route.includes("from casa_finance_budget_lines line"),"budget-line source missing");
expect(route.includes("where budget.status='ACTIVE'"),"active budget filter missing");

expect(ui.includes('list="casa-expense-budget-categories"'),"expense picker missing");
expect(ui.includes('list="casa-subscription-budget-categories"'),"subscription picker missing");
expect(ui.includes("item.starts_on<=dateValue&&dateValue<=item.ends_on"),"date scope missing");
expect(ui.includes("item.school_id===null||item.school_id===schoolId"),"school/CASA scope missing");
expect(ui.includes("canonicalBudgetCategory"),"canonical match missing");
expect(ui.includes("type a new category for unbudgeted spend"),"free-type guidance missing");
expect(ui.includes("Recurring obligations do not become budget actuals until an expense is recorded."),"subscription accounting guidance missing");

for(const source of [route,ui]){
  for(const bad of ["Ãƒ","Ã‚","Ã¢â‚¬","Ã¢â€šÂ¬"]){
    expect(!source.includes(bad),`mojibake: ${bad}`);
  }
}

console.log("EXPENSE_BUDGET_CATEGORY_PICKER=GREEN");
console.log("SUBSCRIPTION_BUDGET_CATEGORY_PICKER=GREEN");
console.log("CATEGORY_FREE_TYPING=GREEN");
console.log("CATEGORY_DATE_SCOPE=GREEN");
console.log("CATEGORY_SCHOOL_SCOPE=GREEN");
console.log("CATEGORY_CANONICAL_MATCH=GREEN");
console.log("FINANCE_CATEGORY_PICKER_MOJIBAKE_GUARD=GREEN");
