import fs from "node:fs";

const api=fs.readFileSync(
  "src/app/api/internal/finance/billing-profile/route.ts",
  "utf8",
);
const ui=fs.readFileSync(
  "src/app/internal/finance/negotiated-pricing-panel.tsx",
  "utf8",
);

const expect=(value:unknown,message:string)=>{
  if(!value)throw new Error(message);
};

expect(
  api.includes("(profile.school_id is not null) as has_billing_profile"),
  "Saved billing-profile marker is missing.",
);
expect(
  api.includes('billingContactName: school.billing_contact_name ?? ""'),
  "Editable billing contact must contain saved dedicated data only.",
);
expect(
  api.includes('billingEmail: school.billing_email ?? ""'),
  "Editable billing email must contain saved dedicated data only.",
);
expect(
  !api.includes('school.billing_email ?? school.owner_email ?? ""'),
  "Owner fallback must not masquerade as a saved billing email.",
);
expect(
  api.includes("effectiveInvoiceEmail:"),
  "Effective invoice email is missing.",
);
expect(
  api.includes('"DEDICATED_BILLING_CONTACT"'),
  "Dedicated destination source is missing.",
);
expect(
  api.includes('"SCHOOL_OWNER_FALLBACK"'),
  "Owner fallback destination source is missing.",
);
expect(
  api.includes('"NOT_CONFIGURED"'),
  "Not-configured destination source is missing.",
);

expect(
  ui.includes("Current invoice destination"),
  "Current invoice destination card is missing.",
);
expect(
  ui.includes("Dedicated billing contact"),
  "Dedicated billing destination status is missing.",
);
expect(
  ui.includes("School Owner fallback"),
  "School Owner fallback status is missing.",
);
expect(
  ui.includes("Billing profile saved"),
  "Saved billing-profile status is missing.",
);
expect(
  ui.includes("Billing profile not yet saved"),
  "Unsaved billing-profile status is missing.",
);
expect(
  ui.includes("Dedicated billing contact name"),
  "Dedicated billing contact field label is missing.",
);
expect(
  ui.includes("Dedicated billing email"),
  "Dedicated billing email field label is missing.",
);
expect(
  ui.includes("Leave this blank to use the School Owner email as the invoice destination."),
  "Owner-fallback field guidance is missing.",
);
expect(
  ui.includes("Existing draft and issued invoices keep the destination already stored on"),
  "Invoice destination snapshot guidance is missing.",
);
expect(
  ui.includes("Invoice destination refreshed."),
  "Post-save destination refresh is missing.",
);

for(const source of [api,ui]){
  for(const bad of ["Ãƒ","Ã‚","Ã¢â‚¬","Ã¢â€šÂ¬"]){
    expect(!source.includes(bad),`Mojibake marker found: ${bad}`);
  }
}

console.log("BILLING_PROFILE_SAVED_STATE=GREEN");
console.log("OWNER_FALLBACK_TRUTH=GREEN");
console.log("DEDICATED_BILLING_DESTINATION=GREEN");
console.log("EDIT_FIELDS_SHOW_SAVED_VALUES_ONLY=GREEN");
console.log("EFFECTIVE_INVOICE_DESTINATION=GREEN");
console.log("BILLING_PROFILE_POST_SAVE_REFRESH=GREEN");
console.log("INVOICE_DESTINATION_SNAPSHOT_GUIDANCE=GREEN");
console.log("BILLING_DESTINATION_MOJIBAKE_GUARD=GREEN");
