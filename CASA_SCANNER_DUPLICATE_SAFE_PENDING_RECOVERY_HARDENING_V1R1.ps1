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

Write-Host "CASA School - Duplicate-Safe Pending Scanner Recovery Hardening V1R1" -ForegroundColor Green
Write-Host "Source-only hardening before the Sep 9 live face/liveness ceremony."
Write-Host "V1R1 writes the intended route/selftest from exact embedded UTF-8 bytes, eliminating PowerShell here-string newline ambiguity."
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
            ".casa-backups\scanner-duplicate-safe-pending-recovery-v1r1-$Stamp"

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

    $PendingRouteBytes =
        [Convert]::FromBase64String(
            "aW1wb3J0IHsKICBhbmQsCiAgZGVzYywKICBlcSwKICBub3RFeGlzdHMsCn0gZnJvbSAiZHJpenpsZS1vcm0iOwppbXBvcnQgewogIE5leHRSZXF1ZXN0LAogIE5leHRSZXNwb25zZSwKfSBmcm9tICJuZXh0L3NlcnZlciI7CgppbXBvcnQgeyBnZXREYiB9IGZyb20gIkAvZGIiOwppbXBvcnQgewogIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cywKICBzdHVkZW50QXR0ZW5kYW5jZVJlY29yZHMsCn0gZnJvbSAiQC9kYi9zY2hlbWEiOwppbXBvcnQgewogIGF0dGVuZGFuY2VOb1N0b3JlSGVhZGVycywKICB0ZXJtaW5hbFVuYXV0aG9yaXplZFJlc3BvbnNlLAp9IGZyb20gIkAvc2VydmVyL2F0dGVuZGFuY2UvaHR0cCI7CmltcG9ydCB7CiAgYXV0aGVudGljYXRlVGVybWluYWxSZXF1ZXN0LAp9IGZyb20gIkAvc2VydmVyL2F0dGVuZGFuY2UvdGVybWluYWwtYXV0aCI7CmltcG9ydCB7CiAgZ2V0QWN0aXZlVGVybWluYWxTZXNzaW9uLAp9IGZyb20gIkAvc2VydmVyL2F0dGVuZGFuY2UvdGVybWluYWwtc2Vzc2lvbiI7CgpleHBvcnQgY29uc3QgZHluYW1pYyA9CiAgImZvcmNlLWR5bmFtaWMiOwoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIEdFVCgKICByZXF1ZXN0OgogICAgTmV4dFJlcXVlc3QsCikgewogIGNvbnN0IGFjY2VzcyA9CiAgICBhd2FpdCBhdXRoZW50aWNhdGVUZXJtaW5hbFJlcXVlc3QoCiAgICAgIHJlcXVlc3QsCiAgICApOwoKICBpZiAoIWFjY2VzcykgewogICAgcmV0dXJuIHRlcm1pbmFsVW5hdXRob3JpemVkUmVzcG9uc2UoKTsKICB9CgogIGNvbnN0IGFjdGl2ZSA9CiAgICBhd2FpdCBnZXRBY3RpdmVUZXJtaW5hbFNlc3Npb24oCiAgICAgIGFjY2Vzcy5zY2hvb2wuaWQsCiAgICAgIGFjY2Vzcy5zY2hvb2wudGltZXpvbmUsCiAgICApOwoKICBpZiAoIWFjdGl2ZS5zZXNzaW9uKSB7CiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oCiAgICAgIHsKICAgICAgICBwZW5kaW5nOgogICAgICAgICAgbnVsbCwKICAgICAgICBkdXBsaWNhdGVQZW5kaW5nQ291bnQ6CiAgICAgICAgICAwLAogICAgICB9LAogICAgICB7CiAgICAgICAgaGVhZGVyczoKICAgICAgICAgIGF0dGVuZGFuY2VOb1N0b3JlSGVhZGVycywKICAgICAgfSwKICAgICk7CiAgfQoKICBjb25zdCBkYiA9IGdldERiKCk7CiAgY29uc3Qgcm93cyA9CiAgICBhd2FpdCBkYgogICAgICAuc2VsZWN0KHsKICAgICAgICBpZDoKICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5pZCwKICAgICAgICBvcGVyYXRpb246CiAgICAgICAgICBhdHRlbmRhbmNlVmVyaWZpY2F0aW9uQXR0ZW1wdHMub3BlcmF0aW9uLAogICAgICAgIGNhcmRSZXN1bHQ6CiAgICAgICAgICBhdHRlbmRhbmNlVmVyaWZpY2F0aW9uQXR0ZW1wdHMuY2FyZFJlc3VsdCwKICAgICAgICB0aW1lUmVzdWx0OgogICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLnRpbWVSZXN1bHQsCiAgICAgICAgZGVwYXJ0dXJlUmVzdWx0OgogICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLmRlcGFydHVyZVJlc3VsdCwKICAgICAgICBvdXRjb21lOgogICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLm91dGNvbWUsCiAgICAgICAgcmVhc29uQ29kZToKICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5yZWFzb25Db2RlLAogICAgICAgIGNvbXBsZXRlZEF0OgogICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLmNvbXBsZXRlZEF0LAogICAgICAgIGNyZWF0ZWRBdDoKICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5jcmVhdGVkQXQsCiAgICAgIH0pCiAgICAgIC5mcm9tKAogICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cywKICAgICAgKQogICAgICAud2hlcmUoCiAgICAgICAgYW5kKAogICAgICAgICAgZXEoCiAgICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5zY2hvb2xJZCwKICAgICAgICAgICAgYWNjZXNzLnNjaG9vbC5pZCwKICAgICAgICAgICksCiAgICAgICAgICBlcSgKICAgICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLnRlcm1pbmFsSWQsCiAgICAgICAgICAgIGFjY2Vzcy50ZXJtaW5hbC5pZCwKICAgICAgICAgICksCiAgICAgICAgICBlcSgKICAgICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLnNlc3Npb25JZCwKICAgICAgICAgICAgYWN0aXZlLnNlc3Npb24uaWQsCiAgICAgICAgICApLAogICAgICAgICAgZXEoCiAgICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5vcGVyYXRpb24sCiAgICAgICAgICAgICJDSEVDS19JTiIsCiAgICAgICAgICApLAogICAgICAgICAgZXEoCiAgICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5jYXJkUmVzdWx0LAogICAgICAgICAgICAiTUFUQ0hFRCIsCiAgICAgICAgICApLAogICAgICAgICAgZXEoCiAgICAgICAgICAgIGF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0cy5vdXRjb21lLAogICAgICAgICAgICAiUEVORElORyIsCiAgICAgICAgICApLAogICAgICAgICAgbm90RXhpc3RzKAogICAgICAgICAgICBkYgogICAgICAgICAgICAgIC5zZWxlY3QoewogICAgICAgICAgICAgICAgaWQ6CiAgICAgICAgICAgICAgICAgIHN0dWRlbnRBdHRlbmRhbmNlUmVjb3Jkcy5pZCwKICAgICAgICAgICAgICB9KQogICAgICAgICAgICAgIC5mcm9tKAogICAgICAgICAgICAgICAgc3R1ZGVudEF0dGVuZGFuY2VSZWNvcmRzLAogICAgICAgICAgICAgICkKICAgICAgICAgICAgICAud2hlcmUoCiAgICAgICAgICAgICAgICBhbmQoCiAgICAgICAgICAgICAgICAgIGVxKAogICAgICAgICAgICAgICAgICAgIHN0dWRlbnRBdHRlbmRhbmNlUmVjb3Jkcy5zY2hvb2xJZCwKICAgICAgICAgICAgICAgICAgICBhdHRlbmRhbmNlVmVyaWZpY2F0aW9uQXR0ZW1wdHMuc2Nob29sSWQsCiAgICAgICAgICAgICAgICAgICksCiAgICAgICAgICAgICAgICAgIGVxKAogICAgICAgICAgICAgICAgICAgIHN0dWRlbnRBdHRlbmRhbmNlUmVjb3Jkcy5zZXNzaW9uSWQsCiAgICAgICAgICAgICAgICAgICAgYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzLnNlc3Npb25JZCwKICAgICAgICAgICAgICAgICAgKSwKICAgICAgICAgICAgICAgICAgZXEoCiAgICAgICAgICAgICAgICAgICAgc3R1ZGVudEF0dGVuZGFuY2VSZWNvcmRzLnN0dWRlbnRJZCwKICAgICAgICAgICAgICAgICAgICBhdHRlbmRhbmNlVmVyaWZpY2F0aW9uQXR0ZW1wdHMuc3R1ZGVudElkLAogICAgICAgICAgICAgICAgICApLAogICAgICAgICAgICAgICAgKSwKICAgICAgICAgICAgICApLAogICAgICAgICAgKSwKICAgICAgICApLAogICAgICApCiAgICAgIC5vcmRlckJ5KAogICAgICAgIGRlc2MoCiAgICAgICAgICBhdHRlbmRhbmNlVmVyaWZpY2F0aW9uQXR0ZW1wdHMuY3JlYXRlZEF0LAogICAgICAgICksCiAgICAgICkKICAgICAgLmxpbWl0KDEwKTsKCiAgY29uc3QgbGF0ZXN0ID0gcm93c1swXTsKCiAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKAogICAgewogICAgICBwZW5kaW5nOgogICAgICAgIGxhdGVzdAogICAgICAgICAgPyB7CiAgICAgICAgICAgICAgYXR0ZW1wdDogewogICAgICAgICAgICAgICAgaWQ6CiAgICAgICAgICAgICAgICAgIGxhdGVzdC5pZCwKICAgICAgICAgICAgICAgIG9wZXJhdGlvbjoKICAgICAgICAgICAgICAgICAgbGF0ZXN0Lm9wZXJhdGlvbiwKICAgICAgICAgICAgICAgIGNhcmRSZXN1bHQ6CiAgICAgICAgICAgICAgICAgIGxhdGVzdC5jYXJkUmVzdWx0LAogICAgICAgICAgICAgICAgdGltZVJlc3VsdDoKICAgICAgICAgICAgICAgICAgbGF0ZXN0LnRpbWVSZXN1bHQsCiAgICAgICAgICAgICAgICBkZXBhcnR1cmVSZXN1bHQ6CiAgICAgICAgICAgICAgICAgIGxhdGVzdC5kZXBhcnR1cmVSZXN1bHQsCiAgICAgICAgICAgICAgICBvdXRjb21lOgogICAgICAgICAgICAgICAgICBsYXRlc3Qub3V0Y29tZSwKICAgICAgICAgICAgICAgIHJlYXNvbkNvZGU6CiAgICAgICAgICAgICAgICAgIGxhdGVzdC5yZWFzb25Db2RlLAogICAgICAgICAgICAgICAgY29tcGxldGVkQXQ6CiAgICAgICAgICAgICAgICAgIGxhdGVzdC5jb21wbGV0ZWRBdCwKICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgIHN0dWRlbnQ6CiAgICAgICAgICAgICAgICBudWxsLAogICAgICAgICAgICAgIHJlcGxheWVkOgogICAgICAgICAgICAgICAgdHJ1ZSwKICAgICAgICAgICAgICByZXF1aXJlc0Jpb21ldHJpYzoKICAgICAgICAgICAgICAgIHRydWUsCiAgICAgICAgICAgICAgcmVxdWlyZXNTdGFmZkF1dGhvcml6YXRpb246CiAgICAgICAgICAgICAgICBmYWxzZSwKICAgICAgICAgICAgICBjbGFzc2lmaWNhdGlvbjoKICAgICAgICAgICAgICAgIG51bGwsCiAgICAgICAgICAgIH0KICAgICAgICAgIDogbnVsbCwKICAgICAgZHVwbGljYXRlUGVuZGluZ0NvdW50OgogICAgICAgIHJvd3MubGVuZ3RoLAogICAgfSwKICAgIHsKICAgICAgaGVhZGVyczoKICAgICAgICBhdHRlbmRhbmNlTm9TdG9yZUhlYWRlcnMsCiAgICB9LAogICk7Cn0K"
        )

    $NewPendingRoute =
        [Text.Encoding]::UTF8.GetString(
            $PendingRouteBytes
        )

    $RecoverySelftestBytes =
        [Convert]::FromBase64String(
            "aW1wb3J0IGZzIGZyb20gIm5vZGU6ZnMiOwpjb25zdCBhd3M9ZnMucmVhZEZpbGVTeW5jKCJzcmMvc2VydmVyL2Jpb21ldHJpY3MvYXdzLWxpdmVuZXNzLnRzIiwidXRmOCIpOwpjb25zdCBzY2FubmVyPWZzLnJlYWRGaWxlU3luYygic3JjL2FwcC9zY2FubmVyL3NjYW5uZXItY2xpZW50LnRzeCIsInV0ZjgiKTsKY29uc3QgcGVuZGluZz1mcy5yZWFkRmlsZVN5bmMoInNyYy9hcHAvYXBpL3Rlcm1pbmFsL2F0dGVtcHRzL3BlbmRpbmcvcm91dGUudHMiLCJ1dGY4Iik7CmNvbnN0IHN0YXJ0PWF3cy5pbmRleE9mKCJleHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRBd3NWZXJpZmljYXRpb25MaXZlbmVzcyIpOwpjb25zdCBlbmQ9YXdzLmluZGV4T2YoImV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wbGV0ZUF3c1ZlcmlmaWNhdGlvbkxpdmVuZXNzIixzdGFydCk7CmlmKHN0YXJ0PDB8fGVuZDwwfHxlbmQ8PXN0YXJ0KSB0aHJvdyBuZXcgRXJyb3IoIlZlcmlmaWNhdGlvbiBsaXZlbmVzcyBmdW5jdGlvbiBib3VuZGFyeSBtaXNzaW5nIik7CmNvbnN0IHZlcmlmaWNhdGlvbj1hd3Muc2xpY2Uoc3RhcnQsZW5kKTsKZm9yKGNvbnN0IG0gb2YgWyJMSVZFTkVTU19TRVNTSU9OX0VYUElSRUQiLCJhY3RpdmVTZXNzaW9uLnByb3ZpZGVyU2Vzc2lvbklkIiwiaXNzdWVBd3NMaXZlbmVzc1N0cmVhbWluZ0NyZWRlbnRpYWxzKCIsInJlcGxheWVkOiIsImx0ZSgiXSkgaWYoIXZlcmlmaWNhdGlvbi5pbmNsdWRlcyhtKSkgdGhyb3cgbmV3IEVycm9yKCJWZXJpZmljYXRpb24gbGl2ZW5lc3MgcmVjb3ZlcnkgbWFya2VyIG1pc3Npbmc6ICIrbSk7CmlmKHZlcmlmaWNhdGlvbi5pbmNsdWRlcygnIkxJVkVORVNTX1NFU1NJT05fQUxSRUFEWV9BQ1RJVkUiJykpIHRocm93IG5ldyBFcnJvcigiVmVyaWZpY2F0aW9uIGxpdmVuZXNzIHN0YXJ0IHN0aWxsIHN0cmFuZHMgYWN0aXZlIHNlc3Npb25zIGJlaGluZCA0MDkiKTsKZm9yKGNvbnN0IG0gb2YgWyJ0ZXJtaW5hbEZldGNoV2l0aFJldHJ5IiwicmVjb3ZlclBlbmRpbmdBdHRlbXB0IiwiL2FwaS90ZXJtaW5hbC9hdHRlbXB0cy9wZW5kaW5nIiwiUGVuZGluZyBmYWNlIHZlcmlmaWNhdGlvbiByZWNvdmVyZWQuIiwiRkFDRV9SRVRSWSIsIkZhY2VMaXZlbmVzc0RldGVjdG9yQ29yZSJdKSBpZighc2Nhbm5lci5pbmNsdWRlcyhtKSkgdGhyb3cgbmV3IEVycm9yKCJTY2FubmVyIHJlY292ZXJ5IG1hcmtlciBtaXNzaW5nOiAiK20pOwpjb25zdCBmYWNlU3RhcnQ9c2Nhbm5lci5pbmRleE9mKCIgIGNvbnN0IHN0YXJ0RmFjZSA9Iik7CmNvbnN0IGZhY2VFbmQ9c2Nhbm5lci5pbmRleE9mKCIgIGNvbnN0IHByb2Nlc3NDYXJkID0iLGZhY2VTdGFydCk7CmlmKGZhY2VTdGFydDwwfHxmYWNlRW5kPD1mYWNlU3RhcnQpIHRocm93IG5ldyBFcnJvcigiU2Nhbm5lciBzdGFydEZhY2UgYm91bmRhcnkgbWlzc2luZyIpOwpjb25zdCBmYWNlPXNjYW5uZXIuc2xpY2UoZmFjZVN0YXJ0LGZhY2VFbmQpOwpjb25zdCBmYWNlVXJsPSIvYmlvbWV0cmljL2xpdmVuZXNzL3N0YXJ0IjsKaWYoKGZhY2Uuc3BsaXQoZmFjZVVybCkubGVuZ3RoLTEpIT09MSkgdGhyb3cgbmV3IEVycm9yKCJTY2FubmVyIGxpdmVuZXNzLXN0YXJ0IFVSTCBtdWx0aXBsaWNpdHkgZHJpZnRlZCIpOwpjb25zdCBmYWNlVXJsSW5kZXg9ZmFjZS5pbmRleE9mKGZhY2VVcmwpOwppZihmYWNlLmxhc3RJbmRleE9mKCJhd2FpdCB0ZXJtaW5hbEZldGNoV2l0aFJldHJ5KCIsZmFjZVVybEluZGV4KTwwKSB0aHJvdyBuZXcgRXJyb3IoIlNjYW5uZXIgbGl2ZW5lc3Mtc3RhcnQgaXMgbm90IHVzaW5nIHJldHJ5IGhlbHBlciIpOwpmb3IoY29uc3QgbSBvZiBbImF1dGhlbnRpY2F0ZVRlcm1pbmFsUmVxdWVzdCIsImdldEFjdGl2ZVRlcm1pbmFsU2Vzc2lvbiIsJyJDSEVDS19JTiInLCciTUFUQ0hFRCInLCciUEVORElORyInLCJkZXNjKCIsImR1cGxpY2F0ZVBlbmRpbmdDb3VudCIsIm5vdEV4aXN0cygiLCJzdHVkZW50QXR0ZW5kYW5jZVJlY29yZHMiXSkgaWYoIXBlbmRpbmcuaW5jbHVkZXMobSkpIHRocm93IG5ldyBFcnJvcigiUGVuZGluZyByb3V0ZSBtYXJrZXIgbWlzc2luZzogIittKTsKaWYoIS9ub3RFeGlzdHNcKFtcc1xTXSpzdHVkZW50QXR0ZW5kYW5jZVJlY29yZHNcLnNjaG9vbElkW1xzXFNdKmF0dGVuZGFuY2VWZXJpZmljYXRpb25BdHRlbXB0c1wuc2Nob29sSWRbXHNcU10qc3R1ZGVudEF0dGVuZGFuY2VSZWNvcmRzXC5zZXNzaW9uSWRbXHNcU10qYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzXC5zZXNzaW9uSWRbXHNcU10qc3R1ZGVudEF0dGVuZGFuY2VSZWNvcmRzXC5zdHVkZW50SWRbXHNcU10qYXR0ZW5kYW5jZVZlcmlmaWNhdGlvbkF0dGVtcHRzXC5zdHVkZW50SWQvLnRlc3QocGVuZGluZykpIHRocm93IG5ldyBFcnJvcigiUGVuZGluZyByb3V0ZSBkb2VzIG5vdCBzdXBwcmVzcyBhbHJlYWR5LXJlY29yZGVkIGR1cGxpY2F0ZSBhdHRlbXB0cyBieSBzY2hvb2wvc2Vzc2lvbi9zdHVkZW50Iik7CmNvbnNvbGUubG9nKCJDQVNBIFNjYW5uZXIgcGVuZGluZy1hdHRlbXB0IHJlY292ZXJ5IGNvbnRyYWN0IHNlbGYtdGVzdCBwYXNzZWQuIik7Cg=="
        )

    $NewRecoverySelftest =
        [Text.Encoding]::UTF8.GetString(
            $RecoverySelftestBytes
        )

    $WriteStarted = $true

    [System.IO.File]::WriteAllBytes(
        $PendingRoutePath,
        $PendingRouteBytes
    )

    [System.IO.File]::WriteAllBytes(
        $RecoverySelftestPath,
        $RecoverySelftestBytes
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
    Write-Host "CASA DUPLICATE-SAFE PENDING SCANNER RECOVERY HARDENING V1R1 IS GREEN" -ForegroundColor Green
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
