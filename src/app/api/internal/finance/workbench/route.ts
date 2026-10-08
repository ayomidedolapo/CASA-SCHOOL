import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";
import {
  sendFinanceInvoiceEmail,
  sendFinanceReceiptEmail,
} from "@/server/messaging/finance-email";

export const dynamic = "force-dynamic";

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

const kobo = (value: number) => Math.round(value * 100);
const today = () => new Date().toISOString().slice(0, 10);
function docNumber(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const invoiceLineSchema = z.object({
  lineKind: z.enum(["SERVICE_FEE", "REPLACEMENT_CARD", "OTHER"]),
  description: z.string().trim().min(2).max(500),
  quantity: z.number().positive().max(1000000),
  unitAmountNaira: z.number().min(0).max(100000000).optional(),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_INVOICE"),
    schoolId: z.string().uuid(),
    issuedOn: dateString.optional(),
    dueOn: dateString.optional(),
    taxRatePercent: z.number().min(0).max(100).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    lines: z.array(invoiceLineSchema).min(1).max(25),
  }),
  z.object({
    action: z.literal("ISSUE_AND_EMAIL_INVOICE"),
    invoiceId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("RESEND_INVOICE_EMAIL"),
    invoiceId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("RESEND_RECEIPT_EMAIL"),
    paymentId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("RECORD_PAYMENT"),
    invoiceId: z.string().uuid(),
    amountNaira: z.number().positive().max(1000000000),
    receivedOn: dateString,
    paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "CARD", "OTHER"]),
    paymentReference: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("CREATE_EXPENSE"),
    vendor: z.string().trim().min(2).max(240),
    category: z.string().trim().min(2).max(80),
    description: z.string().trim().min(2).max(2000),
    amountNaira: z.number().positive().max(1000000000),
    taxNaira: z.number().min(0).max(1000000000).default(0),
    paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "CARD", "OTHER"]),
    paymentReference: z.string().trim().max(160).nullable().optional(),
    incurredOn: dateString,
    schoolId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("CREATE_RECURRING_EXPENSE"),
    name: z.string().trim().min(2).max(200),
    vendor: z.string().trim().min(2).max(240),
    category: z.string().trim().min(2).max(80),
    amountNaira: z.number().positive().max(1000000000),
    cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
    nextDueOn: dateString,
    schoolId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
]);

async function getInvoice(invoiceId: string) {
  const db = getDb();
  const invoice = rowsOf<{
    id: string; school_id: string; school_name: string; invoice_number: string;
    status: string; bill_to_name: string; bill_to_contact_name: string | null;
    bill_to_email: string | null; bill_to_phone: string | null;
    subtotal_kobo: string | number; tax_label: string; tax_rate_bps: number;
    tax_kobo: string | number; total_kobo: string | number;
    issued_on: string | null; due_on: string | null; notes: string | null;
  }>(await db.execute(sql`
    select i.id,i.school_id,s.name as school_name,i.invoice_number,i.status,
      i.bill_to_name,i.bill_to_contact_name,i.bill_to_email,i.bill_to_phone,
      i.subtotal_kobo,i.tax_label,i.tax_rate_bps,i.tax_kobo,i.total_kobo,
      i.issued_on::text as issued_on,i.due_on::text as due_on,i.notes
    from casa_finance_invoices i
    join schools s on s.id=i.school_id
    where i.id=${invoiceId}::uuid limit 1
  `))[0];
  if (!invoice) return null;

  const lines = rowsOf<{
    id: string; line_kind: string; description: string; quantity: string | number;
    unit_amount_kobo: string | number; amount_kobo: string | number;
    pricing_version_id: string | null;
  }>(await db.execute(sql`
    select id,line_kind,description,quantity,unit_amount_kobo,amount_kobo,pricing_version_id
    from casa_finance_invoice_lines where invoice_id=${invoiceId}::uuid
    order by sort_order,created_at
  `));

  const paid = rowsOf<{ paid_kobo: string | number }>(await db.execute(sql`
    select coalesce(sum(amount_kobo),0)::bigint as paid_kobo
    from casa_finance_payments where invoice_id=${invoiceId}::uuid
  `))[0];

  return { ...invoice, lines, paidKobo: Number(paid?.paid_kobo ?? 0) };
}

export async function GET() {
  try {
    await requireCasaSuperAdmin();
    const db = getDb();
    const [schools,invoices,payments,expenses,recurring,ledger,summary,schoolReport] = await Promise.all([
      db.execute(sql`
        select s.id,s.name,s.slug,
          (select count(*)::int from students st where st.school_id=s.id and st.status='ACTIVE'::student_status) as student_count,
          coalesce(profile.billing_contact_name,owner.full_name) as billing_contact_name,
          coalesce(profile.billing_email,owner.email) as billing_email,
          profile.billing_phone,coalesce(profile.default_tax_label,'VAT') as default_tax_label,
          coalesce(profile.default_tax_rate_bps,0)::int as default_tax_rate_bps,
          coalesce(profile.invoice_due_days,14)::int as invoice_due_days,
          service.id as service_pricing_version_id,coalesce(service.amount_kobo,0)::bigint as service_rate_kobo,
          replacement.id as replacement_pricing_version_id,coalesce(replacement.amount_kobo,0)::bigint as replacement_rate_kobo
        from schools s
        left join casa_school_billing_profiles profile on profile.school_id=s.id
        left join lateral (
          select u.full_name,u.email from school_memberships m
          join school_membership_roles r on r.school_id=m.school_id and r.membership_id=m.id and r.role='OWNER'
          join users u on u.id=m.user_id
          where m.school_id=s.id and m.status='ACTIVE' and u.status='ACTIVE'::user_status
          order by m.joined_at asc limit 1
        ) owner on true
        left join lateral (
          select p.id,p.amount_kobo from casa_pricing_versions p
          where p.fee_type='STANDARD_STUDENT' and p.effective_from<=now()
            and (p.effective_to is null or p.effective_to>now())
            and ((p.scope_kind='SCHOOL' and p.school_id=s.id) or p.scope_kind='GLOBAL')
          order by case when p.scope_kind='SCHOOL' then 0 else 1 end,p.effective_from desc limit 1
        ) service on true
        left join lateral (
          select p.id,p.amount_kobo from casa_pricing_versions p
          where p.fee_type='REPLACEMENT_CARD' and p.effective_from<=now()
            and (p.effective_to is null or p.effective_to>now())
            and ((p.scope_kind='SCHOOL' and p.school_id=s.id) or p.scope_kind='GLOBAL')
          order by case when p.scope_kind='SCHOOL' then 0 else 1 end,p.effective_from desc limit 1
        ) replacement on true
        where s.status='ACTIVE'::school_status order by s.name
      `),
      db.execute(sql`
        select i.id,i.school_id,s.name as school_name,i.invoice_number,i.status,
          case when i.status not in ('DRAFT','PAID','VOID') and i.due_on<current_date
            and greatest(i.total_kobo-coalesce(paid.paid_kobo,0),0)>0 then 'OVERDUE' else i.status end as display_status,
          i.bill_to_email,i.subtotal_kobo,i.tax_label,i.tax_rate_bps,i.tax_kobo,i.total_kobo,
          coalesce(paid.paid_kobo,0)::bigint as paid_kobo,
          greatest(i.total_kobo-coalesce(paid.paid_kobo,0),0)::bigint as balance_kobo,
          i.issued_on::text as issued_on,i.due_on::text as due_on,i.created_at
        from casa_finance_invoices i join schools s on s.id=i.school_id
        left join lateral (select coalesce(sum(p.amount_kobo),0)::bigint as paid_kobo from casa_finance_payments p where p.invoice_id=i.id) paid on true
        order by i.created_at desc limit 100
      `),
      db.execute(sql`
        select p.id,p.invoice_id,p.school_id,s.name as school_name,i.invoice_number,p.receipt_number,
          p.amount_kobo,p.payment_method,p.payment_reference,p.received_on::text as received_on,p.created_at
        from casa_finance_payments p join schools s on s.id=p.school_id
        join casa_finance_invoices i on i.id=p.invoice_id
        order by p.received_on desc,p.created_at desc limit 100
      `),
      db.execute(sql`
        select e.id,e.expense_number,e.vendor,e.category,e.description,e.amount_kobo,e.tax_kobo,
          e.payment_method,e.payment_reference,e.incurred_on::text as incurred_on,e.paid_on::text as paid_on,
          e.school_id,s.name as school_name,e.created_at
        from casa_finance_expenses e left join schools s on s.id=e.school_id
        order by e.incurred_on desc,e.created_at desc limit 100
      `),
      db.execute(sql`
        select r.id,r.name,r.vendor,r.category,r.amount_kobo,r.cadence,r.next_due_on::text as next_due_on,
          r.school_id,s.name as school_name,r.is_active,r.notes
        from casa_finance_recurring_expenses r left join schools s on s.id=r.school_id
        order by r.is_active desc,r.next_due_on asc,r.name limit 100
      `),
      db.execute(sql`
        select j.id as journal_entry_id,j.source_type,j.source_id,j.school_id,s.name as school_name,
          j.description,j.posted_on::text as posted_on,a.code as account_code,a.name as account_name,a.account_type,
          l.debit_kobo,l.credit_kobo,l.memo
        from casa_finance_journal_entries j join casa_finance_journal_lines l on l.journal_entry_id=j.id
        join casa_finance_ledger_accounts a on a.code=l.account_code left join schools s on s.id=j.school_id
        order by j.posted_on desc,j.created_at desc,a.code limit 250
      `),
      db.execute(sql`
        select
          coalesce((select sum(total_kobo) from casa_finance_invoices where status not in ('DRAFT','VOID')),0)::bigint as invoiced_kobo,
          coalesce((select sum(amount_kobo) from casa_finance_payments),0)::bigint as collected_kobo,
          coalesce((select sum(amount_kobo) from casa_finance_expenses),0)::bigint as expenses_kobo,
          coalesce((select sum(tax_kobo) from casa_finance_invoices where status not in ('DRAFT','VOID')),0)::bigint as tax_on_issued_kobo,
          coalesce((select sum(greatest(i.total_kobo-coalesce(paid.paid_kobo,0),0))
            from casa_finance_invoices i left join lateral (
              select coalesce(sum(p.amount_kobo),0)::bigint as paid_kobo from casa_finance_payments p where p.invoice_id=i.id
            ) paid on true where i.status not in ('DRAFT','VOID')),0)::bigint as outstanding_kobo
      `),
      db.execute(sql`
        select s.id as school_id,s.name as school_name,coalesce(inv.invoiced_kobo,0)::bigint as invoiced_kobo,
          coalesce(pay.collected_kobo,0)::bigint as collected_kobo,
          greatest(coalesce(inv.invoiced_kobo,0)-coalesce(pay.collected_kobo,0),0)::bigint as outstanding_kobo
        from schools s
        left join lateral (select coalesce(sum(i.total_kobo),0)::bigint as invoiced_kobo from casa_finance_invoices i where i.school_id=s.id and i.status not in ('DRAFT','VOID')) inv on true
        left join lateral (select coalesce(sum(p.amount_kobo),0)::bigint as collected_kobo from casa_finance_payments p where p.school_id=s.id) pay on true
        where s.status='ACTIVE'::school_status order by s.name
      `),
    ]);

    const summaryRow = rowsOf<Record<string,string|number>>(summary)[0] ?? {};
    const collectedKobo = Number(summaryRow.collected_kobo ?? 0);
    const expensesKobo = Number(summaryRow.expenses_kobo ?? 0);

    return NextResponse.json({
      schools: rowsOf(schools), invoices: rowsOf(invoices), payments: rowsOf(payments), expenses: rowsOf(expenses),
      recurringExpenses: rowsOf(recurring), ledger: rowsOf(ledger), schoolReport: rowsOf(schoolReport),
      summary: {
        invoicedKobo: Number(summaryRow.invoiced_kobo ?? 0), collectedKobo, expensesKobo,
        outstandingKobo: Number(summaryRow.outstanding_kobo ?? 0),
        taxOnIssuedKobo: Number(summaryRow.tax_on_issued_kobo ?? 0), netCashflowKobo: collectedKobo-expensesKobo,
      },
    }, { headers: casaInternalNoStoreHeaders });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    console.error("CASA Finance workbench read failed", error);
    return NextResponse.json({ message: "CASA could not load Finance operations." }, { status: 500, headers: casaInternalNoStoreHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCasaSuperAdmin();
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Check the Finance operation fields.", issues: parsed.error.issues }, { status: 400, headers: casaInternalNoStoreHeaders });

    const input = parsed.data;
    const db = getDb();
    const client = neon(getDatabaseUrl());

    if (input.action === "CREATE_INVOICE") {
      const school = rowsOf<{
        id:string; name:string; billing_contact_name:string|null; billing_email:string|null; billing_phone:string|null;
        default_tax_label:string; default_tax_rate_bps:number; invoice_due_days:number;
      }>(await db.execute(sql`
        select s.id,s.name,coalesce(profile.billing_contact_name,owner.full_name) as billing_contact_name,
          coalesce(profile.billing_email,owner.email) as billing_email,profile.billing_phone,
          coalesce(profile.default_tax_label,'VAT') as default_tax_label,
          coalesce(profile.default_tax_rate_bps,0)::int as default_tax_rate_bps,
          coalesce(profile.invoice_due_days,14)::int as invoice_due_days
        from schools s left join casa_school_billing_profiles profile on profile.school_id=s.id
        left join lateral (
          select u.full_name,u.email from school_memberships m
          join school_membership_roles r on r.school_id=m.school_id and r.membership_id=m.id and r.role='OWNER'
          join users u on u.id=m.user_id where m.school_id=s.id and m.status='ACTIVE' and u.status='ACTIVE'::user_status
          order by m.joined_at asc limit 1
        ) owner on true
        where s.id=${input.schoolId}::uuid and s.status='ACTIVE'::school_status limit 1
      `))[0];
      if (!school) return NextResponse.json({ message: "The selected school is not available." }, { status: 404, headers: casaInternalNoStoreHeaders });

      const issuedOn = input.issuedOn ?? today();
      const dueOn = input.dueOn ?? new Date(new Date(`${issuedOn}T00:00:00Z`).getTime()+school.invoice_due_days*86400000).toISOString().slice(0,10);
      if (dueOn < issuedOn) return NextResponse.json({ message: "Invoice due date cannot be before the issue date." }, { status: 400, headers: casaInternalNoStoreHeaders });

      const invoiceBranches = rowsOf<{
        id:string; name:string; code:string; is_headquarters:boolean; student_count:number;
      }>(await db.execute(sql`
        select
          branch.id,
          branch.name,
          branch.code,
          branch.is_headquarters,
          count(student.id)::int as student_count
        from school_branches branch
        left join students student
          on student.school_id=branch.school_id
         and student.home_branch_id=branch.id
         and student.status='ACTIVE'::student_status
        where branch.school_id=${input.schoolId}::uuid
          and branch.status='ACTIVE'
        group by branch.id,branch.name,branch.code,branch.is_headquarters
        order by branch.is_headquarters desc,branch.name
      `));

      const activeStudentCount = Number(
        rowsOf<{student_count:number}>(await db.execute(sql`
          select count(*)::int as student_count
          from students
          where school_id=${input.schoolId}::uuid
            and status='ACTIVE'::student_status
        `))[0]?.student_count ?? 0,
      );

      const resolvedLines: Array<{id:string;lineKind:"SERVICE_FEE"|"REPLACEMENT_CARD"|"OTHER";description:string;quantity:number;unitAmountKobo:number;amountKobo:number;pricingVersionId:string|null;sortOrder:number}> = [];
      let sortOrder=0;

      for (const line of input.lines) {
        if (line.lineKind === "SERVICE_FEE" && invoiceBranches.length > 0) {
          let assignedStudents=0;

          for (const branch of invoiceBranches) {
            const branchStudents=Number(branch.student_count);
            assignedStudents+=branchStudents;
            if (branchStudents <= 0) continue;

            const price = rowsOf<{id:string;amount_kobo:string|number}>(await db.execute(sql`
              select p.id,p.amount_kobo
              from casa_pricing_versions p
              where p.fee_type='STANDARD_STUDENT'
                and p.effective_from<=${issuedOn}::date
                and (p.effective_to is null or p.effective_to>${issuedOn}::date)
                and (
                  (p.scope_kind='BRANCH' and p.branch_id=${branch.id}::uuid)
                  or (p.scope_kind='SCHOOL' and p.school_id=${input.schoolId}::uuid)
                  or p.scope_kind='GLOBAL'
                )
              order by
                case
                  when p.scope_kind='BRANCH' then 0
                  when p.scope_kind='SCHOOL' then 1
                  else 2
                end,
                p.effective_from desc
              limit 1
            `))[0];

            if (!price) {
              return NextResponse.json(
                { message: `Set a CASA service price for ${branch.name} before drafting the organization invoice.` },
                { status:409,headers:casaInternalNoStoreHeaders },
              );
            }

            const unitAmountKobo=Number(price.amount_kobo);
            resolvedLines.push({
              id:randomUUID(),
              lineKind:"SERVICE_FEE",
              description:`CASA service fee - ${branch.name} (${branch.code})`,
              quantity:branchStudents,
              unitAmountKobo,
              amountKobo:Math.round(branchStudents*unitAmountKobo),
              pricingVersionId:price.id,
              sortOrder:sortOrder++,
            });
          }

          const unassignedStudents=Math.max(activeStudentCount-assignedStudents,0);

          if (unassignedStudents > 0) {
            const price = rowsOf<{id:string;amount_kobo:string|number}>(await db.execute(sql`
              select p.id,p.amount_kobo
              from casa_pricing_versions p
              where p.fee_type='STANDARD_STUDENT'
                and p.effective_from<=${issuedOn}::date
                and (p.effective_to is null or p.effective_to>${issuedOn}::date)
                and (
                  (p.scope_kind='SCHOOL' and p.school_id=${input.schoolId}::uuid)
                  or p.scope_kind='GLOBAL'
                )
              order by
                case when p.scope_kind='SCHOOL' then 0 else 1 end,
                p.effective_from desc
              limit 1
            `))[0];

            if (!price) {
              return NextResponse.json(
                { message:"Set a CASA service price for this school before drafting the organization invoice." },
                { status:409,headers:casaInternalNoStoreHeaders },
              );
            }

            const unitAmountKobo=Number(price.amount_kobo);
            resolvedLines.push({
              id:randomUUID(),
              lineKind:"SERVICE_FEE",
              description:"CASA service fee - Students not assigned to an active branch",
              quantity:unassignedStudents,
              unitAmountKobo,
              amountKobo:Math.round(unassignedStudents*unitAmountKobo),
              pricingVersionId:price.id,
              sortOrder:sortOrder++,
            });
          }

          continue;
        }

        let unitAmountKobo:number;
        let pricingVersionId:string|null=null;

        if (line.lineKind === "SERVICE_FEE" || line.lineKind === "REPLACEMENT_CARD") {
          const feeType = line.lineKind === "SERVICE_FEE" ? "STANDARD_STUDENT" : "REPLACEMENT_CARD";
          const price = rowsOf<{id:string;amount_kobo:string|number}>(await db.execute(sql`
            select p.id,p.amount_kobo from casa_pricing_versions p
            where p.fee_type=${feeType} and p.effective_from<=${issuedOn}::date
              and (p.effective_to is null or p.effective_to>${issuedOn}::date)
              and ((p.scope_kind='SCHOOL' and p.school_id=${input.schoolId}::uuid) or p.scope_kind='GLOBAL')
            order by case when p.scope_kind='SCHOOL' then 0 else 1 end,p.effective_from desc limit 1
          `))[0];

          if (!price) {
            return NextResponse.json(
              { message: line.lineKind === "SERVICE_FEE" ? "Set a CASA service price for this school before drafting the invoice." : "Set a replacement-card price before adding that invoice line." },
              { status:409,headers:casaInternalNoStoreHeaders },
            );
          }

          unitAmountKobo=Number(price.amount_kobo);
          pricingVersionId=price.id;
        } else {
          if (line.unitAmountNaira === undefined) {
            return NextResponse.json(
              { message:"Other invoice lines require a unit amount." },
              { status:400,headers:casaInternalNoStoreHeaders },
            );
          }
          unitAmountKobo=kobo(line.unitAmountNaira);
        }

        resolvedLines.push({
          id:randomUUID(),
          lineKind:line.lineKind,
          description:line.description,
          quantity:line.quantity,
          unitAmountKobo,
          amountKobo:Math.round(line.quantity*unitAmountKobo),
          pricingVersionId,
          sortOrder:sortOrder++,
        });
      }

      if (resolvedLines.length === 0) {
        return NextResponse.json(
          { message:"The organization has no billable active students or invoice items." },
          { status:409,headers:casaInternalNoStoreHeaders },
        );
      }

      const subtotalKobo = resolvedLines.reduce((sum,line)=>sum+line.amountKobo,0);
      const taxRateBps = input.taxRatePercent === undefined ? school.default_tax_rate_bps : Math.round(input.taxRatePercent*100);
      const taxKobo = Math.round(subtotalKobo*taxRateBps/10000); const totalKobo=subtotalKobo+taxKobo;
      const invoiceId=randomUUID(); const invoiceNumber=docNumber("CASA-INV");
      const statements=[client`
        insert into casa_finance_invoices (id,school_id,invoice_number,status,bill_to_name,bill_to_contact_name,bill_to_email,bill_to_phone,subtotal_kobo,tax_label,tax_rate_bps,tax_kobo,total_kobo,issued_on,due_on,notes,created_by_internal_membership_id)
        values (${invoiceId}::uuid,${input.schoolId}::uuid,${invoiceNumber},'DRAFT',${school.name},${school.billing_contact_name},${school.billing_email},${school.billing_phone},${subtotalKobo},${school.default_tax_label},${taxRateBps},${taxKobo},${totalKobo},${issuedOn}::date,${dueOn}::date,${input.notes?.trim()||null},${access.membership.id}::uuid)
      `];
      for (const line of resolvedLines) statements.push(client`
        insert into casa_finance_invoice_lines (id,invoice_id,line_kind,description,quantity,unit_amount_kobo,amount_kobo,pricing_version_id,sort_order)
        values (${line.id}::uuid,${invoiceId}::uuid,${line.lineKind},${line.description},${line.quantity},${line.unitAmountKobo},${line.amountKobo},${line.pricingVersionId}::uuid,${line.sortOrder})
      `);
      await client.transaction(statements);
      await writeCasaInternalAudit({ access, schoolId:input.schoolId, action:"FINANCE_INVOICE_DRAFTED", subjectType:"FINANCE_INVOICE", subjectId:invoiceId, metadata:{invoiceNumber,subtotalKobo,taxKobo,totalKobo,lineCount:resolvedLines.length} });
      return NextResponse.json({created:true,invoiceId,invoiceNumber},{status:201,headers:casaInternalNoStoreHeaders});
    }

    if (input.action === "ISSUE_AND_EMAIL_INVOICE") {
      const invoice=await getInvoice(input.invoiceId);
      if (!invoice) return NextResponse.json({message:"Invoice not found."},{status:404,headers:casaInternalNoStoreHeaders});
      if (invoice.status === "VOID") return NextResponse.json({message:"A void invoice cannot be issued."},{status:409,headers:casaInternalNoStoreHeaders});
      if (invoice.status === "DRAFT") {
        const journalId=randomUUID(); const revenue=new Map<string,number>();
        for (const line of invoice.lines) {
          const account=line.line_kind === "SERVICE_FEE" ? "4000" : line.line_kind === "REPLACEMENT_CARD" ? "4010" : "4090";
          revenue.set(account,(revenue.get(account)??0)+Number(line.amount_kobo));
        }
        const statements=[
          client`update casa_finance_invoices set status='ISSUED',issued_at=now(),issued_on=coalesce(issued_on,current_date),updated_at=now() where id=${invoice.id}::uuid and status='DRAFT'`,
          client`insert into casa_finance_journal_entries (id,source_type,source_id,school_id,description,posted_on,created_by_internal_membership_id) values (${journalId}::uuid,'INVOICE_ISSUED',${invoice.id}::uuid,${invoice.school_id}::uuid,${`Invoice ${invoice.invoice_number} issued`},${invoice.issued_on??today()}::date,${access.membership.id}::uuid) on conflict (source_type,source_id) do nothing`,
          client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) select ${journalId}::uuid,'1100',${Number(invoice.total_kobo)},0,${`Accounts receivable - ${invoice.invoice_number}`} where exists (select 1 from casa_finance_journal_entries where id=${journalId}::uuid)`,
        ];
        for (const [accountCode,amount] of revenue.entries()) statements.push(client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) select ${journalId}::uuid,${accountCode},0,${amount},${`Revenue - ${invoice.invoice_number}`} where exists (select 1 from casa_finance_journal_entries where id=${journalId}::uuid)`);
        if (Number(invoice.tax_kobo)>0) statements.push(client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) select ${journalId}::uuid,'2000',0,${Number(invoice.tax_kobo)},${`${invoice.tax_label} - ${invoice.invoice_number}`} where exists (select 1 from casa_finance_journal_entries where id=${journalId}::uuid)`);
        await client.transaction(statements);
      }

      let delivery:"SENT"|"NO_EMAIL"|"NOT_CONFIGURED"|"FAILED"="NO_EMAIL";
      let emailErrorCode:string|null=null;
      if (invoice.bill_to_email) {
        const result=await sendFinanceInvoiceEmail({to:invoice.bill_to_email,schoolName:invoice.school_name,invoiceNumber:invoice.invoice_number,issuedOn:invoice.issued_on??today(),dueOn:invoice.due_on,
          lines:invoice.lines.map(line=>({description:line.description,quantity:Number(line.quantity),amountKobo:Number(line.amount_kobo)})),subtotalKobo:Number(invoice.subtotal_kobo),taxLabel:invoice.tax_label,taxRatePercent:Number(invoice.tax_rate_bps)/100,taxKobo:Number(invoice.tax_kobo),totalKobo:Number(invoice.total_kobo),notes:invoice.notes});
        if (result.ok) { delivery="SENT"; await db.execute(sql`update casa_finance_invoices set sent_at=now(),updated_at=now() where id=${invoice.id}::uuid`); }
        else {
          delivery=result.configured?"FAILED":"NOT_CONFIGURED";
          emailErrorCode=result.code;
        }
        await db.execute(sql`insert into casa_finance_email_deliveries (school_id,invoice_id,delivery_kind,recipient_email,provider_message_id,status,error_code,sent_at) values (${invoice.school_id}::uuid,${invoice.id}::uuid,'INVOICE',${invoice.bill_to_email},${result.ok?result.messageId:null},${result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED"},${result.ok?null:result.code},${result.ok?new Date().toISOString():null}::timestamptz)`);
      }
      await writeCasaInternalAudit({access,schoolId:invoice.school_id,action:"FINANCE_INVOICE_ISSUED",subjectType:"FINANCE_INVOICE",subjectId:invoice.id,metadata:{invoiceNumber:invoice.invoice_number,emailDelivery:delivery}});
      return NextResponse.json({issued:true,emailDelivery:delivery,emailErrorCode},{headers:casaInternalNoStoreHeaders});
    }

    if (input.action === "RESEND_INVOICE_EMAIL") {
      const invoice=await getInvoice(input.invoiceId);
      if (!invoice) return NextResponse.json({message:"Invoice not found."},{status:404,headers:casaInternalNoStoreHeaders});
      if (invoice.status === "DRAFT") return NextResponse.json({message:"Issue the draft invoice before resending it."},{status:409,headers:casaInternalNoStoreHeaders});
      if (invoice.status === "VOID") return NextResponse.json({message:"A void invoice cannot be emailed."},{status:409,headers:casaInternalNoStoreHeaders});

      let emailDelivery:"SENT"|"NO_EMAIL"|"NOT_CONFIGURED"|"FAILED"="NO_EMAIL";
      let emailErrorCode:string|null=null;

      if (invoice.bill_to_email) {
        const result=await sendFinanceInvoiceEmail({
          to:invoice.bill_to_email,
          schoolName:invoice.school_name,
          invoiceNumber:invoice.invoice_number,
          issuedOn:invoice.issued_on??today(),
          dueOn:invoice.due_on,
          lines:invoice.lines.map(line=>({
            description:line.description,
            quantity:Number(line.quantity),
            amountKobo:Number(line.amount_kobo),
          })),
          subtotalKobo:Number(invoice.subtotal_kobo),
          taxLabel:invoice.tax_label,
          taxRatePercent:Number(invoice.tax_rate_bps)/100,
          taxKobo:Number(invoice.tax_kobo),
          totalKobo:Number(invoice.total_kobo),
          notes:invoice.notes,
        });

        emailDelivery=result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED";
        if (!result.ok) emailErrorCode=result.code;

        if (result.ok) {
          await db.execute(sql`update casa_finance_invoices set sent_at=now(),updated_at=now() where id=${invoice.id}::uuid`);
        }

        await db.execute(sql`
          insert into casa_finance_email_deliveries (
            school_id,invoice_id,delivery_kind,recipient_email,
            provider_message_id,status,error_code,sent_at
          )
          values (
            ${invoice.school_id}::uuid,${invoice.id}::uuid,'INVOICE',
            ${invoice.bill_to_email},${result.ok?result.messageId:null},
            ${result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED"},
            ${result.ok?null:result.code},
            ${result.ok?new Date().toISOString():null}::timestamptz
          )
        `);
      }

      await writeCasaInternalAudit({
        access,
        schoolId:invoice.school_id,
        action:"FINANCE_INVOICE_REEMAILED",
        subjectType:"FINANCE_INVOICE",
        subjectId:invoice.id,
        metadata:{
          invoiceNumber:invoice.invoice_number,
          emailDelivery,
          emailErrorCode,
        },
      });

      return NextResponse.json({
        resent:true,
        emailDelivery,
        emailErrorCode,
      },{headers:casaInternalNoStoreHeaders});
    }

    if (input.action === "RECORD_PAYMENT") {
      const invoice=await getInvoice(input.invoiceId);
      if (!invoice) return NextResponse.json({message:"Invoice not found."},{status:404,headers:casaInternalNoStoreHeaders});
      if (invoice.status === "DRAFT" || invoice.status === "VOID") return NextResponse.json({message:"Issue the invoice before recording payment."},{status:409,headers:casaInternalNoStoreHeaders});
      const amountKobo=kobo(input.amountNaira); const totalKobo=Number(invoice.total_kobo); const balanceBefore=Math.max(totalKobo-invoice.paidKobo,0);
      if (amountKobo>balanceBefore) return NextResponse.json({message:"Payment cannot be greater than the remaining invoice balance."},{status:400,headers:casaInternalNoStoreHeaders});
      const balanceAfter=balanceBefore-amountKobo; const paymentId=randomUUID(); const journalId=randomUUID(); const receiptNumber=docNumber("CASA-RCT");
      await client.transaction([
        client`insert into casa_finance_payments (id,invoice_id,school_id,receipt_number,amount_kobo,payment_method,payment_reference,received_on,notes,created_by_internal_membership_id) values (${paymentId}::uuid,${invoice.id}::uuid,${invoice.school_id}::uuid,${receiptNumber},${amountKobo},${input.paymentMethod},${input.paymentReference?.trim()||null},${input.receivedOn}::date,${input.notes?.trim()||null},${access.membership.id}::uuid)`,
        client`insert into casa_finance_journal_entries (id,source_type,source_id,school_id,description,posted_on,created_by_internal_membership_id) values (${journalId}::uuid,'PAYMENT_RECEIVED',${paymentId}::uuid,${invoice.school_id}::uuid,${`Payment ${receiptNumber} received`},${input.receivedOn}::date,${access.membership.id}::uuid)`,
        client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) values (${journalId}::uuid,'1000',${amountKobo},0,${`Cash received - ${receiptNumber}`})`,
        client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) values (${journalId}::uuid,'1100',0,${amountKobo},${`Accounts receivable settled - ${invoice.invoice_number}`})`,
        client`update casa_finance_invoices set status=${balanceAfter===0?"PAID":"PARTIALLY_PAID"},paid_at=${balanceAfter===0?new Date().toISOString():null}::timestamptz,updated_at=now() where id=${invoice.id}::uuid`,
      ]);

      let emailDelivery:"SENT"|"NO_EMAIL"|"NOT_CONFIGURED"|"FAILED"="NO_EMAIL";
      let emailErrorCode:string|null=null;
      if (invoice.bill_to_email) {
        const result=await sendFinanceReceiptEmail({to:invoice.bill_to_email,schoolName:invoice.school_name,invoiceNumber:invoice.invoice_number,receiptNumber,amountKobo,receivedOn:input.receivedOn,paymentMethod:input.paymentMethod,paymentReference:input.paymentReference?.trim()||null,remainingBalanceKobo:balanceAfter});
        emailDelivery=result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED";
        if (!result.ok) emailErrorCode=result.code;
        await db.execute(sql`insert into casa_finance_email_deliveries (school_id,invoice_id,delivery_kind,recipient_email,provider_message_id,status,error_code,sent_at) values (${invoice.school_id}::uuid,${invoice.id}::uuid,'RECEIPT',${invoice.bill_to_email},${result.ok?result.messageId:null},${result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED"},${result.ok?null:result.code},${result.ok?new Date().toISOString():null}::timestamptz)`);
      }
      await writeCasaInternalAudit({access,schoolId:invoice.school_id,action:"FINANCE_PAYMENT_RECORDED",subjectType:"FINANCE_PAYMENT",subjectId:paymentId,metadata:{invoiceId:invoice.id,invoiceNumber:invoice.invoice_number,receiptNumber,amountKobo,balanceAfter,emailDelivery}});
      return NextResponse.json({recorded:true,paymentId,receiptNumber,balanceAfterKobo:balanceAfter,emailDelivery,emailErrorCode},{status:201,headers:casaInternalNoStoreHeaders});
    }

    if (input.action === "RESEND_RECEIPT_EMAIL") {
      const payment=rowsOf<{
        id:string;
        invoice_id:string;
        school_id:string;
        school_name:string;
        invoice_number:string;
        bill_to_email:string|null;
        receipt_number:string;
        amount_kobo:string|number;
        payment_method:string;
        payment_reference:string|null;
        received_on:string;
        total_kobo:string|number;
        paid_through_kobo:string|number;
      }>(await db.execute(sql`
        select
          p.id,p.invoice_id,p.school_id,s.name as school_name,
          i.invoice_number,i.bill_to_email,p.receipt_number,p.amount_kobo,
          p.payment_method,p.payment_reference,p.received_on::text as received_on,
          i.total_kobo,
          (
            select coalesce(sum(previous.amount_kobo),0)::bigint
            from casa_finance_payments previous
            where previous.invoice_id=p.invoice_id
              and previous.created_at<=p.created_at
          ) as paid_through_kobo
        from casa_finance_payments p
        join casa_finance_invoices i on i.id=p.invoice_id
        join schools s on s.id=p.school_id
        where p.id=${input.paymentId}::uuid
        limit 1
      `))[0];

      if (!payment) return NextResponse.json({message:"Receipt not found."},{status:404,headers:casaInternalNoStoreHeaders});

      const remainingBalanceKobo=Math.max(
        Number(payment.total_kobo)-Number(payment.paid_through_kobo),
        0,
      );

      let emailDelivery:"SENT"|"NO_EMAIL"|"NOT_CONFIGURED"|"FAILED"="NO_EMAIL";
      let emailErrorCode:string|null=null;

      if (payment.bill_to_email) {
        const result=await sendFinanceReceiptEmail({
          to:payment.bill_to_email,
          schoolName:payment.school_name,
          invoiceNumber:payment.invoice_number,
          receiptNumber:payment.receipt_number,
          amountKobo:Number(payment.amount_kobo),
          receivedOn:payment.received_on,
          paymentMethod:payment.payment_method,
          paymentReference:payment.payment_reference,
          remainingBalanceKobo,
        });

        emailDelivery=result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED";
        if (!result.ok) emailErrorCode=result.code;

        await db.execute(sql`
          insert into casa_finance_email_deliveries (
            school_id,invoice_id,delivery_kind,recipient_email,
            provider_message_id,status,error_code,sent_at
          )
          values (
            ${payment.school_id}::uuid,${payment.invoice_id}::uuid,'RECEIPT',
            ${payment.bill_to_email},${result.ok?result.messageId:null},
            ${result.ok?"SENT":result.configured?"FAILED":"NOT_CONFIGURED"},
            ${result.ok?null:result.code},
            ${result.ok?new Date().toISOString():null}::timestamptz
          )
        `);
      }

      await writeCasaInternalAudit({
        access,
        schoolId:payment.school_id,
        action:"FINANCE_RECEIPT_REEMAILED",
        subjectType:"FINANCE_PAYMENT",
        subjectId:payment.id,
        metadata:{
          invoiceId:payment.invoice_id,
          invoiceNumber:payment.invoice_number,
          receiptNumber:payment.receipt_number,
          emailDelivery,
          emailErrorCode,
        },
      });

      return NextResponse.json({
        resent:true,
        receiptNumber:payment.receipt_number,
        emailDelivery,
        emailErrorCode,
      },{headers:casaInternalNoStoreHeaders});
    }

    if (input.action === "CREATE_EXPENSE") {
      const amountKobo=kobo(input.amountNaira); const taxKobo=kobo(input.taxNaira);
      if (taxKobo>amountKobo) return NextResponse.json({message:"Expense tax cannot exceed the total expense amount."},{status:400,headers:casaInternalNoStoreHeaders});
      const expenseId=randomUUID(); const journalId=randomUUID(); const expenseNumber=docNumber("CASA-EXP");
      await client.transaction([
        client`insert into casa_finance_expenses (id,expense_number,vendor,category,description,amount_kobo,tax_kobo,payment_method,payment_reference,incurred_on,paid_on,school_id,notes,created_by_internal_membership_id) values (${expenseId}::uuid,${expenseNumber},${input.vendor},${input.category},${input.description},${amountKobo},${taxKobo},${input.paymentMethod},${input.paymentReference?.trim()||null},${input.incurredOn}::date,${input.incurredOn}::date,${input.schoolId??null}::uuid,${input.notes?.trim()||null},${access.membership.id}::uuid)`,
        client`insert into casa_finance_journal_entries (id,source_type,source_id,school_id,description,posted_on,created_by_internal_membership_id) values (${journalId}::uuid,'EXPENSE_RECORDED',${expenseId}::uuid,${input.schoolId??null}::uuid,${`${input.vendor} - ${input.description}`},${input.incurredOn}::date,${access.membership.id}::uuid)`,
        client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) values (${journalId}::uuid,'5000',${amountKobo},0,${`Operating expense - ${expenseNumber}`})`,
        client`insert into casa_finance_journal_lines (journal_entry_id,account_code,debit_kobo,credit_kobo,memo) values (${journalId}::uuid,'1000',0,${amountKobo},${`Cash paid - ${expenseNumber}`})`,
      ]);
      await writeCasaInternalAudit({access,schoolId:input.schoolId??null,action:"FINANCE_EXPENSE_RECORDED",subjectType:"FINANCE_EXPENSE",subjectId:expenseId,metadata:{expenseNumber,amountKobo,taxKobo,category:input.category,vendor:input.vendor}});
      return NextResponse.json({created:true,expenseId,expenseNumber},{status:201,headers:casaInternalNoStoreHeaders});
    }

    const recurringId=randomUUID();
    await db.execute(sql`insert into casa_finance_recurring_expenses (id,name,vendor,category,amount_kobo,cadence,next_due_on,school_id,notes,created_by_internal_membership_id) values (${recurringId}::uuid,${input.name},${input.vendor},${input.category},${kobo(input.amountNaira)},${input.cadence},${input.nextDueOn}::date,${input.schoolId??null}::uuid,${input.notes?.trim()||null},${access.membership.id}::uuid)`);
    await writeCasaInternalAudit({access,schoolId:input.schoolId??null,action:"FINANCE_RECURRING_EXPENSE_CREATED",subjectType:"FINANCE_RECURRING_EXPENSE",subjectId:recurringId,metadata:{name:input.name,vendor:input.vendor,cadence:input.cadence,amountKobo:kobo(input.amountNaira),nextDueOn:input.nextDueOn}});
    return NextResponse.json({created:true,recurringExpenseId:recurringId},{status:201,headers:casaInternalNoStoreHeaders});
  } catch (error) {
    const response=casaInternalAuthErrorResponse(error); if (response) return response;
    console.error("CASA Finance operation failed",error);
    return NextResponse.json({message:"CASA could not complete the Finance operation."},{status:500,headers:casaInternalNoStoreHeaders});
  }
}
