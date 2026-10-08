import fs from "node:fs";

const worker=fs.readFileSync(
  "src/server/messaging/finance-reminder-worker.ts",
  "utf8",
);

const expect=(value:unknown,message:string)=>{
  if(!value)throw new Error(message);
};

expect(
  worker.includes("left join lateral"),
  "Reminder worker no longer contains the expected LEFT JOIN LATERAL.",
);

expect(
  worker.includes("for update of reminder skip locked"),
  "Reminder worker must lock only reminder rows.",
);

expect(
  !worker.includes("for update skip locked"),
  "Broad FOR UPDATE remains and can lock the nullable outer-join side.",
);

expect(
  worker.includes("where reminder.status in ('PENDING','RETRY')"),
  "Pending/retry claim guard changed unexpectedly.",
);

expect(
  worker.includes("limit ${limit}"),
  "Worker claim limit changed unexpectedly.",
);

for(const bad of ["Ãƒ","Ã‚","Ã¢â‚¬","Ã¢â€šÂ¬"]){
  expect(!worker.includes(bad),`Mojibake marker found: ${bad}`);
}

console.log("REMINDER_WORKER_OUTER_JOIN_LOCK_FIX=GREEN");
console.log("REMINDER_ROW_LOCK_SCOPE=GREEN");
console.log("REMINDER_SKIP_LOCKED=GREEN");
console.log("REMINDER_CLAIM_GUARDS=PRESERVED");
console.log("REMINDER_WORKER_MOJIBAKE_GUARD=GREEN");
