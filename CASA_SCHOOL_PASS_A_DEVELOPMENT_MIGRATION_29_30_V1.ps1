param(
  [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedMigrationCount = 30
$PassA29Folder = "20260909020000_pass-a-enum-expansion"
$PassA30Folder = "20260909020500_pass-a-handover-attendance-state"
$PassA29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$PassA30Hash = "5eaf2d61e0e68ee0eec0911630bf3ea42185fc8548b0c3281fcc5644a630e984"
$ScannerHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90"
$ScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$PackageJsonHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$PackageLockHash = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"
$DrizzleConfigHash = "77e9d1759af7ad1b1d3c009e7f57c6c6e25dd159a3da9907fb410552508eff80"

function ConvertTo-StringHashtable {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
    $InputObject
  )
  process {
    $table = @{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $table[[string]$property.Name] = [string]$property.Value
    }
    return $table
  }
}

$MigrationManifest = @'
{"drizzle/20260827143258_school-foundation/migration.sql":"683a432f36721229e86ebe016e4d956ab3df649b702930c8c05a803e0b9be613","drizzle/20260827171725_school-auth-foundation/migration.sql":"a6d01bb226545d3f67422aa3149572b5c7cf85168269dba1fcda8e06b0e3fc36","drizzle/20260827174117_secure-login/migration.sql":"76f5468f8c2554be98e5d6969b36b36a865d4bd1adcad1b1dd200b5c8da06b63","drizzle/20260827191914_student-registry-foundation/migration.sql":"9224cc76ea86744ac79aa0a705173a007d3fdee01b2b449eb83d0ce88b9a7fb4","drizzle/20260827211507_student-id-card-lifecycle/migration.sql":"7382817a032979d577536bf9d1556f269388b105899346c9af546fc185f2f06d","drizzle/20260828003838_attendance-foundation/migration.sql":"70f2ac13858e78bc7f668e99fa7f1b3cfcee14d33f20b12326e0c57a9a1ba452","drizzle/20260828014547_student-identity-operating-model/migration.sql":"981a83662ea810c1e00cbadc0c19fcbfe6a75624e194581bfe23c495c8a230fb","drizzle/20260828015513_presence-school-messaging/migration.sql":"5d4ef2848c3190328c104c8924303b8618f1835e9bae7bf6ae4c892d7588eab8","drizzle/20260828020702_scanner-trust-card-resolution/migration.sql":"346fb3e397be6c89ddae30982801d4b288e17f07a08c746cd9104ee851c030c4","drizzle/20260828022058_trusted-biometric-presence-finalization/migration.sql":"bf672317df4f953d3ef55763589ae2d961673405532254de68940e139108bb33","drizzle/20260828024845_passkey-identity-step-up/migration.sql":"070aebf19da8eb13a3287a0530310a111c109fe4d44b478a71652acefff59aba","drizzle/20260828030204_face-enrollment-biometric-gateway/migration.sql":"fc244d51841bac5873f30fc70c943abac0470f5ae7381b155ba5115a38e13dcc","drizzle/20260828032347_aws-rekognition-biometric-engine/migration.sql":"5738c4a86b86cd588072f0c4bc5121a2ec496d47e483d153fa8a516295453591","drizzle/20260828103906_attendance-operations-supervised-exceptions/migration.sql":"2d011422410a7ee64c498a9f9e056331c536ee059e6dea2690c8564d70c1ec58","drizzle/20260829002614_equal_sabra/migration.sql":"743027f1b2f533b12a2ca498a6adaf108e6138785ddab46bc705fcc749ffb279","drizzle/20260829120249_school-scoped-card-templates/migration.sql":"4b80bbe96046dd86ff07ab727393df8a87db461817239cd3cbb12bf098db80a1","drizzle/20260830031700_school-real-world-foundation/migration.sql":"a5caed6e5750af3282570dc44c8c678dc31e46a7aabc269d57c76b03599b1b66","drizzle/20260830143000_card-production-authority/migration.sql":"ef109d255d53a2f6a7c729a9ab0d7bf93208f82f9957e9a87769bf6201893b44","drizzle/20260830153500_identity-card-lifecycle-authority/migration.sql":"b6f3c065c9055b65f6669afb3e6f567612764bc0bf4653ee91b5a36994df9a8d","drizzle/20260831064829_post-migration19-snapshot-baseline/migration.sql":"63e0a9f759662885c6a1d350596b957c6765d0ded53467f4475a8ebcfd78f9a6","drizzle/20260831064909_teacher-my-class-assignment/migration.sql":"d0f080bc0bd5256416d1dc61e74a4cf1bd5e7fa2caa9b9e7f28fe44d2d8f4f27","drizzle/20260901081825_attendance-readiness-card-replacement/migration.sql":"085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b","drizzle/20260902190300_wave1_transport_casa_internal/migration.sql":"5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3","drizzle/20260902201500_wave2_structure_audit/migration.sql":"96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f","drizzle/20260905030000_internal_face_authority/migration.sql":"cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7","drizzle/20260907043140_attendance-session-reopen/migration.sql":"881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd","drizzle/20260907105900_attendance-session-event-stream-multicycle/migration.sql":"bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4","drizzle/20260908135855_attendance-session-policy-rebind/migration.sql":"7791abd6bcf90d2038e434fb7e6334d98a38d19c9f14c1f2871d03f27e498681"}
'@ | ConvertFrom-Json | ConvertTo-StringHashtable

$PayloadManifest = @'
{"drizzle/20260909020000_pass-a-enum-expansion/migration.sql":"cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11","drizzle/20260909020000_pass-a-enum-expansion/snapshot.json":"416ec7cae9e355cfe7efc8c146dbd18f57b1762d8500a13d94b7b75541594db9","drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql":"5eaf2d61e0e68ee0eec0911630bf3ea42185fc8548b0c3281fcc5644a630e984","drizzle/20260909020500_pass-a-handover-attendance-state/snapshot.json":"a68e2d14eb825fa82b9b8979b88f0bb3363bdbac58ee0b7eb55cb92ae91626e7","scripts/pass-a-selftest.ts":"5aeb3e9d36341ffadf68ec1d340f142d0e18307f3572346f0900aeac11ad03aa","src/app/api/internal/card-production/templates/route.ts":"4d555243e647f41dc593b33f0e77cf54d10ad1d20829b35cf094f4ae41cdf0a0","src/app/api/internal/onboarding/schools/[schoolId]/academic-options/route.ts":"3bffa0153e54b80aa701eb65698521c5411ef15a1615fe4d711b857cef551778","src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/enrollment/route.ts":"4c88bb5c8c14557fd43a849a64c3a2f46007dc179b399b2bbee90670662fcd5f","src/app/api/schools/[slug]/attendance/card-exceptions/[studentId]/route.ts":"facfc64a1a670c5149eb4b13bcabfca208b5cf1a9ae8af1ee952bdda977af772","src/app/api/schools/[slug]/attendance/first-card-exceptions/[studentId]/route.ts":"90fdba8bd027a59139fd0afcfdb608830254afb702a8511032ebf1f2565ca090","src/app/api/schools/[slug]/attendance/lifecycle/route.ts":"6caf76298eb24fb4654217274b239c51fd4c87efcda3c7d31e12625c0c2f2944","src/app/api/schools/[slug]/attendance/supervised-late-arrivals/[studentId]/route.ts":"ff03c15701af7138bb3885a50d370de2c1386aba9188d30f80be4d7f9a64cb18","src/app/api/schools/[slug]/registry/students/[studentId]/arrival-method/route.ts":"5517695f9c2d4e5816c5e82c5cca68e29bc265d8f7396d080ebc297618602cd1","src/app/api/schools/[slug]/registry/students/[studentId]/cards/[cardId]/activate/route.ts":"59f9143f1c57584c73ed1329ac1d6c0080947a3e7035d955daf97284c601a36c","src/app/internal/onboarding/onboarding-client.tsx":"74eccdb818be4951684fe65c179f1a2bb80be7f0b969b343d2de075a219e3b9f","src/app/schools/[slug]/attendance/attendance-client.tsx":"04ef274534fdc2c77ecd3be8a8ca65beb695b9180f51088710e17b26b83d05b9","src/app/schools/[slug]/attendance/page.tsx":"1971b15fb83f20d67c10b1413054654ffa91b653bae29538f09ada3985df799e","src/app/schools/[slug]/registry/student-cards.tsx":"e6cae0450bd18b82e646cd0c3f22279a8b09710bbba4e1fbe5fd1b4f88f66e9a","src/app/schools/[slug]/technician/attendance/page.tsx":"e642b50e0166e198d0e567db7c71ee4493d026a660a69152535c0b5899a9c7e9","src/app/schools/[slug]/technician/attendance/technician-attendance-client.tsx":"1105dacd04c67b6e6b9165227c27c967cbe316da30247a5bf302e4e7d33ee1da","src/db/schema/attendance-readiness-enums.ts":"3d7b89656c774daa46d30c9d3a9c68c1ef9285e9a3a283543082a5a08dfc8b92","src/db/schema/attendance-readiness.ts":"2f3e513a21a3dcefdfb1a5f9224722ba04b8cf793976d3a4c51d32c7779abc6d","src/db/schema/card-production.ts":"0f5438de141730ae4cce8c35a8cee693a6783a0f18402f0fa977f8fca672eb3b","src/db/schema/student-enums.ts":"d8206b6900ebf7ad812d65a0d5bd4c70cd50e15f4586703a8323ab853fc73eba","src/db/schema/student-identity.ts":"d1abbcda8b7312de43d54b1023fc1350f93ea95668ffacbf2b4fc72f3e74be8a","src/server/attendance/readiness.ts":"53d2293a7a980cf4ea71b56486192dff51ed8b69bb793394b2cd4a6e32fe18ab","src/server/attendance/supervised-arrival.ts":"6219cdf78ba5269a3026f13e22eaa88fcd7f170415899826be4db686a427a209","src/server/card-production/handover.ts":"d4494c05b3152c64b2f799fadcc76f200551e35c90fe8464c8c28516fd9dd09f","src/server/card-production/production.ts":"b6c7dbe3a578bc0effb4bcf37d410d25eaafe2c351fe7a3e62e95a2dcb16ab57","src/server/card-production/render.ts":"40551fcc8229c416089e75872e364a1edaf79ddc5e695542993f5426120a1208","src/server/card-production/renewal-production.ts":"727534f212e35aefa58e3096f6618f16f72c7258e2093abd664f60843146c77d","src/server/card-production/template-layout.ts":"8775abe86433e52d18efe53beccf46e45e810fcc32ab5f7ac327c9d38960115c","src/server/internal/onboarding.ts":"b8ddbb9e66781e74f942b616f1d67bdc5acee4dadb800df67c4c7abfa8c93c22","src/server/school-operations/progression.ts":"be209773078201502f225244d62517a32adaeddce077537419b67118c335c8bd"}
'@ | ConvertFrom-Json | ConvertTo-StringHashtable

$NewPaths = @'
["drizzle/20260909020000_pass-a-enum-expansion/migration.sql","drizzle/20260909020000_pass-a-enum-expansion/snapshot.json","drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql","drizzle/20260909020500_pass-a-handover-attendance-state/snapshot.json","scripts/pass-a-selftest.ts","src/app/api/schools/[slug]/attendance/first-card-exceptions/[studentId]/route.ts","src/app/api/schools/[slug]/attendance/supervised-late-arrivals/[studentId]/route.ts","src/app/api/schools/[slug]/registry/students/[studentId]/cards/[cardId]/activate/route.ts","src/server/attendance/supervised-arrival.ts","src/server/card-production/handover.ts"]
'@ | ConvertFrom-Json

function Abort([string]$Message) {
  throw "ABORTED: $Message"
}

function Repo-Path([string]$RelativePath) {
  $native = $RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)
  return Join-Path $script:RepoRoot $native
}

function Hash-Of([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Abort "Required file is missing: $Path"
  }
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
  $previousErrorActionPreference = $ErrorActionPreference
  $exitCode = $null
  $stdout = @()
  try {
    $ErrorActionPreference = "Continue"
    $stdout = @(& git -C $script:RepoRoot @Arguments 2> $stderrPath)
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  $stderr = @()
  try {
    if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
      $stderr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ })
    }
  }
  finally {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }

  if ($null -eq $exitCode) {
    Abort "git $($Arguments -join ' ') did not return an exit code."
  }
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
  $previousErrorActionPreference = $ErrorActionPreference
  $exitCode = $null
  try {
    $ErrorActionPreference = "Continue"
    & $Command
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($null -eq $exitCode) {
    Abort "$Label did not return an exit code."
  }
  if ($exitCode -ne 0) {
    Abort "$Label failed with exit code $exitCode."
  }
}

function Migration-Directories {
  return @(
    Get-ChildItem -LiteralPath (Repo-Path "drizzle") -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "migration.sql") -PathType Leaf } |
      Sort-Object Name
  )
}

function Assert-SetEqual([string[]]$Actual, [string[]]$Expected, [string]$Label) {
  $a = @($Actual | Sort-Object -Unique)
  $e = @($Expected | Sort-Object -Unique)
  $delta = @(Compare-Object -ReferenceObject $e -DifferenceObject $a)
  if ($delta.Count -gt 0) {
    Abort "$Label mismatch.`nExpected:`n$($e -join [Environment]::NewLine)`nFound:`n$($a -join [Environment]::NewLine)"
  }
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

  if ($scannerMatches.Count -ne 1) {
    Abort "Locked Scanner source hash resolved to $($scannerMatches.Count) tracked files; expected exactly 1."
  }
  if ($cssMatches.Count -ne 1) {
    Abort "Locked Scanner CSS hash resolved to $($cssMatches.Count) tracked files; expected exactly 1."
  }

  return @{
    Scanner = $scannerMatches[0]
    ScannerCss = $cssMatches[0]
  }
}

function Write-ProbeScript([string]$Path) {
  $probe = @'
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const repo = process.argv[2];
const expectedStage = Number(process.argv[3]);
const expectedHost = process.argv[4];

if (![28, 29, 30].includes(expectedStage)) {
  throw new Error(`Invalid expected stage: ${expectedStage}`);
}

config({ path: join(repo, ".env.local"), quiet: true });
config({ path: join(repo, ".env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const parsed = new URL(databaseUrl);
const actualHost = parsed.hostname.toLowerCase();
if (actualHost !== expectedHost.toLowerCase()) {
  throw new Error(`DEVELOPMENT HOST GUARD FAILED. Expected ${expectedHost}; found ${actualHost}.`);
}

const sql = neon(databaseUrl);

const migrationTable = await sql`
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
  ) as exists
`;
if (!migrationTable[0]?.exists) {
  throw new Error("drizzle.__drizzle_migrations does not exist.");
}

const rows = await sql`
  select id, hash, created_at
  from drizzle.__drizzle_migrations
  order by id
`;

const migrationDirs = readdirSync(join(repo, "drizzle"))
  .filter((name) => {
    const p = join(repo, "drizzle", name);
    return /^\d{14}_.+/.test(name)
      && statSync(p).isDirectory()
      && statSync(join(p, "migration.sql")).isFile();
  })
  .sort();

if (migrationDirs.length !== 30) {
  throw new Error(`Expected exactly 30 local migration folders; found ${migrationDirs.length}.`);
}

const local = migrationDirs.map((name) => {
  const migrationPath = join(repo, "drizzle", name, "migration.sql");
  const bytes = readFileSync(migrationPath);
  return {
    name,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
});

if (rows.length !== expectedStage) {
  throw new Error(`Development migration history count mismatch. Expected ${expectedStage}; found ${rows.length}.`);
}

const expectedHashes = new Set(local.slice(0, expectedStage).map((m) => m.hash));
const actualHashes = new Set(rows.map((r) => String(r.hash).toLowerCase()));

if (actualHashes.size !== expectedHashes.size) {
  throw new Error(`Development migration hash set cardinality mismatch at stage ${expectedStage}.`);
}
for (const hash of expectedHashes) {
  if (!actualHashes.has(hash)) {
    const migration = local.find((m) => m.hash === hash);
    throw new Error(`Development migration history is missing local migration ${migration?.name ?? hash}.`);
  }
}

const identityStatusValues = await sql`
  select e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'student_identity_card_status'
`;
const identityEventValues = await sql`
  select e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'student_identity_card_event_type'
`;
const lifecycleEventValues = await sql`
  select e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'school_attendance_lifecycle_event_type'
`;

const identityStatuses = new Set(identityStatusValues.map((r) => r.enumlabel));
const identityEvents = new Set(identityEventValues.map((r) => r.enumlabel));
const lifecycleEvents = new Set(lifecycleEventValues.map((r) => r.enumlabel));

const enumFlags = [
  identityStatuses.has("READY_FOR_ACTIVATION"),
  identityEvents.has("ACTIVATED"),
  lifecycleEvents.has("RESUME_SCHEDULED"),
  lifecycleEvents.has("RESUME_SCHEDULE_CANCELLED"),
];
const anyPassAEnum = enumFlags.some(Boolean);
const enumReady = enumFlags.every(Boolean);

const structural = await sql`
  select
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='school_attendance_lifecycles'
        and column_name='scheduled_resume_at'
    ) as scheduled_resume_at,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='school_attendance_lifecycles'
        and column_name='scheduled_resume_by_membership_id'
    ) as scheduled_resume_by,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='school_attendance_lifecycles'
        and column_name='scheduled_resume_reason'
    ) as scheduled_resume_reason,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='school_attendance_lifecycle_events'
        and column_name='scheduled_for'
    ) as scheduled_for,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='student_arrival_method_assignments'
        and column_name='assigned_by_internal_membership_id'
    ) as arrival_internal_actor,
    to_regclass('public.student_first_card_attendance_exceptions') is not null as first_card_table,
    to_regclass('public.student_supervised_late_arrivals') is not null as supervised_late_table,
    to_regclass('public.student_identity_cards_one_pending_activation_per_student_idx') is not null as pending_card_index
`;
const s = structural[0];
const structuralFlags = [
  s?.scheduled_resume_at,
  s?.scheduled_resume_by,
  s?.scheduled_resume_reason,
  s?.scheduled_for,
  s?.arrival_internal_actor,
  s?.first_card_table,
  s?.supervised_late_table,
  s?.pending_card_index,
].map(Boolean);
const anyStructural = structuralFlags.some(Boolean);
const structuralReady = structuralFlags.every(Boolean);

if (expectedStage === 28) {
  if (anyPassAEnum) {
    throw new Error("Pass A enum drift is already present while migration history says 28.");
  }
  if (anyStructural) {
    throw new Error("Pass A structural objects are already present while migration history says 28.");
  }
}

if (expectedStage === 29) {
  if (!enumReady) {
    throw new Error("Migration 29 is recorded but its enum expansion is incomplete.");
  }
  if (anyStructural) {
    throw new Error("Migration 30 structures exist while Development is expected at migration 29.");
  }
}

if (expectedStage === 30) {
  if (!enumReady) {
    throw new Error("Pass A enum expansion is incomplete after migration 30.");
  }
  if (!structuralReady) {
    throw new Error("Pass A structural migration is incomplete after migration 30.");
  }

  const statusDefault = await sql`
    select column_default
    from information_schema.columns
    where table_schema='public'
      and table_name='student_identity_cards'
      and column_name='status'
  `;
  if (!String(statusDefault[0]?.column_default ?? "").includes("READY_FOR_ACTIVATION")) {
    throw new Error("student_identity_cards.status default is not READY_FOR_ACTIVATION.");
  }

  const arrivalNullability = await sql`
    select is_nullable
    from information_schema.columns
    where table_schema='public'
      and table_name='student_arrival_method_assignments'
      and column_name='assigned_by_membership_id'
  `;
  if (arrivalNullability[0]?.is_nullable !== "YES") {
    throw new Error("student_arrival_method_assignments.assigned_by_membership_id is not nullable.");
  }

  const constraints = await sql`
    select c.conname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
      and c.conname in (
      'school_attendance_lifecycles_scheduled_resume_by_fk',
      'school_attendance_lifecycles_scheduled_resume_actor_check',
      'school_attendance_lifecycles_scheduled_resume_status_check',
      'school_attendance_lifecycles_scheduled_resume_reason_check',
      'student_arrival_method_assignments_internal_actor_fk',
      'student_arrival_method_assignments_actor_check',
      'student_first_card_attendance_exceptions_student_fk',
      'student_first_card_attendance_exceptions_card_fk',
      'student_first_card_attendance_exceptions_session_fk',
      'student_first_card_attendance_exceptions_record_fk',
      'student_first_card_attendance_exceptions_verifier_fk',
      'student_supervised_late_arrivals_branch_fk',
      'student_supervised_late_arrivals_student_fk',
      'student_supervised_late_arrivals_session_fk',
      'student_supervised_late_arrivals_record_fk',
      'student_supervised_late_arrivals_verifier_fk'
    )
  `;
  if (constraints.length !== 16) {
    throw new Error(`Pass A constraint set incomplete; expected 16, found ${constraints.length}.`);
  }

  const newRows = await sql`
    select
      (select count(*)::int from student_first_card_attendance_exceptions) as first_card_rows,
      (select count(*)::int from student_supervised_late_arrivals) as supervised_late_rows,
      (select count(*)::int from school_attendance_lifecycles where scheduled_resume_at is not null) as scheduled_resume_rows,
      (select count(*)::int from student_arrival_method_assignments where assigned_by_internal_membership_id is not null) as internal_actor_rows,
      (select count(*)::int from student_identity_cards where status = 'READY_FOR_ACTIVATION') as ready_for_activation_rows
  `;

  const counts = newRows[0];
  if (Number(counts?.first_card_rows ?? -1) !== 0) {
    throw new Error("Migration unexpectedly created first-card exception data.");
  }
  if (Number(counts?.supervised_late_rows ?? -1) !== 0) {
    throw new Error("Migration unexpectedly created supervised-late-arrival data.");
  }
  if (Number(counts?.scheduled_resume_rows ?? -1) !== 0) {
    throw new Error("Migration unexpectedly populated scheduled resume data.");
  }
  if (Number(counts?.internal_actor_rows ?? -1) !== 0) {
    throw new Error("Migration unexpectedly populated internal arrival actors.");
  }
  if (Number(counts?.ready_for_activation_rows ?? -1) !== 0) {
    throw new Error("Migration unexpectedly backfilled existing cards to READY_FOR_ACTIVATION.");
  }
}

const info = await sql`
  select current_database() as database_name, current_user as database_user
`;

console.log(`  Development host: ${actualHost}`);
console.log(`  database: ${info[0]?.database_name ?? "unknown"}`);
console.log(`  migration history: ${rows.length} / VERIFIED`);
if (expectedStage >= 29) console.log("  Pass A enum expansion: VERIFIED");
if (expectedStage >= 30) {
  console.log("  Pass A structural schema: VERIFIED");
  console.log("  existing application data: UNCHANGED BY MIGRATION / VERIFIED");
}
'@

  [IO.File]::WriteAllText(
    $Path,
    $probe,
    (New-Object System.Text.UTF8Encoding($false))
  )
}

function Invoke-DevelopmentProbe([string]$ProbePath, [int]$ExpectedStage) {
  Invoke-NativeChecked "Development read-only probe (stage $ExpectedStage)" {
    & node $ProbePath $script:RepoRoot ([string]$ExpectedStage) $ExpectedDevelopmentHost
  }
}

function New-IsolatedMigrationConfig(
  [string]$ConfigPath,
  [string]$MigrationOut
) {
  if ($MigrationOut.Contains('"')) {
    Abort "Temporary migration path contains an unsupported quote character."
  }
  $out = $MigrationOut -replace '\\', '/'
  $content = @"
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const parsed = new URL(databaseUrl);
if (parsed.hostname.toLowerCase() !== "$ExpectedDevelopmentHost") {
  throw new Error(
    "DEVELOPMENT HOST GUARD FAILED. Expected $ExpectedDevelopmentHost; found " + parsed.hostname
  );
}

export default defineConfig({
  out: "$out",
  dialect: "postgresql",
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  dbCredentials: {
    url: databaseUrl,
  },
});
"@

  [IO.File]::WriteAllText(
    $ConfigPath,
    $content,
    (New-Object System.Text.UTF8Encoding($false))
  )
}

function Copy-MigrationSet([int]$Count, [string]$Destination) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $dirs = @(Migration-Directories)
  if ($dirs.Count -ne $ExpectedMigrationCount) {
    Abort "Expected $ExpectedMigrationCount migration folders, found $($dirs.Count)."
  }
  foreach ($dir in @($dirs | Select-Object -First $Count)) {
    Copy-Item -LiteralPath $dir.FullName -Destination (Join-Path $Destination $dir.Name) -Recurse -Force
  }
}

function Invoke-DrizzleMigrate([string]$Label, [string]$ConfigPath) {
  Invoke-NativeChecked $Label {
    & npx drizzle-kit migrate --config $ConfigPath
  }
}

try {
  Write-Host "CASA School - Pass A Development Migration 29 + 30 V1"
  Write-Host "Development database only."
  Write-Host "Migration 29 and 30 are applied in separate Drizzle invocations/transactions."
  Write-Host "No Staging, Production, AWS, or Scanner mutation."
  Write-Host ""

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Abort "git is not available." }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Abort "npm is not available." }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Abort "npx is not available." }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Abort "node is not available." }

  $resolved = (Resolve-Path -LiteralPath $RepoRoot).Path
  $top = Git-Text @("rev-parse", "--show-toplevel")
  $topResolved = (Resolve-Path -LiteralPath $top).Path
  if ($resolved.TrimEnd([char[]]"\/") -ne $topResolved.TrimEnd([char[]]"\/")) {
    Abort "Run this script from the CASA repository root."
  }
  $script:RepoRoot = $topResolved

  Write-Host "==> Re-proving exact green Pass A source state"
  $branch = Git-Text @("branch", "--show-current")
  $head = Git-Text @("rev-parse", "--short=7", "HEAD")
  if ($branch -ne $ExpectedBranch) { Abort "Expected branch $ExpectedBranch, found $branch." }
  if ($head -ne $ExpectedHead) { Abort "Expected HEAD $ExpectedHead, found $head." }

  Assert-Hash "package.json" $PackageJsonHash
  Assert-Hash "package-lock.json" $PackageLockHash
  Assert-Hash "drizzle.config.ts" $DrizzleConfigHash

  foreach ($relative in ($MigrationManifest.Keys | Sort-Object)) {
    Assert-Hash $relative ([string]$MigrationManifest[$relative])
  }
  foreach ($relative in ($PayloadManifest.Keys | Sort-Object)) {
    Assert-Hash $relative ([string]$PayloadManifest[$relative])
  }

  $migrationDirs = @(Migration-Directories)
  if ($migrationDirs.Count -ne $ExpectedMigrationCount) {
    Abort "Expected $ExpectedMigrationCount migration folders, found $($migrationDirs.Count)."
  }
  if ($migrationDirs[28].Name -ne $PassA29Folder -or $migrationDirs[29].Name -ne $PassA30Folder) {
    Abort "Migration 29/30 ordering drift."
  }

  $expectedModified = @(
    $PayloadManifest.Keys |
      Where-Object { $NewPaths -notcontains $_ } |
      Sort-Object
  )
  $actualModified = @(
    Git-Lines @("diff", "--name-only", "HEAD", "--") |
      Where-Object { $_ } |
      Sort-Object
  )
  Assert-SetEqual $actualModified $expectedModified "Tracked Pass A source drift"

  $actualProductUntracked = @(
    Git-Lines @("ls-files", "--others", "--exclude-standard") |
      Where-Object {
        $_ -like "src/*" -or
        $_ -like "scripts/*" -or
        $_ -like "drizzle/*"
      } |
      Sort-Object
  )
  Assert-SetEqual $actualProductUntracked @($NewPaths | Sort-Object) "Untracked Pass A product paths"

  [void](Git-Lines @("diff", "--check", "HEAD", "--"))

  $scanner = Resolve-ScannerTrustPaths
  Write-Host "  branch/head: $branch/$head"
  Write-Host "  Pass A payload: 34 / exact hashes verified"
  Write-Host "  migrations: 30 / exact hashes verified"
  Write-Host "  Scanner: byte-for-byte locked"
  Write-Host "  git diff --check: passed"

  Write-Host ""
  Write-Host "==> Re-running source gates before any database mutation"
  Push-Location $script:RepoRoot
  try {
    Invoke-NativeChecked "npm run typecheck" { & npm run typecheck }
    Invoke-NativeChecked "npm run scanner:selftest" { & npm run scanner:selftest }
    Invoke-NativeChecked "npm run card:selftest" { & npm run card:selftest }
    Invoke-NativeChecked "Pass A source contract self-test" { & npx tsx scripts/pass-a-selftest.ts }
  }
  finally {
    Pop-Location
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupRoot = Join-Path (Repo-Path ".casa-backups") "pass-a-dev-migrations-$stamp"
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Copy-Item -LiteralPath (Repo-Path "drizzle/$PassA29Folder") -Destination (Join-Path $backupRoot $PassA29Folder) -Recurse -Force
  Copy-Item -LiteralPath (Repo-Path "drizzle/$PassA30Folder") -Destination (Join-Path $backupRoot $PassA30Folder) -Recurse -Force

  $probePath = Join-Path $backupRoot "pass-a-development-probe.mjs"
  Write-ProbeScript $probePath

  Write-Host ""
  Write-Host "==> Read-only Development database authority probe"
  # Determine current safe state without displaying DATABASE_URL credentials.
  $stateProbePath = Join-Path $backupRoot "pass-a-state-probe.mjs"
  $stateProbe = @'
import { config } from "dotenv";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const repo = process.argv[2];
const expectedHost = process.argv[3];
config({ path: join(repo, ".env.local"), quiet: true });
config({ path: join(repo, ".env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
const parsed = new URL(databaseUrl);
if (parsed.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
  throw new Error(`DEVELOPMENT HOST GUARD FAILED. Expected ${expectedHost}; found ${parsed.hostname}.`);
}
const sql = neon(databaseUrl);
const rows = await sql`select hash from drizzle.__drizzle_migrations order by id`;
const hashes = rows.map((r) => String(r.hash).toLowerCase());
const h29 = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11";
const h30 = "5eaf2d61e0e68ee0eec0911630bf3ea42185fc8548b0c3281fcc5644a630e984";

let stage;
if (rows.length === 28 && !hashes.includes(h29) && !hashes.includes(h30)) stage = 28;
else if (rows.length === 29 && hashes.includes(h29) && !hashes.includes(h30)) stage = 29;
else if (rows.length === 30 && hashes.includes(h29) && hashes.includes(h30)) stage = 30;
else throw new Error(`Unexpected Development migration state: count=${rows.length}, passA29=${hashes.includes(h29)}, passA30=${hashes.includes(h30)}`);

console.log(stage);
'@
  [IO.File]::WriteAllText(
    $stateProbePath,
    $stateProbe,
    (New-Object System.Text.UTF8Encoding($false))
  )

  $stderrPath = [IO.Path]::GetTempFileName()
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $stateOutput = @(& node $stateProbePath $script:RepoRoot $ExpectedDevelopmentHost 2> $stderrPath)
    $stateExit = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $stateErr = @()
  if (Test-Path -LiteralPath $stderrPath) {
    $stateErr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue)
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
  if ($stateExit -ne 0) {
    Abort "Development state probe failed.`n$($stateErr -join [Environment]::NewLine)"
  }
  $stageLines = @(
    $stateOutput |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ -match '^(28|29|30)$' }
  )
  if ($stageLines.Count -ne 1) {
    Abort "Development state probe returned an ambiguous stage.`nOutput:`n$($stateOutput -join [Environment]::NewLine)"
  }
  $currentStage = [int]$stageLines[0]
  Invoke-DevelopmentProbe $probePath $currentStage

  if ($currentStage -eq 30) {
    Write-Host ""
    Write-Host "PASS A DEVELOPMENT MIGRATIONS ALREADY GREEN."
    Write-Host "  migrations applied: 30 / VERIFIED"
    Write-Host "  Development schema: PASS A COMPLETE"
    Write-Host "  Staging/Production mutation: NO"
    Write-Host "  AWS mutation: NO"
    Write-Host "  Scanner mutation: NO"
    exit 0
  }

  $set29 = Join-Path $backupRoot "isolated-drizzle-through-29"
  $set30 = Join-Path $backupRoot "isolated-drizzle-through-30"
  $config29 = Join-Path $backupRoot "drizzle-pass-a-29.config.ts"
  $config30 = Join-Path $backupRoot "drizzle-pass-a-30.config.ts"

  Copy-MigrationSet 29 $set29
  Copy-MigrationSet 30 $set30
  New-IsolatedMigrationConfig $config29 $set29
  New-IsolatedMigrationConfig $config30 $set30

  Push-Location $script:RepoRoot
  try {
    if ($currentStage -eq 28) {
      Write-Host ""
      Write-Host "==> Applying Development migration 29 ONLY"
      Write-Host "  $PassA29Folder"
      try {
        Invoke-DrizzleMigrate "Development migration 29" $config29
      }
      catch {
        Write-Host ""
        Write-Host "==> Migration 29 failed; proving Development remained at migration 28"
        try { Invoke-DevelopmentProbe $probePath 28 } catch { Write-Host "  read-only recovery proof also failed: $($_.Exception.Message)" }
        throw
      }

      Write-Host ""
      Write-Host "==> Re-proving committed migration 29 before migration 30"
      Invoke-DevelopmentProbe $probePath 29
      $currentStage = 29
    }

    if ($currentStage -eq 29) {
      Write-Host ""
      Write-Host "==> Applying Development migration 30 ONLY"
      Write-Host "  $PassA30Folder"
      try {
        Invoke-DrizzleMigrate "Development migration 30" $config30
      }
      catch {
        Write-Host ""
        Write-Host "==> Migration 30 failed; proving migration 29 remains the committed safe boundary"
        try { Invoke-DevelopmentProbe $probePath 29 } catch { Write-Host "  read-only recovery proof also failed: $($_.Exception.Message)" }
        throw
      }

      Write-Host ""
      Write-Host "==> Final read-only Development Pass A schema proof"
      Invoke-DevelopmentProbe $probePath 30
      $currentStage = 30
    }
  }
  finally {
    Pop-Location
  }

  Assert-Hash $scanner.Scanner $ScannerHash
  Assert-Hash $scanner.ScannerCss $ScannerCssHash
  foreach ($relative in ($PayloadManifest.Keys | Sort-Object)) {
    Assert-Hash $relative ([string]$PayloadManifest[$relative])
  }

  Write-Host ""
  Write-Host "PASS A DEVELOPMENT MIGRATION 29 + 30 PASSED."
  Write-Host "  source authority: main/a7aa668 + exact Pass A postimages"
  Write-Host "  Development migrations: 30 / VERIFIED"
  Write-Host "  migration 29: APPLIED + COMMITTED"
  Write-Host "  migration 30: APPLIED + COMMITTED"
  Write-Host "  Pass A schema invariants: VERIFIED"
  Write-Host "  existing application data mutated by Pass A migration: NO"
  Write-Host "  Scanner mutation: NO"
  Write-Host "  AWS mutation: NO"
  Write-Host "  Staging mutation: NO"
  Write-Host "  Production mutation: NO"
  Write-Host "  evidence backup: $backupRoot"
  Write-Host ""
  Write-Host "Next: paste this complete output back into ChatGPT. Do not touch Staging yet."
}
catch {
  Write-Error $_
  exit 1
}
