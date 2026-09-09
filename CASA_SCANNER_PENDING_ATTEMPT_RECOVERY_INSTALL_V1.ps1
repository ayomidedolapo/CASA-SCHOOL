param(
  [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
  [string]$AttemptId = "c3609f74-7abe-4e33-9f50-ce0a33664e16"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedMigrationCount = 30
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedScannerHash = "91acc931ed3e2acd8bd73c3b2430b4da5605a95ed27926b5c05dffe33e9fc167"
$ExpectedScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$ExpectedInstallControlHash = "7d7cf5f90474a3075544307998929fabb0344bdf73f6d2d591d6be82a530a6e9"
$ExpectedAwsLivenessHash = "a1bd8db909b88ba9f0c4f3e03199ad24521acb161e84b49bb9ca0f54cc451a2f"
$ExpectedMigration29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$ExpectedMigration30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$ScannerRelative = "src\app\scanner\scanner-client.tsx"
$ScannerCssRelative = "src\app\scanner\scanner.module.css"
$InstallControlRelative = "src\app\scanner\scanner-install-control.tsx"
$AwsRelative = "src\server\biometrics\aws-liveness.ts"
$PendingRouteRelative = "src\app\api\terminal\attempts\pending\route.ts"
$SelftestRelative = "scripts\scanner-pending-attempt-recovery-selftest.ts"

$Evidence = $null
$PatcherPath = $null
$DbProbePath = $null
$Backups = @{}
$WriteStarted = $false
$Verified = $false

function Stop-Phase([string]$Message) {
  throw "ABORTED: $Message"
}

function Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Stop-Phase "Required file missing: $Path"
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir -PathType Container)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Run-NpmIfPresent([string]$Name) {
  $pkg = Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
  $names = @($pkg.scripts.PSObject.Properties.Name)
  if ($names -notcontains $Name) {
    Write-Host "  npm run ${Name}: SKIPPED / script not present" -ForegroundColor Yellow
    return
  }
  Write-Host "  npm run $Name"
  & npm.cmd run $Name
  if ($LASTEXITCODE -ne 0) {
    Stop-Phase "npm run $Name failed with exit code $LASTEXITCODE."
  }
}

function Run-DbProbe([string]$Label) {
  $oldAttempt = $env:CASA_RECOVERY_ATTEMPT_ID
  $oldNodeOptions = $env:NODE_OPTIONS
  try {
    $env:CASA_RECOVERY_ATTEMPT_ID = $AttemptId
    $requiredNode = "--dns-result-order=ipv4first --no-network-family-autoselection"
    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
      $env:NODE_OPTIONS = $requiredNode
    }
    elseif ($env:NODE_OPTIONS -notmatch "dns-result-order=ipv4first") {
      $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) $requiredNode"
    }
    $output = @(& node --env-file=.env.local $DbProbePath 2>&1)
    if ($LASTEXITCODE -ne 0) {
      $output | ForEach-Object { Write-Host $_ }
      Stop-Phase "$Label Development read-only probe failed."
    }
    $lines = @($output | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    return ($lines[-1] | ConvertFrom-Json)
  }
  finally {
    if ($null -ne $oldAttempt) { $env:CASA_RECOVERY_ATTEMPT_ID = $oldAttempt } else { Remove-Item Env:CASA_RECOVERY_ATTEMPT_ID -ErrorAction SilentlyContinue }
    if ($null -ne $oldNodeOptions) { $env:NODE_OPTIONS = $oldNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
  }
}

Write-Host "CASA School - Scanner Pending Attempt Recovery Install V1" -ForegroundColor Green
Write-Host "Installs safe reload recovery for the exact pending Scanner attempt; source only."
Write-Host "Adds replay-safe liveness-start semantics so a lost response cannot strand an active AWS session."
Write-Host "No card scan. No Face Liveness session creation. No Development DB write. No attendance write."
Write-Host "No AWS IAM/resource mutation. No Staging/Production connection."
Write-Host "Attempt: $AttemptId"

try {
  Step "Re-proving exact V1R7 Development source authority"

  if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Stop-Phase "CASA repository not found."
  }
  Set-Location $ProjectRoot

  $branch = (& git branch --show-current).Trim()
  $head = (& git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { Stop-Phase "Unable to read Git checkpoint." }
  if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
    Stop-Phase "Expected $ExpectedBranch/$ExpectedHead; found $branch/$head."
  }

  $PackagePath = Join-Path $ProjectRoot "package.json"
  $ScannerPath = Join-Path $ProjectRoot $ScannerRelative
  $ScannerCssPath = Join-Path $ProjectRoot $ScannerCssRelative
  $InstallControlPath = Join-Path $ProjectRoot $InstallControlRelative
  $AwsPath = Join-Path $ProjectRoot $AwsRelative
  $PendingRoutePath = Join-Path $ProjectRoot $PendingRouteRelative
  $SelftestPath = Join-Path $ProjectRoot $SelftestRelative
  $Migration29Path = Join-Path $ProjectRoot "drizzle\20260909020000_pass-a-enum-expansion\migration.sql"
  $Migration30Path = Join-Path $ProjectRoot "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql"

  if ((Sha $PackagePath) -ne $ExpectedPackageHash) { Stop-Phase "package.json drift." }
  if ((Sha $ScannerPath) -ne $ExpectedScannerHash) { Stop-Phase "Simplified Scanner source drift." }
  if ((Sha $ScannerCssPath) -ne $ExpectedScannerCssHash) { Stop-Phase "Scanner CSS drift." }
  if ((Sha $InstallControlPath) -ne $ExpectedInstallControlHash) { Stop-Phase "Scanner install-control drift." }
  if ((Sha $AwsPath) -ne $ExpectedAwsLivenessHash) { Stop-Phase "AWS liveness source drift." }
  if ((Sha $Migration29Path) -ne $ExpectedMigration29Hash) { Stop-Phase "Migration 29 drift." }
  if ((Sha $Migration30Path) -ne $ExpectedMigration30Hash) { Stop-Phase "Migration 30 drift." }

  $migrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.casa-backups[\\/]' })
  if ($migrationFiles.Count -ne $ExpectedMigrationCount) { Stop-Phase "Expected 30 migrations; found $($migrationFiles.Count)." }

  if (Test-Path -LiteralPath $PendingRoutePath -PathType Leaf) { Stop-Phase "Pending-attempt route already exists; current source no longer matches this installer." }
  if (Test-Path -LiteralPath $SelftestPath -PathType Leaf) { Stop-Phase "Pending-attempt selftest already exists; current source no longer matches this installer." }

  $scannerBefore = [IO.File]::ReadAllText($ScannerPath)
  foreach ($marker in @("async function terminalFetch(", "const startFace", "FACE_RETRY", "Try face verification again", "FaceLivenessDetectorCore", "refreshTerminal", "readTerminalCredential")) {
    if (-not $scannerBefore.Contains($marker)) { Stop-Phase "Scanner lost required recovery marker: $marker" }
  }
  if ($scannerBefore.Contains("/api/terminal/attempts/pending") -or $scannerBefore.Contains("recoverPendingAttempt")) {
    Stop-Phase "Scanner already contains pending-attempt recovery semantics."
  }

  $awsBefore = [IO.File]::ReadAllText($AwsPath)
  foreach ($marker in @("startAwsVerificationLiveness", "LIVENESS_SESSION_ALREADY_ACTIVE", "issueAwsLivenessStreamingCredentials", "biometricLivenessSessions.expiresAt")) {
    if (-not $awsBefore.Contains($marker)) { Stop-Phase "AWS liveness source lost required marker: $marker" }
  }
  if ($awsBefore.Contains("LIVENESS_SESSION_EXPIRED") -and $awsBefore.Contains("activeSession.providerSessionId") -and $awsBefore.Contains("replayed:")) {
    Stop-Phase "AWS verification replay safety already appears installed; refusing double patch."
  }

  Write-Host "  branch/head:                 $branch/$head"
  Write-Host "  migrations:                  30 / VERIFIED"
  Write-Host "  V1R7 Scanner source:         EXACT / VERIFIED"
  Write-Host "  AWS liveness authority:      EXACT / VERIFIED"
  Write-Host "  pending recovery route:      ABSENT / EXPECTED"
  Write-Host "  same-attempt FACE_RETRY UI:  PRESENT"

  Step "Reading exact pending attempt before source writes"

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Evidence = Join-Path $ProjectRoot ".casa-backups\scanner-pending-attempt-recovery-install-v1-$stamp"
  New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
  $DbProbePath = Join-Path $Evidence "pending-attempt-readonly.mjs"

  $dbProbe = @'
import { neon } from "@neondatabase/serverless";
const raw = process.env.DATABASE_URL;
const attemptId = process.env.CASA_RECOVERY_ATTEMPT_ID;
const expectedHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech";
if (!raw || !attemptId) throw new Error("Diagnostic environment incomplete.");
const parsed = new URL(raw);
if (parsed.hostname !== expectedHost) throw new Error(`Refusing non-Development host: ${parsed.hostname}`);
const sql = neon(raw);
const migrations = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
const attempt = await sql`
  select a.id,a.school_id,a.session_id,a.terminal_id,a.student_id,a.operation::text as operation,
         a.card_result::text as card_result,a.time_result::text as time_result,
         a.face_result::text as face_result,a.liveness_result::text as liveness_result,
         a.outcome::text as outcome,a.reason_code,a.occurred_at,a.completed_at,
         s.attendance_date::text as attendance_date,s.status::text as session_status,s.closed_at
  from attendance_verification_attempts a
  join attendance_sessions s on s.school_id=a.school_id and s.id=a.session_id
  where a.id=${attemptId}::uuid
`;
const live = await sql`
  select id,status::text as status,purpose::text as purpose,provider,provider_session_id is not null as provider_session_present,
         expires_at,failure_code,completed_at,created_at
  from biometric_liveness_sessions
  where attempt_id=${attemptId}::uuid
  order by created_at,id
`;
const counts = await sql`
  select
    (select count(*)::int from student_attendance_records where source_attempt_id=${attemptId}::uuid) as attendance,
    (select count(*)::int from student_presence_events where attempt_id=${attemptId}::uuid) as presence,
    (select count(*)::int from biometric_verification_evidence where attempt_id=${attemptId}::uuid) as evidence
`;
const activeProfile = await sql`
  select count(*)::int as count from student_biometric_profiles p
  join attendance_verification_attempts a on a.school_id=p.school_id and a.student_id=p.student_id
  where a.id=${attemptId}::uuid and p.status='ACTIVE'
`;
const terminal = await sql`
  select count(*)::int as count from attendance_terminals t
  join attendance_verification_attempts a on a.school_id=t.school_id and a.terminal_id=t.id
  where a.id=${attemptId}::uuid and t.status='ACTIVE'
`;
const clock = (await sql`select (now() at time zone 'Africa/Lagos')::date::text as date,(now() at time zone 'Africa/Lagos')::time(0)::text as time`)[0];
console.log(JSON.stringify({host:parsed.hostname,migrations:Number(migrations[0]?.count??-1),attempt:attempt[0]??null,livenessSessions:live,protectedCounts:counts[0]??null,activeProfiles:Number(activeProfile[0]?.count??-1),activeTerminal:Number(terminal[0]?.count??-1),clock}));
'@
  Write-Utf8 $DbProbePath $dbProbe

  $Before = Run-DbProbe "Pre-install"
  $Before | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $Evidence "BEFORE.json") -Encoding UTF8

  if ([int]$Before.migrations -ne 30) { Stop-Phase "Development DB migration count drifted." }
  if ($null -eq $Before.attempt) { Stop-Phase "Exact pending attempt no longer exists." }
  if ([string]$Before.attempt.operation -ne "CHECK_IN" -or [string]$Before.attempt.card_result -ne "MATCHED" -or [string]$Before.attempt.face_result -ne "NOT_RUN" -or [string]$Before.attempt.liveness_result -ne "NOT_RUN" -or [string]$Before.attempt.outcome -ne "PENDING" -or $null -ne $Before.attempt.completed_at) {
    Stop-Phase "Exact attempt is no longer the authorized pending CHECK_IN state."
  }
  if ([string]$Before.attempt.session_status -ne "OPEN" -or $null -ne $Before.attempt.closed_at) {
    Stop-Phase "The attempt's attendance session is not OPEN; live retry is not authorized."
  }
  if ([string]$Before.attempt.attendance_date -ne [string]$Before.clock.date) {
    Stop-Phase "The pending attempt is not for today's Africa/Lagos attendance date."
  }
  if (@($Before.livenessSessions).Count -ne 0) { Stop-Phase "Attempt unexpectedly has a bound liveness session; this installer is for the proven zero-session state." }
  if ([int]$Before.protectedCounts.attendance -ne 0 -or [int]$Before.protectedCounts.presence -ne 0 -or [int]$Before.protectedCounts.evidence -ne 0) { Stop-Phase "Protected attendance state is not 0/0/0." }
  if ([int]$Before.activeProfiles -ne 1) { Stop-Phase "Expected exactly one ACTIVE biometric profile for the attempt student." }
  if ([int]$Before.activeTerminal -ne 1) { Stop-Phase "Attempt terminal is not ACTIVE." }

  Write-Host "  school-local date/time:       $($Before.clock.date) $($Before.clock.time)"
  Write-Host "  attempt:                      MATCHED / NOT_RUN / NOT_RUN / PENDING"
  Write-Host "  attempt session:              OPEN / TODAY"
  Write-Host "  bound liveness sessions:      0"
  Write-Host "  active biometric profile:     1 / VERIFIED"
  Write-Host "  active terminal:              1 / VERIFIED"
  Write-Host "  attendance/presence/evidence: 0/0/0"

  Step "Creating guarded source backup"
  foreach ($relative in @($AwsRelative,$ScannerRelative)) {
    $src = Join-Path $ProjectRoot $relative
    $safe = ($relative -replace '[\\/\[\]:]','_')
    $dst = Join-Path $Evidence ($safe + ".before")
    Copy-Item -LiteralPath $src -Destination $dst -Force
    $Backups[$relative] = $dst
  }
  Write-Host "  evidence/backup: $Evidence"

  Step "Installing replay-safe liveness start + pending-attempt reload recovery"
  $PatcherPath = Join-Path $Evidence "patch-pending-recovery.mjs"
  $patcher = @'
import fs from "node:fs";
const root = process.argv[2];
if (!root) throw new Error("Project root missing");
const path = (p) => `${root}/${p.replaceAll("\\","/")}`;
const awsPath = path("src/server/biometrics/aws-liveness.ts");
const scannerPath = path("src/app/scanner/scanner-client.tsx");
const pendingPath = path("src/app/api/terminal/attempts/pending/route.ts");
const selftestPath = path("scripts/scanner-pending-attempt-recovery-selftest.ts");
const read = p => fs.readFileSync(p,"utf8");
const write = (p,s) => { fs.mkdirSync(p.slice(0,p.lastIndexOf("/")),{recursive:true}); fs.writeFileSync(p,s,"utf8"); };
const fail = m => { throw new Error(m); };

let aws = read(awsPath);
const importMatch = aws.match(/import\s*\{([\s\S]*?)\}\s*from\s*"drizzle-orm";/);
if (!importMatch) fail("drizzle import not found in aws-liveness.ts");
if (!/\blte\b/.test(importMatch[1])) {
  if (!/\bgt,/.test(importMatch[1])) fail("gt import anchor missing in aws-liveness.ts");
  const replaced = importMatch[0].replace(/(\s+gt,)/, "$1\n  lte,");
  aws = aws.replace(importMatch[0], replaced);
}
const fnStart = aws.indexOf("export async function startAwsVerificationLiveness");
if (fnStart < 0) fail("startAwsVerificationLiveness not found");
const activeStart = aws.indexOf("  const activeSessions =", fnStart);
const sessionAnchor = aws.indexOf("  const session =\n    await createBoundLivenessSession({", fnStart);
if (activeStart < 0 || sessionAnchor < 0 || activeStart >= sessionAnchor) fail("verification active-session block not found");
const oldActive = aws.slice(activeStart, sessionAnchor);
for (const marker of ["LIVENESS_SESSION_ALREADY_ACTIVE","biometricLivenessSessions.expiresAt","\"CREATED\"","gt("]) {
  if (!oldActive.includes(marker)) fail(`verification active-session block missing ${marker}`);
}
if (oldActive.includes("replayed:") || oldActive.includes("activeSession.providerSessionId")) fail("replay-safe verification block already installed");
const newActive = `  const now =\n    new Date();\n\n  await db\n    .update(\n      biometricLivenessSessions,\n    )\n    .set({\n      status:\n        "EXPIRED",\n      failureCode:\n        "LIVENESS_SESSION_EXPIRED",\n      updatedAt:\n        now,\n    })\n    .where(\n      and(\n        eq(\n          biometricLivenessSessions.schoolId,\n          input.access.school.id,\n        ),\n        eq(\n          biometricLivenessSessions.attemptId,\n          input.attemptId,\n        ),\n        eq(\n          biometricLivenessSessions.purpose,\n          "VERIFICATION",\n        ),\n        eq(\n          biometricLivenessSessions.status,\n          "CREATED",\n        ),\n        lte(\n          biometricLivenessSessions.expiresAt,\n          now,\n        ),\n      ),\n    );\n\n  const activeSessions =\n    await db\n      .select({\n        id:\n          biometricLivenessSessions.id,\n        providerSessionId:\n          biometricLivenessSessions.providerSessionId,\n        expiresAt:\n          biometricLivenessSessions.expiresAt,\n      })\n      .from(\n        biometricLivenessSessions,\n      )\n      .where(\n        and(\n          eq(\n            biometricLivenessSessions.schoolId,\n            input.access.school.id,\n          ),\n          eq(\n            biometricLivenessSessions.attemptId,\n            input.attemptId,\n          ),\n          eq(\n            biometricLivenessSessions.purpose,\n            "VERIFICATION",\n          ),\n          eq(\n            biometricLivenessSessions.status,\n            "CREATED",\n          ),\n          gt(\n            biometricLivenessSessions.expiresAt,\n            now,\n          ),\n        ),\n      )\n      .limit(1);\n\n  const activeSession =\n    activeSessions[0];\n\n  if (activeSession) {\n    const credentials =\n      await issueAwsLivenessStreamingCredentials(\n        activeSession.providerSessionId,\n      );\n\n    return {\n      ok: true as const,\n      replayed:\n        true as const,\n      session: {\n        livenessSessionId:\n          activeSession.id,\n        providerSessionId:\n          activeSession.providerSessionId,\n        expiresAt:\n          activeSession.expiresAt,\n        streaming: {\n          region:\n            credentials.region,\n          accessKeyId:\n            credentials.accessKeyId,\n          secretAccessKey:\n            credentials.secretAccessKey,\n          sessionToken:\n            credentials.sessionToken,\n          expiration:\n            credentials.expiration,\n        },\n      },\n    };\n  }\n\n`;
aws = aws.slice(0,activeStart) + newActive + aws.slice(sessionAnchor);
if (aws.includes('"LIVENESS_SESSION_ALREADY_ACTIVE"')) fail("stranded-session 409 remains in aws-liveness.ts");
for (const marker of ["LIVENESS_SESSION_EXPIRED","activeSession.providerSessionId","replayed:","lte("]) if (!aws.includes(marker)) fail(`AWS postcondition missing ${marker}`);
write(awsPath,aws);

const pending = `import {\n  and,\n  desc,\n  eq,\n} from "drizzle-orm";\nimport {\n  NextRequest,\n  NextResponse,\n} from "next/server";\n\nimport { getDb } from "@/db";\nimport {\n  attendanceVerificationAttempts,\n} from "@/db/schema";\nimport {\n  attendanceNoStoreHeaders,\n  terminalUnauthorizedResponse,\n} from "@/server/attendance/http";\nimport {\n  authenticateTerminalRequest,\n} from "@/server/attendance/terminal-auth";\nimport {\n  getActiveTerminalSession,\n} from "@/server/attendance/terminal-session";\n\nexport const dynamic =\n  "force-dynamic";\n\nexport async function GET(\n  request:\n    NextRequest,\n) {\n  const access =\n    await authenticateTerminalRequest(\n      request,\n    );\n\n  if (!access) {\n    return terminalUnauthorizedResponse();\n  }\n\n  const active =\n    await getActiveTerminalSession(\n      access.school.id,\n      access.school.timezone,\n    );\n\n  if (!active.session) {\n    return NextResponse.json(\n      {\n        pending:\n          null,\n        duplicatePendingCount:\n          0,\n      },\n      {\n        headers:\n          attendanceNoStoreHeaders,\n      },\n    );\n  }\n\n  const db = getDb();\n  const rows =\n    await db\n      .select({\n        id:\n          attendanceVerificationAttempts.id,\n        operation:\n          attendanceVerificationAttempts.operation,\n        cardResult:\n          attendanceVerificationAttempts.cardResult,\n        timeResult:\n          attendanceVerificationAttempts.timeResult,\n        departureResult:\n          attendanceVerificationAttempts.departureResult,\n        outcome:\n          attendanceVerificationAttempts.outcome,\n        reasonCode:\n          attendanceVerificationAttempts.reasonCode,\n        completedAt:\n          attendanceVerificationAttempts.completedAt,\n        createdAt:\n          attendanceVerificationAttempts.createdAt,\n      })\n      .from(\n        attendanceVerificationAttempts,\n      )\n      .where(\n        and(\n          eq(\n            attendanceVerificationAttempts.schoolId,\n            access.school.id,\n          ),\n          eq(\n            attendanceVerificationAttempts.terminalId,\n            access.terminal.id,\n          ),\n          eq(\n            attendanceVerificationAttempts.sessionId,\n            active.session.id,\n          ),\n          eq(\n            attendanceVerificationAttempts.operation,\n            "CHECK_IN",\n          ),\n          eq(\n            attendanceVerificationAttempts.cardResult,\n            "MATCHED",\n          ),\n          eq(\n            attendanceVerificationAttempts.outcome,\n            "PENDING",\n          ),\n        ),\n      )\n      .orderBy(\n        desc(\n          attendanceVerificationAttempts.createdAt,\n        ),\n      )\n      .limit(10);\n\n  const latest = rows[0];\n\n  return NextResponse.json(\n    {\n      pending:\n        latest\n          ? {\n              attempt: {\n                id:\n                  latest.id,\n                operation:\n                  latest.operation,\n                cardResult:\n                  latest.cardResult,\n                timeResult:\n                  latest.timeResult,\n                departureResult:\n                  latest.departureResult,\n                outcome:\n                  latest.outcome,\n                reasonCode:\n                  latest.reasonCode,\n                completedAt:\n                  latest.completedAt,\n              },\n              student:\n                null,\n              replayed:\n                true,\n              requiresBiometric:\n                true,\n              requiresStaffAuthorization:\n                false,\n              classification:\n                null,\n            }\n          : null,\n      duplicatePendingCount:\n        rows.length,\n    },\n    {\n      headers:\n        attendanceNoStoreHeaders,\n    },\n  );\n}\n`;
if (fs.existsSync(pendingPath)) fail("pending route unexpectedly exists during patch");
write(pendingPath,pending);

let scanner = read(scannerPath);
if (scanner.includes("recoverPendingAttempt") || scanner.includes("/api/terminal/attempts/pending")) fail("scanner already contains pending recovery");
const tfStart = scanner.indexOf("async function terminalFetch(");
if (tfStart < 0) fail("terminalFetch helper not found");
const tfEnd = scanner.indexOf("\n}\n",tfStart);
if (tfEnd < 0) fail("terminalFetch helper end not found");
const insertAt = tfEnd + 3;
const retryHelper = `\nasync function terminalFetchWithRetry(\n  token: string,\n  input:\n    string,\n  init:\n    RequestInit = {},\n  maxAttempts =\n    3,\n): Promise<Response> {\n  let lastError:\n    unknown =\n      null;\n\n  for (\n    let attempt = 1;\n    attempt <= maxAttempts;\n    attempt++\n  ) {\n    try {\n      const response =\n        await terminalFetch(\n          token,\n          input,\n          init,\n        );\n\n      if (\n        ![500,502,503,504].includes(\n          response.status,\n        ) ||\n        attempt ===\n          maxAttempts\n      ) {\n        return response;\n      }\n    } catch (error) {\n      lastError =\n        error;\n      if (attempt === maxAttempts) {\n        throw error;\n      }\n    }\n\n    await new Promise<void>((resolve) => {\n      window.setTimeout(\n        resolve,\n        attempt * 500,\n      );\n    });\n  }\n\n  throw (\n    lastError instanceof Error\n      ? lastError\n      : new Error(\n          "CASA scanner request retry exhausted.",\n        )\n  );\n}\n`;
scanner = scanner.slice(0,insertAt) + retryHelper + scanner.slice(insertAt);

const startFaceStart = scanner.indexOf("  const startFace =");
const processCardStart = scanner.indexOf("  const processCard =",startFaceStart);
if (startFaceStart < 0 || processCardStart < 0) fail("startFace/processCard boundary not found");
let startFace = scanner.slice(startFaceStart,processCardStart);
const tfCalls = (startFace.match(/await terminalFetch\(/g) || []).length;
if (tfCalls !== 1 || !startFace.includes("/biometric/liveness/start")) fail(`startFace terminalFetch shape drifted (${tfCalls})`);
startFace = startFace.replace("await terminalFetch(","await terminalFetchWithRetry(");
scanner = scanner.slice(0,startFaceStart) + startFace + scanner.slice(processCardStart);

const refreshStart = scanner.indexOf("  const refreshTerminal =");
if (refreshStart < 0) fail("refreshTerminal callback not found");
const bootEffectStart = scanner.indexOf("  useEffect(",refreshStart);
if (bootEffectStart < 0) fail("scanner boot useEffect not found");
const recover = `  const recoverPendingAttempt =\n    useCallback(\n      async (\n        credential:\n          string,\n      ) => {\n        try {\n          const response =\n            await terminalFetchWithRetry(\n              credential,\n              "/api/terminal/attempts/pending",\n            );\n\n          if (!response.ok) {\n            return false;\n          }\n\n          const data =\n            await parseJson<{\n              pending:\n                ScannerAttemptResponse | null;\n              duplicatePendingCount:\n                number;\n            }>(\n              response,\n            );\n\n          if (\n            !data?.pending ||\n            !data.pending\n              .requiresBiometric\n          ) {\n            return false;\n          }\n\n          setCurrentAttempt(\n            data.pending,\n          );\n          setPhase(\n            "FACE_RETRY",\n          );\n          setMessage(\n            data.duplicatePendingCount > 1\n              ? "Pending face verification recovered. Continue with the latest face check; do not scan the card again."\n              : "Pending face verification recovered. Continue face verification without rescanning the card.",\n          );\n          return true;\n        } catch {\n          return false;\n        }\n      },\n      [],\n    );\n\n`;
scanner = scanner.slice(0,bootEffectStart) + recover + scanner.slice(bootEffectStart);

const bootStart = scanner.indexOf("  useEffect(",refreshStart);
const nextEffect = scanner.indexOf("  useEffect(",bootStart + 12);
const bootEnd = nextEffect > 0 ? nextEffect : scanner.indexOf("  const ",bootStart + 12);
if (bootEnd < 0) fail("boot effect end not found");
let boot = scanner.slice(bootStart,bootEnd);
const refreshNeedle = `          await refreshTerminal(\n            saved,\n          );`;
if (!boot.includes(refreshNeedle)) fail("saved-terminal refresh call not found in boot effect");
boot = boot.replace(refreshNeedle,`          const refreshed =\n            await refreshTerminal(\n              saved,\n            );\n\n          if (\n            !cancelled &&\n            refreshed?.session\n          ) {\n            await recoverPendingAttempt(\n              saved,\n            );\n          }`);
const depNeedle = `    [\n      refreshTerminal,\n    ],\n  );`;
if (!boot.includes(depNeedle)) fail("boot effect dependency list not found");
boot = boot.replace(depNeedle,`    [\n      refreshTerminal,\n      recoverPendingAttempt,\n    ],\n  );`);
scanner = scanner.slice(0,bootStart) + boot + scanner.slice(bootEnd);
for (const marker of ["terminalFetchWithRetry","recoverPendingAttempt","/api/terminal/attempts/pending","Pending face verification recovered.","FACE_RETRY","FaceLivenessDetectorCore"]) {
  if (!scanner.includes(marker)) fail(`scanner postcondition missing ${marker}`);
}
write(scannerPath,scanner);

const selftest = `import fs from "node:fs";\nconst aws=fs.readFileSync("src/server/biometrics/aws-liveness.ts","utf8");\nconst scanner=fs.readFileSync("src/app/scanner/scanner-client.tsx","utf8");\nconst pending=fs.readFileSync("src/app/api/terminal/attempts/pending/route.ts","utf8");\nfor(const m of ["LIVENESS_SESSION_EXPIRED","activeSession.providerSessionId","issueAwsLivenessStreamingCredentials(","replayed:","lte("]) if(!aws.includes(m)) throw new Error("AWS recovery marker missing: "+m);\nif(aws.includes('"LIVENESS_SESSION_ALREADY_ACTIVE"')) throw new Error("AWS liveness start still strands active sessions behind 409");\nfor(const m of ["terminalFetchWithRetry","recoverPendingAttempt","/api/terminal/attempts/pending","Pending face verification recovered.","FACE_RETRY","FaceLivenessDetectorCore"]) if(!scanner.includes(m)) throw new Error("Scanner recovery marker missing: "+m);\nfor(const m of ["authenticateTerminalRequest","getActiveTerminalSession",'"CHECK_IN"','"MATCHED"','"PENDING"',"desc(","duplicatePendingCount"]) if(!pending.includes(m)) throw new Error("Pending route marker missing: "+m);\nconsole.log("CASA Scanner pending-attempt recovery contract self-test passed.");\n`;
write(selftestPath,selftest);
console.log(JSON.stringify({awsSha256:null,scannerSha256:null,pendingRoute:true,selftest:true}));
'@
  Write-Utf8 $PatcherPath $patcher
  $WriteStarted = $true
  & node $PatcherPath $ProjectRoot
  if ($LASTEXITCODE -ne 0) { Stop-Phase "Guarded Node source patcher failed." }

  Write-Host "  AWS expired-session cleanup:      INSTALLED"
  Write-Host "  AWS live-session response replay: INSTALLED"
  Write-Host "  pending attempt route:            INSTALLED"
  Write-Host "  Scanner reload recovery:          INSTALLED"
  Write-Host "  card rescan requirement:          REMOVED FOR PENDING FACE RETRY"

  Step "Running source and domain regressions"
  & git diff --check
  if ($LASTEXITCODE -ne 0) { Stop-Phase "git diff --check failed." }

  & npx.cmd tsx $SelftestRelative
  if ($LASTEXITCODE -ne 0) { Stop-Phase "Focused pending-attempt recovery selftest failed." }

  foreach ($test in @("scanner:selftest","terminal:selftest","attendance:selftest","biometric:selftest","biometric-provider:selftest","aws-biometric:selftest","typecheck")) {
    Run-NpmIfPresent $test
  }

  if (Test-Path -LiteralPath (Join-Path $ProjectRoot "scripts\frontend-closure-selftest.ts") -PathType Leaf) {
    Write-Host "  frontend closure regression"
    & npx.cmd tsx "scripts\frontend-closure-selftest.ts"
    if ($LASTEXITCODE -ne 0) { Stop-Phase "Frontend closure regression failed." }
  }

  Step "Running production build"
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Stop-Phase "Production build failed." }

  Step "Re-proving protected boundaries and pending attempt"
  if ((Sha $PackagePath) -ne $ExpectedPackageHash) { Stop-Phase "package.json changed unexpectedly." }
  if ((Sha $ScannerCssPath) -ne $ExpectedScannerCssHash) { Stop-Phase "Scanner CSS changed unexpectedly." }
  if ((Sha $InstallControlPath) -ne $ExpectedInstallControlHash) { Stop-Phase "Scanner install control changed unexpectedly." }
  if ((Sha $Migration29Path) -ne $ExpectedMigration29Hash -or (Sha $Migration30Path) -ne $ExpectedMigration30Hash) { Stop-Phase "Pass A migrations changed unexpectedly." }
  $migrationFilesAfter = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.casa-backups[\\/]' })
  if ($migrationFilesAfter.Count -ne 30) { Stop-Phase "Migration count changed unexpectedly." }

  $After = Run-DbProbe "Post-install"
  $After | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $Evidence "AFTER.json") -Encoding UTF8
  if ([string]$After.attempt.id -ne $AttemptId -or [string]$After.attempt.operation -ne "CHECK_IN" -or [string]$After.attempt.card_result -ne "MATCHED" -or [string]$After.attempt.face_result -ne "NOT_RUN" -or [string]$After.attempt.liveness_result -ne "NOT_RUN" -or [string]$After.attempt.outcome -ne "PENDING") { Stop-Phase "Pending attempt changed during source-only install." }
  if (@($After.livenessSessions).Count -ne 0 -or [int]$After.protectedCounts.attendance -ne 0 -or [int]$After.protectedCounts.presence -ne 0 -or [int]$After.protectedCounts.evidence -ne 0) { Stop-Phase "Live biometric/attendance state changed during source-only install." }

  $ScannerAfterHash = Sha $ScannerPath
  $AwsAfterHash = Sha $AwsPath
  $PendingHash = Sha $PendingRoutePath
  $SelftestHash = Sha $SelftestPath
  $Verified = $true

  $proof = [ordered]@{
    createdAt = (Get-Date -Format o)
    proof = "CASA_SCANNER_PENDING_ATTEMPT_RECOVERY_INSTALL_V1"
    classification = "GREEN"
    attemptId = $AttemptId
    scannerBeforeSha256 = $ExpectedScannerHash
    scannerAfterSha256 = $ScannerAfterHash
    awsBeforeSha256 = $ExpectedAwsLivenessHash
    awsAfterSha256 = $AwsAfterHash
    pendingRouteSha256 = $PendingHash
    selftestSha256 = $SelftestHash
    databaseMutation = $false
    attendanceMutation = $false
    faceLivenessSessionCreated = $false
    awsResourceMutation = $false
    stagingTouched = $false
    productionTouched = $false
  }
  [IO.File]::WriteAllText((Join-Path $Evidence "RESULT.json"),($proof | ConvertTo-Json -Depth 12),$Utf8NoBom)

  Write-Host ""
  Write-Host "CASA SCANNER PENDING ATTEMPT RECOVERY INSTALL V1 IS GREEN" -ForegroundColor Green
  Write-Host "  exact attempt:                 $AttemptId"
  Write-Host "  pending attempt reload:        INSTALLED / SAME ATTEMPT"
  Write-Host "  liveness-start network retry:  INSTALLED"
  Write-Host "  active AWS session replay:     SAME PROVIDER SESSION / FRESH TEMP CREDS"
  Write-Host "  expired AWS session cleanup:   TRUTHFUL EXPIRED STATE"
  Write-Host "  card rescan required:          NO"
  Write-Host "  attempt state:                 MATCHED / NOT_RUN / NOT_RUN / PENDING"
  Write-Host "  liveness sessions:             0"
  Write-Host "  attendance/presence/evidence:  0/0/0"
  Write-Host "  Scanner SHA256:                $ScannerAfterHash"
  Write-Host "  AWS liveness SHA256:           $AwsAfterHash"
  Write-Host "  migrations:                    30 / UNCHANGED"
  Write-Host "  DB/AWS live mutation:          NO"
  Write-Host "  Staging/Production:            NOT TOUCHED"
  Write-Host "  evidence:                      $Evidence"
  Write-Host ""
  Write-Host "NEXT: return this complete GREEN output. Then run the guarded live same-attempt face/liveness retry; DO NOT scan the card." -ForegroundColor Yellow
}
catch {
  if ($WriteStarted -and -not $Verified) {
    Write-Host ""
    Write-Host "==> Rolling back pending-recovery source writes" -ForegroundColor Yellow
    foreach ($relative in $Backups.Keys) {
      $backup = [string]$Backups[$relative]
      $target = Join-Path $ProjectRoot $relative
      if (Test-Path -LiteralPath $backup -PathType Leaf) {
        Copy-Item -LiteralPath $backup -Destination $target -Force -ErrorAction SilentlyContinue
      }
    }
    foreach ($relative in @($PendingRouteRelative,$SelftestRelative)) {
      $target = Join-Path $ProjectRoot $relative
      if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "  source rollback complete"
  }
  Write-Error $_
  exit 1
}
finally {
  if ($PatcherPath -and (Test-Path -LiteralPath $PatcherPath -PathType Leaf)) { Remove-Item -LiteralPath $PatcherPath -Force -ErrorAction SilentlyContinue }
}
