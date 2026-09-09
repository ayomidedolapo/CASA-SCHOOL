param(
  [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedStagingHost = "ep-ancient-truth-a5s7v83r-pooler.us-east-2.aws.neon.tech"
$ExpectedMigrationCount = 30
$MinimumAuthorizedStagingStage = 25
$ScannerHash = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
$ScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$PackageJsonHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$PackageLockHash = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"
$DrizzleConfigHash = "77e9d1759af7ad1b1d3c009e7f57c6c6e25dd159a3da9907fb410552508eff80"
$AwsLivenessHash = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"
$PendingRouteHash = "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"
$PendingRecoverySelftestHash = "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"
$PassA29Folder = "20260909020000_pass-a-enum-expansion"
$PassA30Folder = "20260909020500_pass-a-handover-attendance-state"
$PassA29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$PassA30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

function ConvertTo-StringHashtable {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true, ValueFromPipeline = $true)]$InputObject)
  process {
    $table = @{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $table[[string]$property.Name] = [string]$property.Value
    }
    return $table
  }
}

$MigrationManifest = @'
{"drizzle/20260827143258_school-foundation/migration.sql":"683a432f36721229e86ebe016e4d956ab3df649b702930c8c05a803e0b9be613","drizzle/20260827171725_school-auth-foundation/migration.sql":"a6d01bb226545d3f67422aa3149572b5c7cf85168269dba1fcda8e06b0e3fc36","drizzle/20260827174117_secure-login/migration.sql":"76f5468f8c2554be98e5d6969b36b36a865d4bd1adcad1b1dd200b5c8da06b63","drizzle/20260827191914_student-registry-foundation/migration.sql":"9224cc76ea86744ac79aa0a705173a007d3fdee01b2b449eb83d0ce88b9a7fb4","drizzle/20260827211507_student-id-card-lifecycle/migration.sql":"7382817a032979d577536bf9d1556f269388b105899346c9af546fc185f2f06d","drizzle/20260828003838_attendance-foundation/migration.sql":"70f2ac13858e78bc7f668e99fa7f1b3cfcee14d33f20b12326e0c57a9a1ba452","drizzle/20260828014547_student-identity-operating-model/migration.sql":"981a83662ea810c1e00cbadc0c19fcbfe6a75624e194581bfe23c495c8a230fb","drizzle/20260828015513_presence-school-messaging/migration.sql":"5d4ef2848c3190328c104c8924303b8618f1835e9bae7bf6ae4c892d7588eab8","drizzle/20260828020702_scanner-trust-card-resolution/migration.sql":"346fb3e397be6c89ddae30982801d4b288e17f07a08c746cd9104ee851c030c4","drizzle/20260828022058_trusted-biometric-presence-finalization/migration.sql":"bf672317df4f953d3ef55763589ae2d961673405532254de68940e139108bb33","drizzle/20260828024845_passkey-identity-step-up/migration.sql":"070aebf19da8eb13a3287a0530310a111c109fe4d44b478a71652acefff59aba","drizzle/20260828030204_face-enrollment-biometric-gateway/migration.sql":"fc244d51841bac5873f30fc70c943abac0470f5ae7381b155ba5115a38e13dcc","drizzle/20260828032347_aws-rekognition-biometric-engine/migration.sql":"5738c4a86b86cd588072f0c4bc5121a2ec496d47e483d153fa8a516295453591","drizzle/20260828103906_attendance-operations-supervised-exceptions/migration.sql":"2d011422410a7ee64c498a9f9e056331c536ee059e6dea2690c8564d70c1ec58","drizzle/20260829002614_equal_sabra/migration.sql":"743027f1b2f533b12a2ca498a6adaf108e6138785ddab46bc705fcc749ffb279","drizzle/20260829120249_school-scoped-card-templates/migration.sql":"4b80bbe96046dd86ff07ab727393df8a87db461817239cd3cbb12bf098db80a1","drizzle/20260830031700_school-real-world-foundation/migration.sql":"a5caed6e5750af3282570dc44c8c678dc31e46a7aabc269d57c76b03599b1b66","drizzle/20260830143000_card-production-authority/migration.sql":"ef109d255d53a2f6a7c729a9ab0d7bf93208f82f9957e9a87769bf6201893b44","drizzle/20260830153500_identity-card-lifecycle-authority/migration.sql":"b6f3c065c9055b65f6669afb3e6f567612764bc0bf4653ee91b5a36994df9a8d","drizzle/20260831064829_post-migration19-snapshot-baseline/migration.sql":"63e0a9f759662885c6a1d350596b957c6765d0ded53467f4475a8ebcfd78f9a6","drizzle/20260831064909_teacher-my-class-assignment/migration.sql":"d0f080bc0bd5256416d1dc61e74a4cf1bd5e7fa2caa9b9e7f28fe44d2d8f4f27","drizzle/20260901081825_attendance-readiness-card-replacement/migration.sql":"085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b","drizzle/20260902190300_wave1_transport_casa_internal/migration.sql":"5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3","drizzle/20260902201500_wave2_structure_audit/migration.sql":"96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f","drizzle/20260905030000_internal_face_authority/migration.sql":"cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7","drizzle/20260907043140_attendance-session-reopen/migration.sql":"881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd","drizzle/20260907105900_attendance-session-event-stream-multicycle/migration.sql":"bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4","drizzle/20260908135855_attendance-session-policy-rebind/migration.sql":"7791abd6bcf90d2038e434fb7e6334d98a38d19c9f14c1f2871d03f27e498681","drizzle/20260909020000_pass-a-enum-expansion/migration.sql":"cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11","drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql":"6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"}
'@ | ConvertFrom-Json | ConvertTo-StringHashtable

$PayloadManifest = @'
{"drizzle/20260909020000_pass-a-enum-expansion/migration.sql":"cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11","drizzle/20260909020000_pass-a-enum-expansion/snapshot.json":"416ec7cae9e355cfe7efc8c146dbd18f57b1762d8500a13d94b7b75541594db9","drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql":"6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0","drizzle/20260909020500_pass-a-handover-attendance-state/snapshot.json":"a68e2d14eb825fa82b9b8979b88f0bb3363bdbac58ee0b7eb55cb92ae91626e7","scripts/pass-a-selftest.ts":"acc657e3e93d6480cd1e56b23eb670243450568bd6f26edb75f2ea3832810ae2","src/app/api/internal/card-production/templates/route.ts":"4d555243e647f41dc593b33f0e77cf54d10ad1d20829b35cf094f4ae41cdf0a0","src/app/api/internal/onboarding/schools/[schoolId]/academic-options/route.ts":"3bffa0153e54b80aa701eb65698521c5411ef15a1615fe4d711b857cef551778","src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/enrollment/route.ts":"4c88bb5c8c14557fd43a849a64c3a2f46007dc179b399b2bbee90670662fcd5f","src/app/api/schools/[slug]/attendance/card-exceptions/[studentId]/route.ts":"facfc64a1a670c5149eb4b13bcabfca208b5cf1a9ae8af1ee952bdda977af772","src/app/api/schools/[slug]/attendance/first-card-exceptions/[studentId]/route.ts":"90fdba8bd027a59139fd0afcfdb608830254afb702a8511032ebf1f2565ca090","src/app/api/schools/[slug]/attendance/lifecycle/route.ts":"6caf76298eb24fb4654217274b239c51fd4c87efcda3c7d31e12625c0c2f2944","src/app/api/schools/[slug]/attendance/supervised-late-arrivals/[studentId]/route.ts":"ff03c15701af7138bb3885a50d370de2c1386aba9188d30f80be4d7f9a64cb18","src/app/api/schools/[slug]/registry/students/[studentId]/arrival-method/route.ts":"5517695f9c2d4e5816c5e82c5cca68e29bc265d8f7396d080ebc297618602cd1","src/app/api/schools/[slug]/registry/students/[studentId]/cards/[cardId]/activate/route.ts":"59f9143f1c57584c73ed1329ac1d6c0080947a3e7035d955daf97284c601a36c","src/app/internal/onboarding/onboarding-client.tsx":"74eccdb818be4951684fe65c179f1a2bb80be7f0b969b343d2de075a219e3b9f","src/app/schools/[slug]/attendance/attendance-client.tsx":"04ef274534fdc2c77ecd3be8a8ca65beb695b9180f51088710e17b26b83d05b9","src/app/schools/[slug]/attendance/page.tsx":"1971b15fb83f20d67c10b1413054654ffa91b653bae29538f09ada3985df799e","src/app/schools/[slug]/registry/student-cards.tsx":"e6cae0450bd18b82e646cd0c3f22279a8b09710bbba4e1fbe5fd1b4f88f66e9a","src/app/schools/[slug]/technician/attendance/page.tsx":"e642b50e0166e198d0e567db7c71ee4493d026a660a69152535c0b5899a9c7e9","src/app/schools/[slug]/technician/attendance/technician-attendance-client.tsx":"1105dacd04c67b6e6b9165227c27c967cbe316da30247a5bf302e4e7d33ee1da","src/db/schema/attendance-readiness-enums.ts":"3d7b89656c774daa46d30c9d3a9c68c1ef9285e9a3a283543082a5a08dfc8b92","src/db/schema/attendance-readiness.ts":"2f3e513a21a3dcefdfb1a5f9224722ba04b8cf793976d3a4c51d32c7779abc6d","src/db/schema/card-production.ts":"0f5438de141730ae4cce8c35a8cee693a6783a0f18402f0fa977f8fca672eb3b","src/db/schema/student-enums.ts":"d8206b6900ebf7ad812d65a0d5bd4c70cd50e15f4586703a8323ab853fc73eba","src/db/schema/student-identity.ts":"d1abbcda8b7312de43d54b1023fc1350f93ea95668ffacbf2b4fc72f3e74be8a","src/server/attendance/readiness.ts":"53d2293a7a980cf4ea71b56486192dff51ed8b69bb793394b2cd4a6e32fe18ab","src/server/attendance/supervised-arrival.ts":"6219cdf78ba5269a3026f13e22eaa88fcd7f170415899826be4db686a427a209","src/server/card-production/handover.ts":"d4494c05b3152c64b2f799fadcc76f200551e35c90fe8464c8c28516fd9dd09f","src/server/card-production/production.ts":"b6c7dbe3a578bc0effb4bcf37d410d25eaafe2c351fe7a3e62e95a2dcb16ab57","src/server/card-production/render.ts":"40551fcc8229c416089e75872e364a1edaf79ddc5e695542993f5426120a1208","src/server/card-production/renewal-production.ts":"727534f212e35aefa58e3096f6618f16f72c7258e2093abd664f60843146c77d","src/server/card-production/template-layout.ts":"8775abe86433e52d18efe53beccf46e45e810fcc32ab5f7ac327c9d38960115c","src/server/internal/onboarding.ts":"b8ddbb9e66781e74f942b616f1d67bdc5acee4dadb800df67c4c7abfa8c93c22","src/server/school-operations/progression.ts":"be209773078201502f225244d62517a32adaeddce077537419b67118c335c8bd"}
'@ | ConvertFrom-Json | ConvertTo-StringHashtable

$OriginalDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
$OriginalNodeOptions = [Environment]::GetEnvironmentVariable("NODE_OPTIONS", "Process")
$script:ActiveRepoRoot = $null
$script:StagingDatabaseUrl = $null
$script:DevelopmentDatabaseUrl = $null
$script:ProbePath = $null
$script:EvidenceRoot = $null

function Abort([string]$Message) {
  throw "ABORTED: $Message"
}

function Repo-Path([string]$RelativePath) {
  return Join-Path $script:ActiveRepoRoot ($RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
}

function Hash-Of([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Abort "Required file is missing: $Path" }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Hash([string]$RelativePath, [string]$ExpectedHash) {
  $actual = Hash-Of (Repo-Path $RelativePath)
  if ($actual -ne $ExpectedHash.ToLowerInvariant()) {
    Abort "Checksum drift: $RelativePath`nExpected: $ExpectedHash`nActual:   $actual"
  }
}

function Git-Lines([string[]]$Arguments) {
  $stderrPath = [IO.Path]::GetTempFileName()
  $previous = $ErrorActionPreference
  $exitCode = $null
  $stdout = @()
  try {
    $ErrorActionPreference = "Continue"
    $stdout = @(& git -C $script:ActiveRepoRoot @Arguments 2> $stderrPath)
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previous }

  $stderr = @()
  try {
    if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
      $stderr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ })
    }
  }
  finally { Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue }

  if ($null -eq $exitCode) { Abort "git $($Arguments -join ' ') did not return an exit code." }
  if ($exitCode -ne 0) {
    $details = @()
    if ($stdout.Count -gt 0) { $details += "stdout:"; $details += $stdout }
    if ($stderr.Count -gt 0) { $details += "stderr:"; $details += $stderr }
    Abort "git $($Arguments -join ' ') failed with exit code $exitCode`n$($details -join [Environment]::NewLine)"
  }
  return @($stdout | ForEach-Object { [string]$_ })
}

function Git-Text([string[]]$Arguments) {
  return ((Git-Lines $Arguments) -join "`n").Trim()
}

function Invoke-NativeChecked([string]$Label, [scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $exitCode = $null
  try {
    $ErrorActionPreference = "Continue"
    & $Command
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previous }
  if ($null -eq $exitCode) { Abort "$Label did not return an exit code." }
  if ($exitCode -ne 0) { Abort "$Label failed with exit code $exitCode." }
}

function Get-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Abort "Environment file missing: $Path" }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -le 0) { continue }
    if ($trimmed.Substring(0, $idx).Trim() -ne $Name) { continue }
    $value = $trimmed.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  Abort "$Name is missing from $Path"
}

function Migration-Directories {
  return @(
    Get-ChildItem -LiteralPath (Repo-Path "drizzle") -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "migration.sql") -PathType Leaf } |
      Sort-Object Name
  )
}

function Resolve-ScannerTrustPaths {
  $tracked = Git-Lines @("ls-files")
  $scannerMatches = New-Object System.Collections.Generic.List[string]
  $cssMatches = New-Object System.Collections.Generic.List[string]
  foreach ($relative in $tracked) {
    $path = Repo-Path $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -eq $ScannerHash) { $scannerMatches.Add($relative) }
    if ($hash -eq $ScannerCssHash) { $cssMatches.Add($relative) }
  }
  if ($scannerMatches.Count -ne 1) { Abort "Locked Scanner source hash resolved to $($scannerMatches.Count) tracked files; expected exactly 1." }
  if ($cssMatches.Count -ne 1) { Abort "Locked Scanner CSS hash resolved to $($cssMatches.Count) tracked files; expected exactly 1." }
  return @{ Scanner = $scannerMatches[0]; ScannerCss = $cssMatches[0] }
}

function Write-ProbeScript([string]$Path) {
  $content = @'
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const repo = process.argv[2];
const expectedHost = String(process.argv[3] ?? "").toLowerCase();
const label = String(process.argv[4] ?? "database");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured in this process.");
const parsed = new URL(databaseUrl);
const actualHost = parsed.hostname.toLowerCase();
if (actualHost !== expectedHost) {
  throw new Error(`${label.toUpperCase()} HOST GUARD FAILED. Expected ${expectedHost}; found ${actualHost}.`);
}
const sql = neon(databaseUrl);

const migrationTable = await sql`
  select exists (
    select 1 from information_schema.tables
    where table_schema='drizzle' and table_name='__drizzle_migrations'
  ) as exists
`;
if (!migrationTable[0]?.exists) throw new Error(`${label}: drizzle.__drizzle_migrations does not exist.`);

const rows = await sql`select id, hash, created_at from drizzle.__drizzle_migrations order by id`;
const migrationDirs = readdirSync(join(repo, "drizzle"))
  .filter((name) => {
    const p = join(repo, "drizzle", name);
    return /^\d{14}_.+/.test(name) && statSync(p).isDirectory() && statSync(join(p, "migration.sql")).isFile();
  })
  .sort();
if (migrationDirs.length !== 30) throw new Error(`Expected exactly 30 local migration folders; found ${migrationDirs.length}.`);
const local = migrationDirs.map((name) => ({
  name,
  hash: createHash("sha256").update(readFileSync(join(repo, "drizzle", name, "migration.sql"))).digest("hex"),
}));
if (rows.length > local.length) throw new Error(`${label}: database has more migrations (${rows.length}) than local source (${local.length}).`);
for (let i = 0; i < rows.length; i++) {
  const actual = String(rows[i]?.hash ?? "").toLowerCase();
  const expected = local[i].hash;
  if (actual !== expected) throw new Error(`${label}: migration history diverges at position ${i + 1} (${local[i].name}).`);
}

const coreCountRows = await sql`
  select
    (select count(*)::int from schools) as schools,
    (select count(*)::int from users) as users,
    (select count(*)::int from students) as students,
    (select count(*)::int from student_identity_cards) as student_identity_cards,
    (select count(*)::int from school_attendance_lifecycles) as school_attendance_lifecycles,
    (select count(*)::int from student_arrival_method_assignments) as student_arrival_method_assignments,
    (select count(*)::int from attendance_sessions) as attendance_sessions,
    (select count(*)::int from student_attendance_records) as student_attendance_records,
    (select count(*)::int from student_presence_events) as student_presence_events,
    (select count(*)::int from student_card_production_jobs) as student_card_production_jobs
`;
const rawCore = coreCountRows[0] ?? {};
const coreCounts = {
  schools: Number(rawCore.schools ?? 0),
  users: Number(rawCore.users ?? 0),
  students: Number(rawCore.students ?? 0),
  student_identity_cards: Number(rawCore.student_identity_cards ?? 0),
  school_attendance_lifecycles: Number(rawCore.school_attendance_lifecycles ?? 0),
  student_arrival_method_assignments: Number(rawCore.student_arrival_method_assignments ?? 0),
  attendance_sessions: Number(rawCore.attendance_sessions ?? 0),
  student_attendance_records: Number(rawCore.student_attendance_records ?? 0),
  student_presence_events: Number(rawCore.student_presence_events ?? 0),
  student_card_production_jobs: Number(rawCore.student_card_production_jobs ?? 0),
};

const identityStatusValues = await sql`
  select e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname='student_identity_card_status'
`;
const identityEventValues = await sql`
  select e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname='student_identity_card_event_type'
`;
const lifecycleEventValues = await sql`
  select e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname='school_attendance_lifecycle_event_type'
`;
const enumReady =
  new Set(identityStatusValues.map(r=>r.enumlabel)).has("READY_FOR_ACTIVATION") &&
  new Set(identityEventValues.map(r=>r.enumlabel)).has("ACTIVATED") &&
  new Set(lifecycleEventValues.map(r=>r.enumlabel)).has("RESUME_SCHEDULED") &&
  new Set(lifecycleEventValues.map(r=>r.enumlabel)).has("RESUME_SCHEDULE_CANCELLED");

const structural = await sql`
  select
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_attendance_lifecycles' and column_name='scheduled_resume_at') as scheduled_resume_at,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_attendance_lifecycles' and column_name='scheduled_resume_by_membership_id') as scheduled_resume_by,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_attendance_lifecycles' and column_name='scheduled_resume_reason') as scheduled_resume_reason,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='school_attendance_lifecycle_events' and column_name='scheduled_for') as scheduled_for,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_arrival_method_assignments' and column_name='assigned_by_internal_membership_id') as arrival_internal_actor,
    to_regclass('public.student_first_card_attendance_exceptions') is not null as first_card_table,
    to_regclass('public.student_supervised_late_arrivals') is not null as supervised_late_table,
    to_regclass('public.student_identity_cards_one_pending_activation_per_student_idx') is not null as pending_card_index,
    to_regclass('public.attendance_session_events') is not null as session_events_table,
    to_regclass('public.attendance_session_policy_rebinds') is not null as policy_rebind_table
`;
const s = structural[0] ?? {};
const passAStructuralReady = [s.scheduled_resume_at,s.scheduled_resume_by,s.scheduled_resume_reason,s.scheduled_for,s.arrival_internal_actor,s.first_card_table,s.supervised_late_table,s.pending_card_index].every(Boolean);
const anyPassAStructural = [s.scheduled_resume_at,s.scheduled_resume_by,s.scheduled_resume_reason,s.scheduled_for,s.arrival_internal_actor,s.first_card_table,s.supervised_late_table,s.pending_card_index].some(Boolean);

let arrival = { total: null, actorless: null, internal: null, dual: null };
if (coreCounts.student_arrival_method_assignments !== null) {
  if (s.arrival_internal_actor) {
    const a = await sql`
      select
        count(*)::int as total,
        count(*) filter (where assigned_by_membership_id is null and assigned_by_internal_membership_id is null)::int as actorless,
        count(*) filter (where assigned_by_internal_membership_id is not null)::int as internal,
        count(*) filter (where assigned_by_membership_id is not null and assigned_by_internal_membership_id is not null)::int as dual
      from student_arrival_method_assignments
    `;
    arrival = { total:Number(a[0]?.total??0), actorless:Number(a[0]?.actorless??0), internal:Number(a[0]?.internal??0), dual:Number(a[0]?.dual??0) };
  } else {
    const a = await sql`
      select
        count(*)::int as total,
        count(*) filter (where assigned_by_membership_id is null)::int as actorless
      from student_arrival_method_assignments
    `;
    arrival = { total:Number(a[0]?.total??0), actorless:Number(a[0]?.actorless??0), internal:null, dual:null };
  }
}

let triggerReady = false;
let actorConstraintReady = false;
let statusDefaultReady = false;
if (rows.length >= 30) {
  const actorTrigger = await sql`
    select pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='student_arrival_method_assignments'
      and t.tgname='student_arrival_method_assignments_actor_guard_trigger' and not t.tgisinternal
  `;
  const actorFunction = await sql`
    select pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='student_arrival_method_assignments_actor_guard'
  `;
  const fn = String(actorFunction[0]?.definition ?? "");
  triggerReady = actorTrigger.length===1 && fn.includes("requires exactly one actor") && fn.includes("TG_OP = 'INSERT'");
  const actorConstraint = await sql`
    select pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='student_arrival_method_assignments'
      and c.conname='student_arrival_method_assignments_actor_check'
  `;
  actorConstraintReady = actorConstraint.length===1;
  const def = await sql`
    select column_default from information_schema.columns
    where table_schema='public' and table_name='student_identity_cards' and column_name='status'
  `;
  statusDefaultReady = String(def[0]?.column_default??"").includes("READY_FOR_ACTIVATION");
}

const info = await sql`select current_database() as database_name, current_user as database_user`;
console.log(JSON.stringify({
  label,
  host: actualHost,
  database: info[0]?.database_name ?? null,
  role: info[0]?.database_user ?? null,
  appliedMigrations: rows.length,
  migrationHashes: rows.map(r=>String(r.hash).toLowerCase()),
  enumReady,
  anyPassAStructural,
  passAStructuralReady,
  sessionEventsTable: Boolean(s.session_events_table),
  policyRebindTable: Boolean(s.policy_rebind_table),
  triggerReady,
  actorConstraintReady,
  statusDefaultReady,
  coreCounts,
  arrival
}));
'@
  [IO.File]::WriteAllText($Path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Probe([string]$DatabaseUrl, [string]$ExpectedHost, [string]$Label) {
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $DatabaseUrl, "Process")
  $env:DATABASE_URL = $DatabaseUrl
  $maxAttempts = 4

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $stderrPath = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference
    $exitCode = $null
    $stdout = @()
    try {
      $ErrorActionPreference = "Continue"
      $stdout = @(& node $script:ProbePath $script:ActiveRepoRoot $ExpectedHost $Label 2> $stderrPath)
      $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previous }

    $stderr = @()
    try {
      if (Test-Path -LiteralPath $stderrPath) { $stderr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue) }
    }
    finally { Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue }

    if ($exitCode -eq 0) {
      $lines = @($stdout | ForEach-Object { ([string]$_).Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
      if ($lines.Count -lt 1) { Abort "$Label probe returned no output." }
      try { return ($lines[-1] | ConvertFrom-Json) }
      catch { Abort "$Label probe returned invalid JSON.`n$($stdout -join [Environment]::NewLine)" }
    }

    Write-Host "  $Label read-only probe attempt ${attempt}/${maxAttempts}: FAILED"
    if ($attempt -lt $maxAttempts) {
      $delay = $attempt * 2
      Write-Host "    retrying after ${delay}s..."
      Start-Sleep -Seconds $delay
      continue
    }

    Abort "$Label read-only probe failed after $maxAttempts attempts.`n$($stdout -join [Environment]::NewLine)`n$($stderr -join [Environment]::NewLine)"
  }
}

function Assert-ExactMigrationPrefix($Probe, [int]$ExpectedCount, [string]$Label) {
  if ([int]$Probe.appliedMigrations -ne $ExpectedCount) { Abort "$Label migration count is $($Probe.appliedMigrations); expected $ExpectedCount." }
  $dirs = @(Migration-Directories)
  if ($dirs.Count -ne $ExpectedMigrationCount) { Abort "Expected 30 local migration folders; found $($dirs.Count)." }
  $expected = @($dirs | Select-Object -First $ExpectedCount | ForEach-Object { Hash-Of (Join-Path $_.FullName 'migration.sql') })
  $actual = @($Probe.migrationHashes | ForEach-Object { [string]$_ })
  if ($actual.Count -ne $expected.Count) { Abort "$Label migration history cardinality mismatch." }
  for ($i=0; $i -lt $expected.Count; $i++) {
    if ($actual[$i].ToLowerInvariant() -ne $expected[$i].ToLowerInvariant()) { Abort "$Label migration history diverges at position $($i+1)." }
  }
}

function Assert-StageSemantics($Probe, [int]$Stage, [string]$Label) {
  if ($Stage -lt 29) {
    if ([bool]$Probe.enumReady) { Abort "$Label has Pass A enum values before migration 29." }
    if ([bool]$Probe.anyPassAStructural) { Abort "$Label has Pass A migration-30 structures before migration 30." }
  }
  elseif ($Stage -eq 29) {
    if (-not [bool]$Probe.enumReady) { Abort "$Label migration 29 is recorded but Pass A enum expansion is incomplete." }
    if ([bool]$Probe.anyPassAStructural) { Abort "$Label has migration-30 structures while history is at 29." }
  }
  elseif ($Stage -eq 30) {
    if (-not [bool]$Probe.enumReady) { Abort "$Label Pass A enum expansion is incomplete." }
    if (-not [bool]$Probe.passAStructuralReady) { Abort "$Label Pass A structural schema is incomplete." }
    if (-not [bool]$Probe.triggerReady) { Abort "$Label arrival actor enforcement trigger/function is incomplete." }
    if (-not [bool]$Probe.actorConstraintReady) { Abort "$Label legacy-compatible arrival actor constraint is incomplete." }
    if (-not [bool]$Probe.statusDefaultReady) { Abort "$Label card status default is not READY_FOR_ACTIVATION." }
    if ([int]$Probe.arrival.dual -ne 0) { Abort "$Label contains dual-attributed arrival assignments." }
  }
  if ($Stage -ge 27 -and -not [bool]$Probe.sessionEventsTable) { Abort "$Label migration history is >=27 but attendance_session_events is missing." }
  if ($Stage -ge 28 -and -not [bool]$Probe.policyRebindTable) { Abort "$Label migration history is >=28 but attendance_session_policy_rebinds is missing." }
}

function New-IsolatedMigrationConfig([string]$ConfigPath, [string]$MigrationOut) {
  if ($MigrationOut.Contains('"')) { Abort "Temporary migration path contains an unsupported quote character." }
  $out = $MigrationOut -replace '\\','/'
  $content = @"
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
const parsed = new URL(databaseUrl);
if (parsed.hostname.toLowerCase() !== "$ExpectedStagingHost") {
  throw new Error("STAGING HOST GUARD FAILED. Expected $ExpectedStagingHost; found " + parsed.hostname);
}
export default defineConfig({
  out: "$out",
  dialect: "postgresql",
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
  dbCredentials: { url: databaseUrl },
});
"@
  [IO.File]::WriteAllText($ConfigPath, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Copy-MigrationSet([int]$Count, [string]$Destination) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $dirs = @(Migration-Directories)
  if ($dirs.Count -ne $ExpectedMigrationCount) { Abort "Expected 30 migration folders, found $($dirs.Count)." }
  foreach ($dir in @($dirs | Select-Object -First $Count)) {
    Copy-Item -LiteralPath $dir.FullName -Destination (Join-Path $Destination $dir.Name) -Recurse -Force
  }
}

function Invoke-DrizzleMigrate([string]$Label, [string]$ConfigPath) {
  if ($env:DATABASE_URL -ne $script:StagingDatabaseUrl) { Abort "DATABASE_URL is not locked to authorized Staging before $Label." }
  Invoke-NativeChecked $Label { & npx drizzle-kit migrate --config $ConfigPath }
}

function Core-CountsJson($Probe) {
  return ($Probe.coreCounts | ConvertTo-Json -Depth 10 -Compress)
}

try {
  Write-Host "CASA School - Pass A Guarded Staging Schema Promotion V1R1"
  Write-Host "Promotes the exact Development-verified migration prefix to Staging only."
  Write-Host "Handles an authorized Staging prefix from 25 through 30 without rerunning applied migrations."
  Write-Host "Migration 29 and 30 are isolated so PostgreSQL enum expansion commits before migration 30 uses it."
  Write-Host "No source generation. Development is read-only. No AWS mutation. Production is never read or connected."
  Write-Host "V1R1 fixes the empty RepoRoot/LiteralPath bug, pins the post-face-recovery Scanner/AWS/pending route, and retries transient read-only Neon probes."
  Write-Host ""

  foreach ($cmd in @('git','npm','npx','node')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Abort "$cmd is not available." }
  }

  $resolved = (Resolve-Path -LiteralPath $RepoRoot).Path
  $script:ActiveRepoRoot = $resolved
  $top = Git-Text @('rev-parse','--show-toplevel')
  $topResolved = (Resolve-Path -LiteralPath $top).Path
  if ($resolved.TrimEnd([char[]]'\/') -ne $topResolved.TrimEnd([char[]]'\/')) { Abort "Run this script from the CASA repository root." }
  $script:ActiveRepoRoot = $topResolved

  Write-Host "==> Re-proving exact green Pass A source authority"
  $branch = Git-Text @('branch','--show-current')
  $head = Git-Text @('rev-parse','--short=7','HEAD')
  if ($branch -ne $ExpectedBranch) { Abort "Expected branch $ExpectedBranch, found $branch." }
  if ($head -ne $ExpectedHead) { Abort "Expected HEAD $ExpectedHead, found $head." }
  Assert-Hash 'package.json' $PackageJsonHash
  Assert-Hash 'package-lock.json' $PackageLockHash
  Assert-Hash 'drizzle.config.ts' $DrizzleConfigHash

  $dirs = @(Migration-Directories)
  if ($dirs.Count -ne $ExpectedMigrationCount) { Abort "Expected exactly 30 local migrations; found $($dirs.Count)." }
  foreach ($relative in ($MigrationManifest.Keys | Sort-Object)) { Assert-Hash $relative ([string]$MigrationManifest[$relative]) }
  # Current schema promotion pins exact migrations plus current Scanner/AWS recovery authority; legacy Pass A source postimage manifest is intentionally not enforced after permanent-card and Scanner recovery source changes.

  $scanner = Resolve-ScannerTrustPaths
  Assert-Hash $scanner.Scanner $ScannerHash
  Assert-Hash $scanner.ScannerCss $ScannerCssHash
  Assert-Hash 'src/server/biometrics/aws-liveness.ts' $AwsLivenessHash
  Assert-Hash 'src/app/api/terminal/attempts/pending/route.ts' $PendingRouteHash
  Assert-Hash 'scripts/scanner-pending-attempt-recovery-selftest.ts' $PendingRecoverySelftestHash
  [void](Git-Lines @('diff','--check','HEAD','--'))
  Write-Host "  branch/head: $branch/$head"
  Write-Host "  migrations: 30 / exact hashes verified"
  Write-Host "  recovered migration 30: exact post-recovery hash verified"
  Write-Host "  Scanner trust path: byte-for-byte locked"
  Write-Host "  AWS liveness recovery: byte-for-byte locked"
  Write-Host "  duplicate-safe pending recovery: byte-for-byte locked"
  Write-Host "  git diff --check: passed"

  Write-Host ""
  Write-Host "==> Re-running source gates before Staging mutation"
  Invoke-NativeChecked 'typecheck' { & npm run typecheck }
  Invoke-NativeChecked 'Scanner contract self-test' { & npm run scanner:selftest }
  Invoke-NativeChecked 'student-card cryptographic self-test' { & npm run card:selftest }
  Invoke-NativeChecked 'Pass A source contract self-test' { & npx tsx scripts/pass-a-selftest.ts }
  Invoke-NativeChecked 'pending-attempt recovery self-test' { & npx tsx scripts/scanner-pending-attempt-recovery-selftest.ts }

  Write-Host ""
  Write-Host "==> Locking Development and Staging environment identities"
  $devEnv = Repo-Path '.env.local'
  $stageEnv = Repo-Path '.env.staging.local'
  $script:DevelopmentDatabaseUrl = Get-DotEnvValue $devEnv 'DATABASE_URL'
  $script:StagingDatabaseUrl = Get-DotEnvValue $stageEnv 'DATABASE_URL'
  try {
    $devUri = [Uri]$script:DevelopmentDatabaseUrl
    $stageUri = [Uri]$script:StagingDatabaseUrl
  }
  catch { Abort "Development or Staging DATABASE_URL is invalid." }
  if ($devUri.Host -ne $ExpectedDevelopmentHost) { Abort ".env.local is not bound to authorized Development; found $($devUri.Host)." }
  if ($stageUri.Host -ne $ExpectedStagingHost) { Abort ".env.staging.local is not bound to authorized Staging; found $($stageUri.Host)." }
  if ($devUri.Host -eq $stageUri.Host) { Abort "Development and Staging unexpectedly share a host." }
  $trackedStageEnv = (Git-Text @('ls-files','--','.env.staging.local'))
  if (-not [string]::IsNullOrWhiteSpace($trackedStageEnv)) { Abort ".env.staging.local is tracked by Git." }
  $ignored = $false
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference='Continue'
    & git -C $script:ActiveRepoRoot check-ignore --quiet -- '.env.staging.local'
    $ignoreExit=$LASTEXITCODE
  }
  finally { $ErrorActionPreference=$previous }
  if ($ignoreExit -ne 0) { Abort ".env.staging.local is not Git-ignored." }
  Write-Host "  Development: $ExpectedDevelopmentHost / VERIFIED"
  Write-Host "  Staging:     $ExpectedStagingHost / VERIFIED"
  Write-Host "  .env.staging.local: GIT-IGNORED"
  Write-Host "  Production: NOT READ / NOT CONNECTED"

  $requiredNodeOptions='--dns-result-order=ipv4first --no-network-family-autoselection'
  if ([string]::IsNullOrWhiteSpace($OriginalNodeOptions)) { $env:NODE_OPTIONS=$requiredNodeOptions }
  else {
    $env:NODE_OPTIONS=$OriginalNodeOptions
    if ($env:NODE_OPTIONS -notmatch 'dns-result-order=ipv4first') { $env:NODE_OPTIONS += ' --dns-result-order=ipv4first' }
    if ($env:NODE_OPTIONS -notmatch 'no-network-family-autoselection') { $env:NODE_OPTIONS += ' --no-network-family-autoselection' }
  }

  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $script:EvidenceRoot=Join-Path (Repo-Path '.casa-backups') "pass-a-staging-promotion-v1r1-$stamp"
  New-Item -ItemType Directory -Path $script:EvidenceRoot -Force | Out-Null
  $GitStatusBefore = @(Git-Lines @('status','--short'))
  $GitStatusBefore | Set-Content -LiteralPath (Join-Path $script:EvidenceRoot 'git-status-before.txt') -Encoding UTF8
  $script:ProbePath=Join-Path $script:EvidenceRoot 'pass-a-staging-probe.mjs'
  Write-ProbeScript $script:ProbePath

  Write-Host ""
  Write-Host "==> Re-proving Development 30/30 as read-only schema authority"
  $dev=Invoke-Probe $script:DevelopmentDatabaseUrl $ExpectedDevelopmentHost 'Development'
  Assert-ExactMigrationPrefix $dev 30 'Development'
  Assert-StageSemantics $dev 30 'Development'
  Write-Host "  Development migrations: 30 / VERIFIED"
  Write-Host "  Development Pass A schema: VERIFIED"

  Write-Host ""
  Write-Host "==> Read-only Staging preflight"
  $stageBefore=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging'
  $stage=[int]$stageBefore.appliedMigrations
  if ($stage -lt $MinimumAuthorizedStagingStage -or $stage -gt 30) { Abort "Authorized Pass A Staging prefix must be 25-30; found $stage." }
  Assert-ExactMigrationPrefix $stageBefore $stage 'Staging'
  Assert-StageSemantics $stageBefore $stage 'Staging'
  $preCoreJson=Core-CountsJson $stageBefore
  $preArrivalTotal=$stageBefore.arrival.total
  $preArrivalActorless=$stageBefore.arrival.actorless
  Write-Host "  Staging migrations before: $stage / EXACT DEVELOPMENT PREFIX"
  Write-Host "  core application row counts: SNAPSHOTTED"
  if ($null -ne $preArrivalTotal) {
    Write-Host "  arrival assignments: $preArrivalTotal"
    Write-Host "  historical unknown-actor rows: $preArrivalActorless"
  }

  if ($stage -eq 30) {
    Write-Host ""
    Write-Host "PASS A STAGING SCHEMA IS ALREADY GREEN."
    Write-Host "  Staging migrations: 30 / VERIFIED"
    Write-Host "  Pass A schema invariants: VERIFIED"
    Write-Host "  Staging mutation this run: NO"
    Write-Host "  Development mutation: NO"
    Write-Host "  AWS mutation: NO"
    Write-Host "  Production touched: NO"
    Write-Host "  evidence: $script:EvidenceRoot"
    exit 0
  }

  $missing = 30 - $stage
  Write-Host ""
  Write-Host "================ PASS A STAGING SCHEMA GATE ================"
  Write-Host "Target: $ExpectedStagingHost"
  Write-Host "Current exact prefix: $stage"
  Write-Host "Target: 30"
  Write-Host "Pending migration count: $missing"
  Write-Host "Migration 29 and 30 will be committed in separate Drizzle invocations."
  Write-Host "Development remains read-only. Production is never connected."
  Write-Host ""
  $confirmation=Read-Host "Type exactly 'APPLY CASA PASS A TO STAGING' to continue"
  if ($confirmation -ne 'APPLY CASA PASS A TO STAGING') { Abort "Confirmation phrase did not match. Staging was not mutated." }

  # Prepare isolated immutable migration prefixes before mutation.
  $set28=Join-Path $script:EvidenceRoot 'isolated-drizzle-through-28'
  $set29=Join-Path $script:EvidenceRoot 'isolated-drizzle-through-29'
  $set30=Join-Path $script:EvidenceRoot 'isolated-drizzle-through-30'
  $cfg28=Join-Path $script:EvidenceRoot 'drizzle-staging-through-28.config.ts'
  $cfg29=Join-Path $script:EvidenceRoot 'drizzle-staging-through-29.config.ts'
  $cfg30=Join-Path $script:EvidenceRoot 'drizzle-staging-through-30.config.ts'
  Copy-MigrationSet 28 $set28; New-IsolatedMigrationConfig $cfg28 $set28
  Copy-MigrationSet 29 $set29; New-IsolatedMigrationConfig $cfg29 $set29
  Copy-MigrationSet 30 $set30; New-IsolatedMigrationConfig $cfg30 $set30

  # Re-lock all migration and Scanner bytes immediately before first Staging write.
  foreach ($relative in ($MigrationManifest.Keys | Sort-Object)) { Assert-Hash $relative ([string]$MigrationManifest[$relative]) }
  Assert-Hash $scanner.Scanner $ScannerHash
  Assert-Hash $scanner.ScannerCss $ScannerCssHash
  Assert-Hash 'src/server/biometrics/aws-liveness.ts' $AwsLivenessHash
  Assert-Hash 'src/app/api/terminal/attempts/pending/route.ts' $PendingRouteHash
  Assert-Hash 'scripts/scanner-pending-attempt-recovery-selftest.ts' $PendingRecoverySelftestHash
  [Environment]::SetEnvironmentVariable('DATABASE_URL',$script:StagingDatabaseUrl,'Process')
  $env:DATABASE_URL=$script:StagingDatabaseUrl

  if ($stage -lt 28) {
    Write-Host ""
    Write-Host "==> Applying exact Staging migrations $($stage+1)-28"
    try { Invoke-DrizzleMigrate "Staging migrations through 28" $cfg28 }
    catch {
      Write-Host "==> Staging apply through 28 failed; probing committed boundary read-only"
      try {
        $recover=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging recovery'
        Write-Host "  committed migration count after failure: $($recover.appliedMigrations)"
      } catch { Write-Host "  recovery probe failed: $($_.Exception.Message)" }
      throw
    }
    $stage=28
    $probe28=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging after 28'
    Assert-ExactMigrationPrefix $probe28 28 'Staging after 28'
    Assert-StageSemantics $probe28 28 'Staging after 28'
    Write-Host "  Staging migration 28 boundary: VERIFIED"
  }

  if ($stage -eq 28) {
    Write-Host ""
    Write-Host "==> Applying Staging migration 29 ONLY"
    Write-Host "  $PassA29Folder"
    try { Invoke-DrizzleMigrate "Staging migration 29" $cfg29 }
    catch {
      Write-Host "==> Migration 29 failed; proving Staging remains at 28"
      try { $r=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging recovery'; Assert-ExactMigrationPrefix $r 28 'Staging recovery'; Assert-StageSemantics $r 28 'Staging recovery' } catch { Write-Host "  recovery proof failed: $($_.Exception.Message)" }
      throw
    }
    $stage=29
    $probe29=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging after 29'
    Assert-ExactMigrationPrefix $probe29 29 'Staging after 29'
    Assert-StageSemantics $probe29 29 'Staging after 29'
    Write-Host "  enum expansion committed: VERIFIED"
  }

  if ($stage -eq 29) {
    Write-Host ""
    Write-Host "==> Applying Staging migration 30 ONLY"
    Write-Host "  $PassA30Folder"
    try { Invoke-DrizzleMigrate "Staging migration 30" $cfg30 }
    catch {
      Write-Host "==> Migration 30 failed; proving migration 29 remains the committed safe boundary"
      try { $r=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging recovery'; Assert-ExactMigrationPrefix $r 29 'Staging recovery'; Assert-StageSemantics $r 29 'Staging recovery' } catch { Write-Host "  recovery proof failed: $($_.Exception.Message)" }
      throw
    }
    $stage=30
  }

  Write-Host ""
  Write-Host "==> Final read-only Staging Pass A proof"
  $stageAfter=Invoke-Probe $script:StagingDatabaseUrl $ExpectedStagingHost 'Staging final'
  Assert-ExactMigrationPrefix $stageAfter 30 'Staging final'
  Assert-StageSemantics $stageAfter 30 'Staging final'
  $postCoreJson=Core-CountsJson $stageAfter
  if ($postCoreJson -ne $preCoreJson) { Abort "Core application row counts changed during Staging schema promotion.`nBefore: $preCoreJson`nAfter:  $postCoreJson" }
  if ($null -ne $preArrivalTotal -and [int]$stageAfter.arrival.total -ne [int]$preArrivalTotal) { Abort "Arrival assignment row count changed during Staging schema promotion." }
  if ($null -ne $preArrivalActorless -and [int]$stageAfter.arrival.actorless -ne [int]$preArrivalActorless) { Abort "Historical unknown-actor arrival row count changed during Staging schema promotion." }
  if ([int]$stageAfter.arrival.internal -ne 0) { Abort "Staging schema promotion unexpectedly populated internal arrival actors." }
  if ([int]$stageAfter.arrival.dual -ne 0) { Abort "Staging schema promotion produced dual-attributed arrival rows." }
  Write-Host "  Staging migrations: 30 / VERIFIED"
  Write-Host "  Pass A enum expansion: VERIFIED"
  Write-Host "  Pass A structural schema: VERIFIED"
  Write-Host "  future exact-one arrival actor enforcement: VERIFIED"
  Write-Host "  core application row counts: UNCHANGED"
  Write-Host "  historical unknown actor attribution fabricated: NO"

  Assert-Hash $scanner.Scanner $ScannerHash
  Assert-Hash $scanner.ScannerCss $ScannerCssHash
  Assert-Hash 'src/server/biometrics/aws-liveness.ts' $AwsLivenessHash
  Assert-Hash 'src/app/api/terminal/attempts/pending/route.ts' $PendingRouteHash
  Assert-Hash 'scripts/scanner-pending-attempt-recovery-selftest.ts' $PendingRecoverySelftestHash
  # Current schema promotion pins exact migrations plus current Scanner/AWS recovery authority; legacy Pass A source postimage manifest is intentionally not enforced after permanent-card and Scanner recovery source changes.
  [void](Git-Lines @('diff','--check','HEAD','--'))
  $GitStatusAfter = @(Git-Lines @('status','--short'))
  $GitStatusAfter | Set-Content -LiteralPath (Join-Path $script:EvidenceRoot 'git-status-after.txt') -Encoding UTF8

  Write-Host ""
  Write-Host "PASS A STAGING SCHEMA PROMOTION V1R1 PASSED."
  Write-Host "  source authority: main/a7aa668 + exact 30-migration prefix + post-face-recovery Scanner/AWS/pending recovery pins"
  Write-Host "  Development migrations: 30 / READ-ONLY VERIFIED"
  Write-Host "  Staging migrations: 30 / VERIFIED"
  Write-Host "  Scanner mutation: NO / CURRENT RECOVERY HASH PRESERVED"
  Write-Host "  AWS mutation: NO / CURRENT LIVENESS HASH PRESERVED"
  Write-Host "  pending recovery source: CURRENT DUPLICATE-SAFE HASH PRESERVED"
  Write-Host "  Development mutation: NO"
  Write-Host "  Production read/connection/mutation: NO"
  Write-Host "  evidence: $script:EvidenceRoot"
  Write-Host ""
  Write-Host "Next: paste this complete output back into ChatGPT. Do not deploy or touch Production yet."
}
catch {
  Write-Error $_
  exit 1
}
finally {
  if ($null -eq $OriginalDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { [Environment]::SetEnvironmentVariable('DATABASE_URL',$OriginalDatabaseUrl,'Process'); $env:DATABASE_URL=$OriginalDatabaseUrl }
  if ($null -eq $OriginalNodeOptions) { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
  else { [Environment]::SetEnvironmentVariable('NODE_OPTIONS',$OriginalNodeOptions,'Process'); $env:NODE_OPTIONS=$OriginalNodeOptions }
}
