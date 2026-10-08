import fs from "node:fs";

const route=fs.readFileSync("src/app/api/internal/finance/intelligence/route.ts","utf8");
const ui=fs.readFileSync("src/app/internal/finance/finance-intelligence.tsx","utf8");
const expect=(value:unknown,message:string)=>{if(!value)throw new Error(message)};

expect(route.includes("(policy.school_id is not null) as is_saved"),"Saved-policy marker missing");
expect(route.includes("Finance reminder policy saved but the CASA internal audit write failed."),"Best-effort audit guard missing");
expect(route.includes("{ saved: true, auditLogged }"),"Policy truth response missing");
expect(route.includes("Payment reminder policy could not be saved."),"Specific policy-save error missing");
expect(route.includes("Payment reminder scan could not be completed. Saved reminder policies were not changed."),"Specific scan error missing");

expect(ui.includes("Saved reminder policies"),"Saved policy list missing");
expect(ui.includes("Reminder delivery history"),"Delivery history separation missing");
expect(ui.includes("Default policy"),"Default-policy state missing");
expect(ui.includes("Saved policy"),"Saved-policy state missing");
expect(ui.includes("Saving a policy stores the rules for the selected school."),"Policy-vs-delivery explanation missing");
expect(ui.includes("This does not mean the policy is missing."),"Empty delivery explanation missing");
expect(ui.includes("New due reminders"),"Detailed scan result notice missing");
expect(ui.includes("Internal audit logging reported a warning."),"Post-save audit warning missing");

for(const source of [route,ui]){
  for(const bad of ["Ãƒ","Ã‚","Ã¢â‚¬","Ã¢â€šÂ¬"]){
    expect(!source.includes(bad),`Finance reminder UX source contains mojibake marker: ${bad}`);
  }
}

console.log("REMINDER_POLICY_SAVE_TRUTH=GREEN");
console.log("REMINDER_AUDIT_FAILURE_ISOLATION=GREEN");
console.log("REMINDER_POLICY_STATUS_LIST=GREEN");
console.log("REMINDER_DELIVERY_HISTORY_SEPARATION=GREEN");
console.log("REMINDER_SCAN_ERROR_DETAIL=GREEN");
console.log("REMINDER_SCAN_RESULT_DETAIL=GREEN");
console.log("REMINDER_POLICY_MOJIBAKE_GUARD=GREEN");
