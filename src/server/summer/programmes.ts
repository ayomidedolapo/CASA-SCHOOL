import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  SchoolAccessDeniedError,
  type SchoolAccess,
} from "@/server/auth/authorization";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export type SummerAttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as {rows?:unknown}).rows)) return (result as {rows:T[]}).rows;
  return [];
}

export class SummerProgrammeError extends Error {
  constructor(message:string, public readonly status:number, public readonly code:string){ super(message); this.name="SummerProgrammeError"; }
}

export async function requireSummerBranchAccess(
  slug: string,
  branchId: string,
) {
  const visibility =
    await listVisibleBranches(
      slug,
    );
  const access =
    visibility.access;

  if (
    !access.roles.some(
      (role) =>
        role === "OWNER" ||
        role === "ADMIN" ||
        role === "SCHOOL_TECHNICIAN",
    )
  ) {
    throw new SchoolAccessDeniedError();
  }

  const branch =
    (
      visibility.branches as
        Array<{
          id: string;
          name: string;
        }>
    ).find(
      (candidate) =>
        candidate.id ===
        branchId,
    );

  if (!branch) {
    throw new SchoolAccessDeniedError();
  }

  return {
    access,
    branch,
    organizationAdmin:
      visibility.organizationAdmin,
  };
}

export async function listSummerProgrammes(access:SchoolAccess, branchId:string){
  const db=getDb();
  return rowsOf(await db.execute(sql`
    select p.*,
      (select count(*)::int from summer_participants sp where sp.programme_id=p.id and sp.status='ACTIVE') participant_count,
      (select count(*)::int from summer_programme_teachers st where st.programme_id=p.id) teacher_count
    from summer_programmes p
    where p.school_id=${access.school.id}::uuid and p.branch_id=${branchId}::uuid
    order by p.starts_on desc, p.created_at desc
  `));
}

export async function createSummerProgramme(input:{access:SchoolAccess;branchId:string;name:string;startsOn:string;endsOn:string;operatingDays:number[];checkInOpens:string;expectedArrival:string;checkInCloses:string;dismissalTime:string;checkoutCloses:string}){
  if(input.startsOn>input.endsOn) throw new SummerProgrammeError("Summer end date must be on or after the start date.",400,"SUMMER_DATES_INVALID");
  if(!(input.checkInOpens<=input.expectedArrival && input.expectedArrival<=input.checkInCloses && input.checkInCloses<input.dismissalTime && input.dismissalTime<=input.checkoutCloses)) throw new SummerProgrammeError("Check the Summer times: opening → expected arrival → check-in close → dismissal → checkout close.",400,"SUMMER_TIMES_INVALID");
  const days=[...new Set(input.operatingDays)].filter((d)=>Number.isInteger(d)&&d>=0&&d<=6);
  if(days.length===0) throw new SummerProgrammeError("Choose at least one Summer operating day.",400,"SUMMER_DAYS_REQUIRED");
  const db=getDb();
  const rows=rowsOf(await db.execute(sql`
    insert into summer_programmes (school_id,branch_id,name,starts_on,ends_on,operating_days,check_in_opens,expected_arrival,check_in_closes,dismissal_time,checkout_closes,status,created_by_membership_id)
    values (${input.access.school.id}::uuid,${input.branchId}::uuid,${input.name},${input.startsOn}::date,${input.endsOn}::date,${days}::smallint[],${input.checkInOpens}::time,${input.expectedArrival}::time,${input.checkInCloses}::time,${input.dismissalTime}::time,${input.checkoutCloses}::time,case when current_date between ${input.startsOn}::date and ${input.endsOn}::date then 'ACTIVE' else 'PLANNED' end,${input.access.membership.id}::uuid)
    returning *
  `));
  return rows[0];
}

export async function addExistingSummerParticipant(input:{access:SchoolAccess;programmeId:string;studentId:string}){
  const db=getDb();
  const rows=rowsOf(await db.execute(sql`
    insert into summer_participants (school_id,programme_id,student_id)
    select ${input.access.school.id}::uuid,p.id,s.id
    from summer_programmes p
    join students s on s.school_id=p.school_id
    where p.school_id=${input.access.school.id}::uuid
      and p.id=${input.programmeId}::uuid
      and s.id=${input.studentId}::uuid
      and s.status='ACTIVE'
      and exists (
        select 1
        from student_enrollments enrollment
        join school_branch_class_arms branch_map
          on branch_map.school_id=enrollment.school_id
         and branch_map.class_arm_id=enrollment.class_arm_id
        where enrollment.school_id=s.school_id
          and enrollment.student_id=s.id
          and enrollment.status='ACTIVE'::student_enrollment_status
          and branch_map.branch_id=p.branch_id
          and enrollment.starts_on <= current_date
          and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
      )
    on conflict (programme_id,student_id) where student_id is not null and status='ACTIVE' do nothing
    returning *
  `));
  if(!rows[0]) throw new SummerProgrammeError("Student is already registered for Summer or could not be found.",409,"SUMMER_PARTICIPANT_NOT_ADDED");
  return rows[0];
}

export async function addGuestSummerParticipant(input:{access:SchoolAccess;programmeId:string;fullName:string;sex:string|null;guardianName:string;guardianPhone:string|null;guardianEmail:string|null;notificationsEnabled:boolean}){
  const db=getDb();
  const rows=rowsOf(await db.execute(sql`
    insert into summer_participants (school_id,programme_id,guest_full_name,guest_sex,guest_guardian_name,guest_guardian_phone,guest_guardian_email,guest_notifications_enabled)
    select ${input.access.school.id}::uuid,p.id,${input.fullName},${input.sex},${input.guardianName},${input.guardianPhone},${input.guardianEmail},${input.notificationsEnabled}
    from summer_programmes p where p.school_id=${input.access.school.id}::uuid and p.id=${input.programmeId}::uuid
    returning *
  `));
  if(!rows[0]) throw new SummerProgrammeError("Summer programme could not be found.",404,"SUMMER_PROGRAMME_NOT_FOUND");
  return rows[0];
}

export async function assignSummerTeacher(input:{access:SchoolAccess;programmeId:string;membershipId:string}){
  const db=getDb();
  const rows=rowsOf(await db.execute(sql`
    insert into summer_programme_teachers (school_id,programme_id,membership_id)
    select ${input.access.school.id}::uuid,p.id,m.id
    from summer_programmes p join school_memberships m on m.school_id=p.school_id
    where p.school_id=${input.access.school.id}::uuid and p.id=${input.programmeId}::uuid and m.id=${input.membershipId}::uuid and m.status='ACTIVE'
    on conflict (programme_id,membership_id) do nothing
    returning *
  `));
  if(!rows[0]) throw new SummerProgrammeError("Teacher is already assigned or unavailable.",409,"SUMMER_TEACHER_NOT_ADDED");
  return rows[0];
}

export async function getSummerProgrammeRoster(access:SchoolAccess, programmeId:string){
  const db=getDb();
  return rowsOf(await db.execute(sql`
    select sp.id participant_id, sp.student_id,
      coalesce(concat_ws(' ',s.first_name,s.middle_name,s.last_name),sp.guest_full_name) full_name,
      (sp.student_id is null) is_guest, sp.guest_guardian_name,sp.guest_guardian_phone,sp.guest_guardian_email,sp.guest_notifications_enabled,
      sa.status attendance_status,sa.checked_in_at,sa.checked_out_at
    from summer_participants sp
    join summer_programmes p on p.id=sp.programme_id and p.school_id=sp.school_id
    left join students s on s.school_id=sp.school_id and s.id=sp.student_id
    left join summer_attendance sa on sa.programme_id=sp.programme_id and sa.participant_id=sp.id and sa.attendance_date=current_date
    where sp.school_id=${access.school.id}::uuid and sp.programme_id=${programmeId}::uuid and sp.status='ACTIVE'
    order by full_name
  `));
}

export async function markSummerAttendance(input:{access:SchoolAccess;programmeId:string;participantId:string;status:SummerAttendanceStatus;note:string|null}){
  const db=getDb();
  const result=rowsOf<{id:string;student_id:string|null;branch_id:string;participant_name:string}>(await db.execute(sql`
    with valid as (
      select sp.id,sp.student_id,p.branch_id,coalesce(concat_ws(' ',s.first_name,s.middle_name,s.last_name),sp.guest_full_name) participant_name
      from summer_participants sp join summer_programmes p on p.id=sp.programme_id and p.school_id=sp.school_id
      left join students s on s.school_id=sp.school_id and s.id=sp.student_id
      where sp.school_id=${input.access.school.id}::uuid and sp.programme_id=${input.programmeId}::uuid and sp.id=${input.participantId}::uuid and sp.status='ACTIVE'
        and current_date between p.starts_on and p.ends_on and extract(dow from current_date)::int=any(p.operating_days)
    ), upserted as (
      insert into summer_attendance (school_id,programme_id,participant_id,attendance_date,status,checked_in_at,marked_by_membership_id,note)
      select ${input.access.school.id}::uuid,${input.programmeId}::uuid,valid.id,current_date,${input.status},case when ${input.status} in ('PRESENT','LATE') then now() else null end,${input.access.membership.id}::uuid,${input.note} from valid
      on conflict (programme_id,participant_id,attendance_date) do update set status=excluded.status,checked_in_at=excluded.checked_in_at,marked_by_membership_id=excluded.marked_by_membership_id,note=excluded.note,updated_at=now()
      returning id,participant_id
    ) select upserted.id,valid.student_id,valid.branch_id,valid.participant_name from upserted join valid on valid.id=upserted.participant_id
  `));
  const row=result[0];
  if(!row) throw new SummerProgrammeError("This participant cannot be marked for Summer today. Check the programme dates and operating days.",409,"SUMMER_ATTENDANCE_DAY_UNAVAILABLE");
  if(row.student_id && input.status!=="ABSENT"){
    const eventType=input.status==="LATE"?"SUMMER_LATE":"SUMMER_PRESENT";
    const title=input.status==="LATE"?"Summer arrival · Late":"Summer arrival";
    await db.execute(sql`
      insert into guardian_push_outbox (school_id,student_id,guardian_id,device_id,presence_event_id,event_type,status,attempt_count,available_at,payload,created_at,updated_at)
      select d.school_id,d.student_id,d.guardian_id,d.id,null,${eventType},'PENDING',0,now(),jsonb_build_object('title',${title},'body',${row.participant_name} || ' has been marked ' || lower(${input.status}) || ' for Summer.','branchId',${row.branch_id},'summerProgrammeId',${input.programmeId}),now(),now()
      from guardian_push_devices d join student_guardians sg on sg.id=d.student_guardian_link_id and sg.school_id=d.school_id
      where d.school_id=${input.access.school.id}::uuid and d.student_id=${row.student_id}::uuid and d.status='ACTIVE' and sg.receives_notifications=true
    `);
  }
  return row;
}

export async function listSummerStudentOptions(access: SchoolAccess, branchId: string) {
  const db = getDb();
  return rowsOf<{
    id: string;
    casa_student_id: string;
    admission_number: string | null;
    full_name: string;
  }>(await db.execute(sql`
    select distinct
      student.id::text,
      student.casa_student_id,
      student.admission_number,
      concat_ws(' ', student.first_name, student.middle_name, student.last_name) as full_name
    from students student
    join student_enrollments enrollment
      on enrollment.school_id = student.school_id
     and enrollment.student_id = student.id
     and enrollment.status = 'ACTIVE'::student_enrollment_status
    join school_branch_class_arms branch_map
      on branch_map.school_id = enrollment.school_id
     and branch_map.class_arm_id = enrollment.class_arm_id
    where student.school_id = ${access.school.id}::uuid
      and student.status = 'ACTIVE'::student_status
      and branch_map.branch_id = ${branchId}::uuid
      and enrollment.starts_on <= current_date
      and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
    order by full_name asc
  `));
}
