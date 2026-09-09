param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"

$OlderPendingAttempt = "c3609f74-7abe-4e33-9f50-ce0a33664e16"
$LatestPendingAttempt = "caa12c89-a355-41eb-b387-8eed946cf3b5"

$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedScannerHash = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
$ExpectedAwsHash = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"
$ExpectedPendingRouteHash = "a7cbf6010b0f95a8f7974c125afc82158e97491b456b0166dfc63cf89323cb1f"
$ExpectedRecoverySelftestHash = "4954394aee80d927ad2b4213eccea479e1a2e822690ead6524ec468576fc51d6"

$ExpectedPendingRoutePostHash = "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"
$ExpectedRecoverySelftestPostHash = "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"

$Migration29Relative = "drizzle\20260909020000_pass-a-enum-expansion\migration.sql"
$Migration29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$Migration30Relative = "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql"
$Migration30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$Evidence = $null
$RouteBackup = $null
$SelftestBackup = $null
$WriteStarted = $false
$Completed = $false

function Stop-Phase([string]$Message) {
    throw $Message
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Phase "Required file missing: $Path"
    }

    return (
        Get-FileHash `
            -LiteralPath $Path `
            -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function Run-Native(
    [string]$Label,
    [string]$File,
    [string[]]$Arguments
) {
    Write-Host "  $Label"
    & $File @Arguments

    if ($LASTEXITCODE -ne 0) {
        Stop-Phase "$Label failed with exit code $LASTEXITCODE."
    }
}

function Read-AuthoritativeDuplicateState(
    [string]$Label,
    [int]$MaxAttempts = 4
) {
    $Probe =
        Join-Path `
            $Evidence `
            ("duplicate-state-" + [guid]::NewGuid().ToString("N") + ".mjs")

    $Code = @'
import { neon } from "@neondatabase/serverless";

const EXPECTED_HOST =
  "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech";
const OLDER =
  "c3609f74-7abe-4e33-9f50-ce0a33664e16";
const LATEST =
  "caa12c89-a355-41eb-b387-8eed946cf3b5";

const raw =
  process.env.DATABASE_URL;

if (!raw) {
  throw new Error(
    "DATABASE_URL missing.",
  );
}

const parsed =
  new URL(
    raw,
  );

if (
  parsed.hostname !==
  EXPECTED_HOST
) {
  throw new Error(
    `Refusing non-Development host: ${parsed.hostname}`,
  );
}

const sql =
  neon(
    raw,
  );

const clock =
  (
    await sql`
      select
        (now() at time zone 'Africa/Lagos')::date::text as date,
        (now() at time zone 'Africa/Lagos')::time(0)::text as time
    `
  )[0];

const migrations =
  Number(
    (
      await sql`
        select count(*)::int as count
        from drizzle.__drizzle_migrations
      `
    )[0]?.count ??
    -1,
  );

const attempts =
  await sql`
    select
      a.id,
      a.session_id,
      s.attendance_date::text as attendance_date,
      s.status::text as session_status,
      a.operation::text as operation,
      a.card_result::text as card_result,
      a.time_result::text as time_result,
      a.face_result::text as face_result,
      a.liveness_result::text as liveness_result,
      a.outcome::text as outcome,
      a.reason_code,
      a.occurred_at,
      (a.occurred_at at time zone 'Africa/Lagos')::date::text
        as occurred_local_date,
      (a.occurred_at at time zone 'Africa/Lagos')::time(0)::text
        as occurred_local_time,
      a.completed_at,
      a.created_at,
      d.check_in_opens_at::text as check_in_opens_at,
      d.check_in_closes_at::text as check_in_closes_at,
      (
        (a.occurred_at at time zone 'Africa/Lagos')::date =
          s.attendance_date
        and
        (a.occurred_at at time zone 'Africa/Lagos')::time >=
          d.check_in_opens_at
        and
        (a.occurred_at at time zone 'Africa/Lagos')::time <=
          d.check_in_closes_at
      ) as scan_was_inside_window,
      (
        select count(*)::int
        from biometric_liveness_sessions l
        where l.attempt_id=a.id
          and l.purpose='VERIFICATION'
      ) as liveness_count,
      (
        select count(*)::int
        from student_attendance_records r
        where r.source_attempt_id=a.id
      ) as attendance_count,
      (
        select count(*)::int
        from student_presence_events p
        where p.attempt_id=a.id
      ) as presence_count,
      (
        select count(*)::int
        from biometric_verification_evidence e
        where e.attempt_id=a.id
      ) as evidence_count
    from attendance_verification_attempts a
    join attendance_sessions s
      on s.school_id=a.school_id
     and s.id=a.session_id
    left join attendance_policy_days d
      on d.school_id=s.school_id
     and d.policy_id=s.policy_id
     and d.weekday=extract(dow from s.attendance_date)::int
    where a.id in (
      ${OLDER}::uuid,
      ${LATEST}::uuid
    )
    order by a.created_at asc,a.id asc
  `;

console.log(
  JSON.stringify({
    host:
      parsed.hostname,
    migrations,
    clock,
    attempts,
  }),
);
'@

    [System.IO.File]::WriteAllText(
        $Probe,
        $Code,
        $Utf8NoBom
    )

    try {
        for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
            $Output =
                @(
                    & node.exe `
                        --env-file=.env.local `
                        $Probe 2>&1
                )

            if ($LASTEXITCODE -eq 0) {
                $Lines =
                    @(
                        $Output |
                            ForEach-Object {
                                [string]$_
                            } |
                            Where-Object {
                                -not [string]::IsNullOrWhiteSpace($_)
                            }
                    )

                if ($Lines.Count -eq 0) {
                    Stop-Phase "$Label returned no JSON."
                }

                try {
                    return (
                        $Lines[-1] |
                            ConvertFrom-Json
                    )
                }
                catch {
                    $Lines |
                        ForEach-Object {
                            Write-Host $_
                        }

                    Stop-Phase "$Label returned invalid JSON."
                }
            }

            Write-Host "  $Label Development read attempt ${Attempt}/${MaxAttempts}: FAILED"

            if ($Attempt -lt $MaxAttempts) {
                $Delay = $Attempt * 2
                Write-Host "    retrying read-only Neon probe after ${Delay}s..."
                Start-Sleep -Seconds $Delay
            }
            else {
                Write-Host "  $Label final Neon error:"
                $Output |
                    Select-Object -Last 30 |
                    ForEach-Object {
                        Write-Host "    $_"
                    }

                Stop-Phase "$Label failed after $MaxAttempts read-only attempts."
            }
        }
    }
    finally {
        Remove-Item `
            -LiteralPath $Probe `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Assert-DuplicateState(
    [object]$State,
    [string]$Label
) {
    if (
        [string]$State.host -ne $ExpectedDevelopmentHost -or
        [int]$State.migrations -ne 30
    ) {
        Stop-Phase "$Label Development boundary drifted."
    }

    $Attempts =
        @($State.attempts)

    if ($Attempts.Count -ne 2) {
        Stop-Phase "$Label expected exactly the two guarded Sep 9 pending attempts; found $($Attempts.Count)."
    }

    if (
        [string]$Attempts[0].id -ne $OlderPendingAttempt -or
        [string]$Attempts[1].id -ne $LatestPendingAttempt
    ) {
        Stop-Phase "$Label pending-attempt ordering/identity drifted."
    }

    foreach ($Attempt in $Attempts) {
        if (
            [string]$Attempt.attendance_date -ne
                [string]$State.clock.date -or
            [string]$Attempt.session_status -ne "OPEN" -or
            [string]$Attempt.operation -ne "CHECK_IN" -or
            [string]$Attempt.card_result -ne "MATCHED" -or
            @("ON_TIME","LATE") -notcontains [string]$Attempt.time_result -or
            [string]$Attempt.face_result -ne "NOT_RUN" -or
            [string]$Attempt.liveness_result -ne "NOT_RUN" -or
            [string]$Attempt.outcome -ne "PENDING" -or
            $null -ne $Attempt.completed_at -or
            $Attempt.scan_was_inside_window -ne $true -or
            [int]$Attempt.liveness_count -ne 0 -or
            [int]$Attempt.attendance_count -ne 0 -or
            [int]$Attempt.presence_count -ne 0 -or
            [int]$Attempt.evidence_count -ne 0
        ) {
            Stop-Phase "$Label attempt $($Attempt.id) is no longer a clean card-matched pending duplicate."
        }
    }
}

Write-Host "CASA School - Duplicate-Safe Pending Scanner Recovery Hardening V1" -ForegroundColor Green
Write-Host "Source-only hardening before the Sep 9 live face/liveness ceremony."
Write-Host "Prevents an older duplicate PENDING attempt from being auto-recovered after attendance has already been recorded for the same student/session."
Write-Host "No card scan. No Face Liveness session. No Development DB write. No AWS/IAM mutation."
Write-Host "No Staging/Production connection."

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Phase "CASA repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    $Stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\scanner-duplicate-safe-pending-recovery-v1-$Stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    Step "Locking exact post-V1R4 source authority"

    $Branch =
        (& git branch --show-current).Trim()
    $Head =
        (& git rev-parse --short HEAD).Trim()

    if (
        $Branch -ne $ExpectedBranch -or
        $Head -ne $ExpectedHead
    ) {
        Stop-Phase "Git checkpoint drift: $Branch/$Head"
    }

    $PackagePath =
        Join-Path $ProjectRoot "package.json"
    $ScannerPath =
        Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $AwsPath =
        Join-Path $ProjectRoot "src\server\biometrics\aws-liveness.ts"
    $PendingRoutePath =
        Join-Path $ProjectRoot "src\app\api\terminal\attempts\pending\route.ts"
    $RecoverySelftestPath =
        Join-Path $ProjectRoot "scripts\scanner-pending-attempt-recovery-selftest.ts"

    if ((Sha $PackagePath) -ne $ExpectedPackageHash) {
        Stop-Phase "package.json drift."
    }

    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Stop-Phase "Scanner recovery source drift."
    }

    if ((Sha $AwsPath) -ne $ExpectedAwsHash) {
        Stop-Phase "AWS replay-safe liveness source drift."
    }

    if ((Sha $PendingRoutePath) -ne $ExpectedPendingRouteHash) {
        Stop-Phase "Pending-attempt route drift."
    }

    if ((Sha $RecoverySelftestPath) -ne $ExpectedRecoverySelftestHash) {
        Stop-Phase "Pending-attempt recovery selftest drift."
    }

    $MigrationFiles =
        @(
            Get-ChildItem `
                -LiteralPath (Join-Path $ProjectRoot "drizzle") `
                -Recurse `
                -File `
                -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
            }
        )

    if ($MigrationFiles.Count -ne 30) {
        Stop-Phase "Expected exactly 30 local migrations; found $($MigrationFiles.Count)."
    }

    if (
        (Sha (Join-Path $ProjectRoot $Migration29Relative)) -ne $Migration29Hash -or
        (Sha (Join-Path $ProjectRoot $Migration30Relative)) -ne $Migration30Hash
    ) {
        Stop-Phase "Pass A migration checksum drift."
    }

    Write-Host "  branch/head:                   $Branch/$Head"
    Write-Host "  migrations:                    30 / VERIFIED"
    Write-Host "  Scanner:                       LOCKED / VERIFIED"
    Write-Host "  AWS liveness:                  LOCKED / VERIFIED"
    Write-Host "  pending route preimage:        VERIFIED / $ExpectedPendingRouteHash"
    Write-Host "  recovery selftest preimage:    VERIFIED / $ExpectedRecoverySelftestHash"

    Step "Re-proving the two Sep 9 pending attempts read-only"

    $Before =
        Read-AuthoritativeDuplicateState `
            "Pre-install duplicate-state"

    Assert-DuplicateState `
        $Before `
        "Pre-install"

    $Before |
        ConvertTo-Json -Depth 20 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "BEFORE.json") `
            -Encoding UTF8

    Write-Host "  older pending attempt:          $OlderPendingAttempt"
    Write-Host "  latest pending attempt:         $LatestPendingAttempt"
    Write-Host "  both scan-time classifications: ACCEPTED / STORED"
    Write-Host "  both scan timestamps:           INSIDE ORIGINAL CHECK_IN WINDOW"
    Write-Host "  liveness sessions:              0 / 0"
    Write-Host "  attendance/presence/evidence:   0/0/0 for both"
    Write-Host "  current clock reclassification: NOT USED"

    Step "Backing up exact route and focused selftest"

    $RouteBackup =
        Join-Path $Evidence "pending-route.before.ts"
    $SelftestBackup =
        Join-Path $Evidence "scanner-pending-attempt-recovery-selftest.before.ts"

    Copy-Item `
        -LiteralPath $PendingRoutePath `
        -Destination $RouteBackup

    Copy-Item `
        -LiteralPath $RecoverySelftestPath `
        -Destination $SelftestBackup

    Step "Installing duplicate-safe pending recovery filter"

    $NewPendingRoute = @'
import {
  and,
  desc,
  eq,
  notExists,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
  studentAttendanceRecords,
} from "@/db/schema";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  getActiveTerminalSession,
} from "@/server/attendance/terminal-session";

export const dynamic =
  "force-dynamic";

export async function GET(
  request:
    NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const active =
    await getActiveTerminalSession(
      access.school.id,
      access.school.timezone,
    );

  if (!active.session) {
    return NextResponse.json(
      {
        pending:
          null,
        duplicatePendingCount:
          0,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const db = getDb();
  const rows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        operation:
          attendanceVerificationAttempts.operation,
        cardResult:
          attendanceVerificationAttempts.cardResult,
        timeResult:
          attendanceVerificationAttempts.timeResult,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        completedAt:
          attendanceVerificationAttempts.completedAt,
        createdAt:
          attendanceVerificationAttempts.createdAt,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalId,
            access.terminal.id,
          ),
          eq(
            attendanceVerificationAttempts.sessionId,
            active.session.id,
          ),
          eq(
            attendanceVerificationAttempts.operation,
            "CHECK_IN",
          ),
          eq(
            attendanceVerificationAttempts.cardResult,
            "MATCHED",
          ),
          eq(
            attendanceVerificationAttempts.outcome,
            "PENDING",
          ),
          notExists(
            db
              .select({
                id:
                  studentAttendanceRecords.id,
              })
              .from(
                studentAttendanceRecords,
              )
              .where(
                and(
                  eq(
                    studentAttendanceRecords.schoolId,
                    attendanceVerificationAttempts.schoolId,
                  ),
                  eq(
                    studentAttendanceRecords.sessionId,
                    attendanceVerificationAttempts.sessionId,
                  ),
                  eq(
                    studentAttendanceRecords.studentId,
                    attendanceVerificationAttempts.studentId,
                  ),
                ),
              ),
          ),
        ),
      )
      .orderBy(
        desc(
          attendanceVerificationAttempts.createdAt,
        ),
      )
      .limit(10);

  const latest = rows[0];

  return NextResponse.json(
    {
      pending:
        latest
          ? {
              attempt: {
                id:
                  latest.id,
                operation:
                  latest.operation,
                cardResult:
                  latest.cardResult,
                timeResult:
                  latest.timeResult,
                departureResult:
                  latest.departureResult,
                outcome:
                  latest.outcome,
                reasonCode:
                  latest.reasonCode,
                completedAt:
                  latest.completedAt,
              },
              student:
                null,
              replayed:
                true,
              requiresBiometric:
                true,
              requiresStaffAuthorization:
                false,
              classification:
                null,
            }
          : null,
      duplicatePendingCount:
        rows.length,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}

'@

    $NewRecoverySelftest = @'
import fs from "node:fs";
const aws=fs.readFileSync("src/server/biometrics/aws-liveness.ts","utf8");
const scanner=fs.readFileSync("src/app/scanner/scanner-client.tsx","utf8");
const pending=fs.readFileSync("src/app/api/terminal/attempts/pending/route.ts","utf8");
const start=aws.indexOf("export async function startAwsVerificationLiveness");
const end=aws.indexOf("export async function completeAwsVerificationLiveness",start);
if(start<0||end<0||end<=start) throw new Error("Verification liveness function boundary missing");
const verification=aws.slice(start,end);
for(const m of ["LIVENESS_SESSION_EXPIRED","activeSession.providerSessionId","issueAwsLivenessStreamingCredentials(","replayed:","lte("]) if(!verification.includes(m)) throw new Error("Verification liveness recovery marker missing: "+m);
if(verification.includes('"LIVENESS_SESSION_ALREADY_ACTIVE"')) throw new Error("Verification liveness start still strands active sessions behind 409");
for(const m of ["terminalFetchWithRetry","recoverPendingAttempt","/api/terminal/attempts/pending","Pending face verification recovered.","FACE_RETRY","FaceLivenessDetectorCore"]) if(!scanner.includes(m)) throw new Error("Scanner recovery marker missing: "+m);
const faceStart=scanner.indexOf("  const startFace =");
const faceEnd=scanner.indexOf("  const processCard =",faceStart);
if(faceStart<0||faceEnd<=faceStart) throw new Error("Scanner startFace boundary missing");
const face=scanner.slice(faceStart,faceEnd);
const faceUrl="/biometric/liveness/start";
if((face.split(faceUrl).length-1)!==1) throw new Error("Scanner liveness-start URL multiplicity drifted");
const faceUrlIndex=face.indexOf(faceUrl);
if(face.lastIndexOf("await terminalFetchWithRetry(",faceUrlIndex)<0) throw new Error("Scanner liveness-start is not using retry helper");
for(const m of ["authenticateTerminalRequest","getActiveTerminalSession",'"CHECK_IN"','"MATCHED"','"PENDING"',"desc(","duplicatePendingCount","notExists(","studentAttendanceRecords"]) if(!pending.includes(m)) throw new Error("Pending route marker missing: "+m);
if(!/notExists\([\s\S]*studentAttendanceRecords\.schoolId[\s\S]*attendanceVerificationAttempts\.schoolId[\s\S]*studentAttendanceRecords\.sessionId[\s\S]*attendanceVerificationAttempts\.sessionId[\s\S]*studentAttendanceRecords\.studentId[\s\S]*attendanceVerificationAttempts\.studentId/.test(pending)) throw new Error("Pending route does not suppress already-recorded duplicate attempts by school/session/student");
console.log("CASA Scanner pending-attempt recovery contract self-test passed.");

'@

    $WriteStarted = $true

    [System.IO.File]::WriteAllText(
        $PendingRoutePath,
        $NewPendingRoute,
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        $RecoverySelftestPath,
        $NewRecoverySelftest,
        $Utf8NoBom
    )

    if ((Sha $PendingRoutePath) -ne $ExpectedPendingRoutePostHash) {
        Stop-Phase "Pending route postimage hash mismatch."
    }

    if ((Sha $RecoverySelftestPath) -ne $ExpectedRecoverySelftestPostHash) {
        Stop-Phase "Recovery selftest postimage hash mismatch."
    }

    if (
        (Sha $ScannerPath) -ne $ExpectedScannerHash -or
        (Sha $AwsPath) -ne $ExpectedAwsHash -or
        (Sha $PackagePath) -ne $ExpectedPackageHash
    ) {
        Stop-Phase "Protected Scanner/AWS/package source changed unexpectedly."
    }

    Write-Host "  recorded-attempt suppression:   INSTALLED"
    Write-Host "  recovery selection before record: LATEST PENDING"
    Write-Host "  older duplicate after record:   SUPPRESSED BY SAME STUDENT/SESSION RECORD"
    Write-Host "  Scanner/AWS source:              BYTE-FOR-BYTE UNCHANGED"

    Step "Running source and recovery regressions"

    Run-Native `
        "git diff --check" `
        "git.exe" `
        @("diff","--check")

    Run-Native `
        "focused pending recovery selftest" `
        "npx.cmd" `
        @(
            "tsx",
            "scripts/scanner-pending-attempt-recovery-selftest.ts"
        )

    foreach ($Name in @(
        "scanner:selftest",
        "terminal:selftest",
        "attendance:selftest",
        "biometric:selftest",
        "biometric-provider:selftest",
        "aws-biometric:selftest",
        "typecheck"
    )) {
        Run-Native `
            "npm run $Name" `
            "npm.cmd" `
            @("run",$Name)
    }

    Step "Running production build"

    Run-Native `
        "npm run build" `
        "npm.cmd" `
        @("run","build")

    Step "Re-proving Development state remained untouched"

    $After =
        Read-AuthoritativeDuplicateState `
            "Post-install duplicate-state"

    Assert-DuplicateState `
        $After `
        "Post-install"

    $After |
        ConvertTo-Json -Depth 20 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "AFTER.json") `
            -Encoding UTF8

    if (
        (Sha $PendingRoutePath) -ne $ExpectedPendingRoutePostHash -or
        (Sha $RecoverySelftestPath) -ne $ExpectedRecoverySelftestPostHash -or
        (Sha $ScannerPath) -ne $ExpectedScannerHash -or
        (Sha $AwsPath) -ne $ExpectedAwsHash -or
        (Sha $PackagePath) -ne $ExpectedPackageHash
    ) {
        Stop-Phase "Final source hashes drifted."
    }

    $Completed = $true

    Write-Host ""
    Write-Host "CASA DUPLICATE-SAFE PENDING SCANNER RECOVERY HARDENING V1 IS GREEN" -ForegroundColor Green
    Write-Host "  older pending attempt:          $OlderPendingAttempt / UNCHANGED"
    Write-Host "  latest pending attempt:         $LatestPendingAttempt / LIVE RECOVERY TARGET"
    Write-Host "  pending route behavior:         LATEST ELIGIBLE PENDING"
    Write-Host "  after successful attendance:    OLDER SAME-STUDENT/SESSION DUPLICATE WILL NOT RESURFACE"
    Write-Host "  pending route SHA256:            $ExpectedPendingRoutePostHash"
    Write-Host "  recovery selftest SHA256:        $ExpectedRecoverySelftestPostHash"
    Write-Host "  Scanner SHA256:                  $ExpectedScannerHash / UNCHANGED"
    Write-Host "  AWS liveness SHA256:             $ExpectedAwsHash / UNCHANGED"
    Write-Host "  Development DB mutation:         NO"
    Write-Host "  Face Liveness session created:   NO"
    Write-Host "  Staging/Production:              NOT TOUCHED"
    Write-Host "  evidence:                        $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this GREEN output. Then run the corrected live same-attempt continuation against the latest pending attempt without rescanning the card." -ForegroundColor Yellow
}
catch {
    if ($WriteStarted -and -not $Completed) {
        Write-Host ""
        Write-Host "==> Rolling back duplicate-safe recovery source writes" -ForegroundColor Yellow

        if ($RouteBackup -and (Test-Path -LiteralPath $RouteBackup -PathType Leaf)) {
            Copy-Item `
                -LiteralPath $RouteBackup `
                -Destination (
                    Join-Path `
                        $ProjectRoot `
                        "src\app\api\terminal\attempts\pending\route.ts"
                ) `
                -Force
        }

        if ($SelftestBackup -and (Test-Path -LiteralPath $SelftestBackup -PathType Leaf)) {
            Copy-Item `
                -LiteralPath $SelftestBackup `
                -Destination (
                    Join-Path `
                        $ProjectRoot `
                        "scripts\scanner-pending-attempt-recovery-selftest.ts"
                ) `
                -Force
        }

        Write-Host "  source rollback complete"
    }

    Write-Host ""
    Write-Host "CASA DUPLICATE-SAFE PENDING RECOVERY HARDENING STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    throw
}
