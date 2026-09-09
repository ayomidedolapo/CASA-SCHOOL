param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"

$AttemptId = "c3609f74-7abe-4e33-9f50-ce0a33664e16"

$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedScannerHash = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
$ExpectedAwsHash = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"

$MigrationPins = [ordered]@{
    "drizzle\20260909020000_pass-a-enum-expansion\migration.sql" =
        "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
    "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql" =
        "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"
}

$ExpectedAwsAccount = "938733852185"
$ExpectedBackendPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/"
$LoginProfile = "casa-dev"
$BackendProfile = "casa-biometric-dev"
$ExpectedRegion = "eu-west-1"
$StreamingRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$EvidenceRoot = $null
$ProbePath = $null
$DevProcess = $null

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

function Tail([string]$Path, [int]$Count = 120) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Get-Content `
            -LiteralPath $Path `
            -Tail $Count `
            -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host $_ }
    }
}

function Read-EnvMap([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Phase ".env.local is missing."
    }

    $map = @{}

    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = ([string]$raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace($line) -or
            $line.StartsWith("#")
        ) {
            continue
        }

        $eq = $line.IndexOf("=")

        if ($eq -le 0) {
            continue
        }

        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value =
                $value.Substring(
                    1,
                    $value.Length - 2
                )
        }

        $map[$key] = $value
    }

    return $map
}

function Find-AwsExe {
    $candidates =
        New-Object System.Collections.Generic.List[string]

    try {
        $cmd =
            Get-Command `
                aws.exe `
                -CommandType Application `
                -ErrorAction SilentlyContinue |
            Select-Object -First 1

        if (
            $cmd -and
            -not [string]::IsNullOrWhiteSpace([string]$cmd.Source)
        ) {
            [void]$candidates.Add([string]$cmd.Source)
        }
    }
    catch {}

    foreach ($candidate in @(
        $(if ($env:ProgramFiles) {
            Join-Path $env:ProgramFiles "Amazon\AWSCLIV2\aws.exe"
        } else { $null }),
        $(if (${env:ProgramFiles(x86)}) {
            Join-Path ${env:ProgramFiles(x86)} "Amazon\AWSCLIV2\aws.exe"
        } else { $null }),
        $(if ($env:LOCALAPPDATA) {
            Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe"
        } else { $null }),
        $(if ($env:LOCALAPPDATA) {
            Join-Path $env:LOCALAPPDATA "Amazon\AWSCLIV2\aws.exe"
        } else { $null })
    )) {
        if (
            -not [string]::IsNullOrWhiteSpace([string]$candidate)
        ) {
            [void]$candidates.Add([string]$candidate)
        }
    }

    foreach (
        $candidate in
        @($candidates | Select-Object -Unique)
    ) {
        if (
            -not [string]::IsNullOrWhiteSpace([string]$candidate) -and
            (Test-Path -LiteralPath $candidate -PathType Leaf)
        ) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return $null
}

function Invoke-AwsJson(
    [string]$AwsExe,
    [string[]]$Arguments
) {
    $stderr =
        Join-Path `
            $EvidenceRoot `
            ("aws-" + [guid]::NewGuid().ToString("N") + ".stderr.log")

    try {
        $stdout =
            @(
                & $AwsExe @Arguments 2> $stderr
            )

        $exit = $LASTEXITCODE

        if ($exit -ne 0) {
            $err =
                if (Test-Path -LiteralPath $stderr) {
                    (
                        Get-Content `
                            -LiteralPath $stderr `
                            -Raw `
                            -ErrorAction SilentlyContinue
                    ).Trim()
                }
                else {
                    ""
                }

            return [pscustomobject]@{
                ok = $false
                data = $null
                error = $err
            }
        }

        $joined =
            ($stdout | ForEach-Object { [string]$_ }) -join "`n"

        try {
            $data =
                if ([string]::IsNullOrWhiteSpace($joined)) {
                    $null
                }
                else {
                    $joined | ConvertFrom-Json
                }

            return [pscustomobject]@{
                ok = $true
                data = $data
                error = $null
            }
        }
        catch {
            return [pscustomobject]@{
                ok = $false
                data = $null
                error = "AWS CLI returned invalid JSON."
            }
        }
    }
    finally {
        Remove-Item `
            -LiteralPath $stderr `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Run-Probe(
    [string]$Label,
    [int]$MaxAttempts = 4
) {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $output =
            @(
                & node.exe `
                    --env-file=.env.local `
                    $ProbePath `
                    $AttemptId 2>&1
            )

        if ($LASTEXITCODE -eq 0) {
            $lines =
                @(
                    $output |
                        ForEach-Object { [string]$_ } |
                        Where-Object {
                            -not [string]::IsNullOrWhiteSpace($_)
                        }
                )

            if ($lines.Count -eq 0) {
                Stop-Phase "$Label returned no JSON."
            }

            try {
                return (
                    $lines[-1] |
                        ConvertFrom-Json -Depth 40
                )
            }
            catch {
                $lines |
                    ForEach-Object { Write-Host $_ }

                Stop-Phase "$Label returned invalid JSON."
            }
        }

        Write-Host "  $Label Development read attempt ${attempt}/${MaxAttempts}: FAILED"

        if ($attempt -lt $MaxAttempts) {
            $delay = $attempt * 2
            Write-Host "    retrying read-only Neon probe after ${delay}s..."
            Start-Sleep -Seconds $delay
        }
        else {
            Write-Host "  $Label final Neon error:"
            $output |
                Select-Object -Last 30 |
                ForEach-Object {
                    Write-Host "    $_"
                }

            Stop-Phase "$Label read-only Development probe failed after $MaxAttempts attempts."
        }
    }
}

Write-Host "CASA School - Same-Attempt Scanner Face/Liveness Live Recovery V1" -ForegroundColor Green
Write-Host "Development-only live biometric ceremony for the exact already-card-matched pending attempt."
Write-Host "DO NOT scan the student card. The Scanner must recover the existing attempt and resume at FACE_RETRY."
Write-Host "This run may create one AWS Face Liveness session and, only on successful verification, one attendance record/evidence/presence event."
Write-Host "No CASA source/schema/migration mutation. No IAM/resource-policy mutation. No Staging/Production connection."
Write-Host "Attempt: $AttemptId"

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Phase "CASA project root not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\scanner-same-attempt-face-live-recovery-v1-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $EvidenceRoot `
        -Force |
        Out-Null

    Step "Locking the exact post-recovery source authority"

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short HEAD).Trim()

    if (
        $branch -ne $ExpectedBranch -or
        $head -ne $ExpectedHead
    ) {
        Stop-Phase "Git checkpoint drift: $branch/$head"
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
        Stop-Phase "Scanner post-recovery hash drift."
    }

    if ((Sha $AwsPath) -ne $ExpectedAwsHash) {
        Stop-Phase "AWS liveness post-recovery hash drift."
    }

    foreach ($required in @(
        $PendingRoutePath,
        $RecoverySelftestPath
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            Stop-Phase "Pending-attempt recovery source is incomplete: $required"
        }
    }

    $scannerSource =
        Get-Content -LiteralPath $ScannerPath -Raw
    $awsSource =
        Get-Content -LiteralPath $AwsPath -Raw
    $pendingSource =
        Get-Content -LiteralPath $PendingRoutePath -Raw

    foreach ($marker in @(
        "/api/terminal/attempts/pending",
        "recoverPendingAttempt",
        "terminalFetchWithRetry",
        "FACE_RETRY",
        "Try face verification again",
        "FaceLivenessDetectorCore"
    )) {
        if (-not $scannerSource.Contains($marker)) {
            Stop-Phase "Scanner recovery contract lost marker: $marker"
        }
    }

    foreach ($marker in @(
        "LIVENESS_SESSION_EXPIRED",
        "activeSession.providerSessionId",
        "issueAwsLivenessStreamingCredentials",
        "replayed:"
    )) {
        if (-not $awsSource.Contains($marker)) {
            Stop-Phase "AWS replay-safe liveness contract lost marker: $marker"
        }
    }

    foreach ($marker in @(
        "authenticateTerminalRequest",
        "attendanceVerificationAttempts",
        "duplicatePendingCount"
    )) {
        if (-not $pendingSource.Contains($marker)) {
            Stop-Phase "Pending-attempt route lost marker: $marker"
        }
    }

    $migrationFiles =
        @(
            Get-ChildItem `
                -LiteralPath (Join-Path $ProjectRoot "drizzle") `
                -Filter "migration.sql" `
                -File `
                -Recurse
        )

    if ($migrationFiles.Count -ne 30) {
        Stop-Phase "Expected exactly 30 local migrations; found $($migrationFiles.Count)."
    }

    foreach ($relative in $MigrationPins.Keys) {
        if (
            (Sha (Join-Path $ProjectRoot $relative)) -ne
            [string]$MigrationPins[$relative]
        ) {
            Stop-Phase "Migration checksum drift: $relative"
        }
    }

    Write-Host "  branch/head:                  $branch/$head"
    Write-Host "  local migrations:             30 / VERIFIED"
    Write-Host "  Scanner recovery SHA:         VERIFIED / $ExpectedScannerHash"
    Write-Host "  AWS liveness recovery SHA:    VERIFIED / $ExpectedAwsHash"
    Write-Host "  pending-attempt route:        PRESENT / VERIFIED"
    Write-Host "  source mutation planned:      NONE"

    Step "Creating exact-attempt Development read-only probe"

    $ProbePath =
        Join-Path `
            $EvidenceRoot `
            "same-attempt-readonly-probe.mjs"

    $probeSource = @'
import { neon } from "@neondatabase/serverless";

const EXPECTED_HOST =
  "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech";

const attemptId =
  process.argv[2];

if (!attemptId) {
  throw new Error(
    "Attempt id missing.",
  );
}

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
  await sql`
    select count(*)::int as count
    from drizzle.__drizzle_migrations
  `;

const attemptRows =
  await sql`
    select
      a.id,
      a.school_id,
      a.student_id,
      a.terminal_id,
      a.session_id,
      s.attendance_date::text as attendance_date,
      s.status::text as session_status,
      s.closed_at,
      a.operation::text as operation,
      a.card_result::text as card_result,
      a.face_result::text as face_result,
      a.liveness_result::text as liveness_result,
      a.time_result::text as time_result,
      a.outcome::text as outcome,
      a.reason_code,
      a.occurred_at,
      a.completed_at,
      d.check_in_opens_at::text as check_in_opens_at,
      d.check_in_closes_at::text as check_in_closes_at,
      (
        (now() at time zone 'Africa/Lagos')::time >=
          d.check_in_opens_at
        and
        (now() at time zone 'Africa/Lagos')::time <=
          d.check_in_closes_at
      ) as check_in_window_open
    from attendance_verification_attempts a
    join attendance_sessions s
      on s.school_id=a.school_id
     and s.id=a.session_id
    left join attendance_policy_days d
      on d.school_id=s.school_id
     and d.policy_id=s.policy_id
     and d.weekday=extract(dow from s.attendance_date)::int
    where a.id=${attemptId}::uuid
    limit 1
  `;

const attempt =
  attemptRows[0] ??
  null;

let livenessSessions = [];
let protectedCounts = null;
let activeProfileCount = 0;
let activeTerminalCount = 0;
let attemptPopulation = [];
let attendanceRecords = [];
let evidenceRows = [];
let presenceRows = [];

if (attempt) {
  livenessSessions =
    await sql`
      select
        id,
        provider_session_id,
        status::text as status,
        failure_code,
        expires_at,
        completed_at,
        liveness_confidence_bps,
        face_similarity_bps,
        created_at
      from biometric_liveness_sessions
      where school_id=${attempt.school_id}::uuid
        and attempt_id=${attemptId}::uuid
        and purpose='VERIFICATION'
      order by created_at asc,id asc
    `;

  protectedCounts =
    (
      await sql`
        select
          (
            select count(*)::int
            from student_attendance_records
            where source_attempt_id=${attemptId}::uuid
          ) as attendance,
          (
            select count(*)::int
            from student_presence_events
            where attempt_id=${attemptId}::uuid
          ) as presence,
          (
            select count(*)::int
            from biometric_verification_evidence
            where attempt_id=${attemptId}::uuid
          ) as evidence
      `
    )[0];

  activeProfileCount =
    Number(
      (
        await sql`
          select count(*)::int as count
          from student_biometric_profiles
          where school_id=${attempt.school_id}::uuid
            and student_id=${attempt.student_id}::uuid
            and status='ACTIVE'
        `
      )[0]?.count ??
      -1,
    );

  activeTerminalCount =
    Number(
      (
        await sql`
          select count(*)::int as count
          from attendance_terminals
          where school_id=${attempt.school_id}::uuid
            and id=${attempt.terminal_id}::uuid
            and status='ACTIVE'
        `
      )[0]?.count ??
      -1,
    );

  attemptPopulation =
    await sql`
      select
        id,
        occurred_at,
        completed_at,
        outcome::text as outcome,
        card_result::text as card_result,
        face_result::text as face_result,
        liveness_result::text as liveness_result
      from attendance_verification_attempts
      where school_id=${attempt.school_id}::uuid
        and student_id=${attempt.student_id}::uuid
        and terminal_id=${attempt.terminal_id}::uuid
      order by occurred_at asc,id asc
    `;

  attendanceRecords =
    await sql`
      select
        id,
        session_id,
        source_attempt_id,
        presence_state::text as presence_state,
        status::text as status,
        recorded_at
      from student_attendance_records
      where source_attempt_id=${attemptId}::uuid
      order by created_at,id
    `;

  evidenceRows =
    await sql`
      select
        id,
        attempt_id,
        profile_id,
        face_confidence_bps,
        liveness_confidence_bps,
        verified_at
      from biometric_verification_evidence
      where attempt_id=${attemptId}::uuid
      order by created_at,id
    `;

  presenceRows =
    await sql`
      select
        id,
        session_id,
        attempt_id,
        event_type::text as event_type,
        occurred_at
      from student_presence_events
      where attempt_id=${attemptId}::uuid
      order by created_at,id
    `;
}

console.log(
  JSON.stringify({
    host:
      parsed.hostname,
    migrations:
      Number(
        migrations[0]?.count ??
        -1,
      ),
    clock,
    attempt,
    livenessSessions,
    protectedCounts,
    activeProfileCount,
    activeTerminalCount,
    attemptPopulation,
    attendanceRecords,
    evidenceRows,
    presenceRows,
  }),
);
'@

    [System.IO.File]::WriteAllText(
        $ProbePath,
        $probeSource,
        $Utf8NoBom
    )

    Step "Re-proving exact pending attempt before any live biometric action"

    $Before =
        Run-Probe `
            "Pre-live exact-attempt"

    $Before |
        ConvertTo-Json -Depth 40 |
        Set-Content `
            -LiteralPath (Join-Path $EvidenceRoot "BEFORE.json") `
            -Encoding UTF8

    if (
        [string]$Before.host -ne
        $ExpectedDevelopmentHost
    ) {
        Stop-Phase "Wrong Development host."
    }

    if ([int]$Before.migrations -ne 30) {
        Stop-Phase "Development DB migration count drifted."
    }

    if ($null -eq $Before.attempt) {
        Stop-Phase "Exact pending attempt no longer exists."
    }

    if (
        [string]$Before.attempt.id -ne $AttemptId -or
        [string]$Before.attempt.operation -ne "CHECK_IN" -or
        [string]$Before.attempt.card_result -ne "MATCHED" -or
        [string]$Before.attempt.face_result -ne "NOT_RUN" -or
        [string]$Before.attempt.liveness_result -ne "NOT_RUN" -or
        [string]$Before.attempt.outcome -ne "PENDING" -or
        $null -ne $Before.attempt.completed_at
    ) {
        Stop-Phase "Exact attempt is no longer MATCHED / NOT_RUN / NOT_RUN / PENDING."
    }

    if (
        [string]$Before.attempt.session_status -ne "OPEN" -or
        $null -ne $Before.attempt.closed_at
    ) {
        Stop-Phase "Exact attempt's attendance session is no longer OPEN."
    }

    if (
        [string]$Before.attempt.attendance_date -ne
        [string]$Before.clock.date
    ) {
        Stop-Phase "Exact pending attempt is no longer for today's Africa/Lagos attendance date."
    }

    if ($Before.attempt.check_in_window_open -ne $true) {
        Stop-Phase "Current time is outside the attempt session's authorized CHECK_IN window. No live recovery will be attempted."
    }

    if (@($Before.livenessSessions).Count -ne 0) {
        Stop-Phase "Exact attempt already has a liveness session. This zero-session recovery gate will not create another."
    }

    if (
        [int]$Before.protectedCounts.attendance -ne 0 -or
        [int]$Before.protectedCounts.presence -ne 0 -or
        [int]$Before.protectedCounts.evidence -ne 0
    ) {
        Stop-Phase "Protected records already exist for the pending attempt."
    }

    if ([int]$Before.activeProfileCount -ne 1) {
        Stop-Phase "Exact student does not have exactly one ACTIVE biometric profile."
    }

    if ([int]$Before.activeTerminalCount -ne 1) {
        Stop-Phase "Exact terminal is not ACTIVE."
    }

    $BeforeAttemptIds =
        @(
            @($Before.attemptPopulation) |
                ForEach-Object { [string]$_.id }
        )

    Write-Host "  school-local date/time:       $($Before.clock.date) $($Before.clock.time)"
    Write-Host "  exact attempt:                MATCHED / NOT_RUN / NOT_RUN / PENDING"
    Write-Host "  session/window:               OPEN / CHECK_IN AUTHORIZED"
    Write-Host "  liveness sessions:            0"
    Write-Host "  active biometric profile:     1 / VERIFIED"
    Write-Host "  active terminal:              1 / VERIFIED"
    Write-Host "  attendance/presence/evidence: 0/0/0"
    Write-Host "  attempt population baseline:  $($BeforeAttemptIds.Count)"

    Step "Re-proving Development AWS credential/runtime authority"

    $AwsExe =
        Find-AwsExe

    if ([string]::IsNullOrWhiteSpace([string]$AwsExe)) {
        Stop-Phase "AWS CLI v2 executable not found."
    }

    $awsVersion =
        @(
            & $AwsExe --version 2>&1
        ) -join " "

    if ($LASTEXITCODE -ne 0 -or $awsVersion -notmatch "aws-cli/2\.") {
        Stop-Phase "AWS CLI v2 is not available."
    }

    $identity =
        Invoke-AwsJson `
            $AwsExe `
            @(
                "sts",
                "get-caller-identity",
                "--profile",
                $BackendProfile,
                "--region",
                $ExpectedRegion,
                "--output",
                "json",
                "--no-cli-pager"
            )

    if (-not $identity.ok) {
        Write-Host "  backend profile requires browser-login refresh."

        & $AwsExe `
            login `
            --profile $LoginProfile `
            --region $ExpectedRegion `
            --no-cli-pager

        if ($LASTEXITCODE -ne 0) {
            Stop-Phase "AWS casa-dev browser login refresh failed."
        }

        $identity =
            Invoke-AwsJson `
                $AwsExe `
                @(
                    "sts",
                    "get-caller-identity",
                    "--profile",
                    $BackendProfile,
                    "--region",
                    $ExpectedRegion,
                    "--output",
                    "json",
                    "--no-cli-pager"
                )
    }

    if (
        -not $identity.ok -or
        [string]$identity.data.Account -ne $ExpectedAwsAccount -or
        -not ([string]$identity.data.Arn).StartsWith($ExpectedBackendPrefix)
    ) {
        Stop-Phase "CASA backend AWS profile did not resolve to the expected Development biometric role."
    }

    $rekognition =
        Invoke-AwsJson `
            $AwsExe `
            @(
                "rekognition",
                "list-collections",
                "--max-results",
                "1",
                "--profile",
                $BackendProfile,
                "--region",
                $ExpectedRegion,
                "--output",
                "json",
                "--no-cli-pager"
            )

    if (-not $rekognition.ok) {
        Stop-Phase "Expected backend role cannot access Rekognition control plane."
    }

    Write-Host "  AWS CLI:                     V2 / VERIFIED"
    Write-Host "  backend assumed role:        VERIFIED"
    Write-Host "  Rekognition control plane:   VERIFIED"
    Write-Host "  AWS credential values:       HIDDEN"

    $oldAwsProfile = $env:AWS_PROFILE
    $oldAwsRegion = $env:AWS_REGION
    $oldAwsDefault = $env:AWS_DEFAULT_REGION
    $oldSdk = $env:AWS_SDK_LOAD_CONFIG
    $oldStream = $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN
    $oldCasaRegion = $env:CASA_AWS_REKOGNITION_REGION
    $oldQuality = $env:CASA_AWS_REKOGNITION_QUALITY_FILTER
    $oldNodeOptions = $env:NODE_OPTIONS
    $oldPath = $env:PATH

    try {
        $env:AWS_PROFILE = $BackendProfile
        $env:AWS_REGION = $ExpectedRegion
        $env:AWS_DEFAULT_REGION = $ExpectedRegion
        $env:AWS_SDK_LOAD_CONFIG = "1"
        $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $StreamingRoleArn
        $env:CASA_AWS_REKOGNITION_REGION = $ExpectedRegion
        $env:CASA_AWS_REKOGNITION_QUALITY_FILTER = "AUTO"

        $awsDir =
            Split-Path `
                -Parent `
                $AwsExe

        if (
            -not [string]::IsNullOrWhiteSpace($awsDir) -and
            ($env:PATH -split ";" -notcontains $awsDir)
        ) {
            $env:PATH =
                "$awsDir;$($env:PATH)"
        }

        $requiredNode =
            "--dns-result-order=ipv4first --no-network-family-autoselection"

        if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
            $env:NODE_OPTIONS = $requiredNode
        }
        elseif ($env:NODE_OPTIONS -notmatch "dns-result-order=ipv4first") {
            $env:NODE_OPTIONS =
                "$($env:NODE_OPTIONS) $requiredNode"
        }

        Step "Starting isolated Development Scanner runtime with verified AWS environment"

        $listener =
            Get-NetTCPConnection `
                -LocalPort 3000 `
                -State Listen `
                -ErrorAction SilentlyContinue

        if ($null -ne $listener) {
            Stop-Phase "Port 3000 already has a listener. Close the existing local CASA server and rerun; this gate requires an isolated runtime."
        }

        $ServerOut =
            Join-Path $EvidenceRoot "dev-server.stdout.log"
        $ServerErr =
            Join-Path $EvidenceRoot "dev-server.stderr.log"

        $DevProcess =
            Start-Process `
                -FilePath "cmd.exe" `
                -ArgumentList @(
                    "/d",
                    "/s",
                    "/c",
                    "npm run dev -- --webpack"
                ) `
                -WorkingDirectory $ProjectRoot `
                -RedirectStandardOutput $ServerOut `
                -RedirectStandardError $ServerErr `
                -PassThru `
                -WindowStyle Hidden

        $healthy = $false

        for ($i = 0; $i -lt 120; $i++) {
            Start-Sleep -Seconds 1

            $DevProcess.Refresh()

            if ($DevProcess.HasExited) {
                Write-Host ""
                Write-Host "--- server stdout tail ---"
                Tail $ServerOut 100
                Write-Host ""
                Write-Host "--- server stderr tail ---"
                Tail $ServerErr 140

                Stop-Phase "Development server exited before Scanner readiness."
            }

            try {
                $health =
                    Invoke-WebRequest `
                        -Uri "http://localhost:3000/api/health" `
                        -UseBasicParsing `
                        -TimeoutSec 4 `
                        -ErrorAction Stop

                if ([int]$health.StatusCode -eq 200) {
                    $healthy = $true
                    break
                }
            }
            catch {}
        }

        if (-not $healthy) {
            Write-Host ""
            Write-Host "--- server stdout tail ---"
            Tail $ServerOut 100
            Write-Host ""
            Write-Host "--- server stderr tail ---"
            Tail $ServerErr 160

            Stop-Phase "Development server did not become healthy."
        }

        # Re-prove no state changed merely by starting the runtime.
        $BeforeBrowser =
            Run-Probe `
                "Pre-browser exact-attempt"

        if (
            [string]$BeforeBrowser.attempt.id -ne $AttemptId -or
            [string]$BeforeBrowser.attempt.card_result -ne "MATCHED" -or
            [string]$BeforeBrowser.attempt.face_result -ne "NOT_RUN" -or
            [string]$BeforeBrowser.attempt.liveness_result -ne "NOT_RUN" -or
            [string]$BeforeBrowser.attempt.outcome -ne "PENDING" -or
            @($BeforeBrowser.livenessSessions).Count -ne 0 -or
            [int]$BeforeBrowser.protectedCounts.attendance -ne 0 -or
            [int]$BeforeBrowser.protectedCounts.presence -ne 0 -or
            [int]$BeforeBrowser.protectedCounts.evidence -ne 0
        ) {
            Stop-Phase "Exact pending attempt changed before browser authorization."
        }

        $BrowserUrl =
            "http://localhost:3000/scanner"

        try {
            Start-Process $BrowserUrl
        }
        catch {
            Write-Host "Open manually: $BrowserUrl"
        }

        Write-Host ""
        Write-Host "================ SAME-ATTEMPT FACE RECOVERY ================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Scanner: $BrowserUrl"
        Write-Host "Exact attempt: $AttemptId"
        Write-Host ""
        Write-Host "DO NOT PUT THE STUDENT CARD IN FRONT OF THE CAMERA."
        Write-Host ""
        Write-Host "1. The existing CASA Controlled Main Gate Scanner credential should load from the same localhost browser storage."
        Write-Host "2. CASA should recover the pending attempt automatically and show the student's identity with:"
        Write-Host "      Try face verification again"
        Write-Host "   / a message saying pending face verification was recovered."
        Write-Host "3. Click 'Try face verification again' ONCE."
        Write-Host "4. Complete the AWS face/liveness camera ceremony ONCE with the student's real face."
        Write-Host "5. Wait for the Scanner result."
        Write-Host ""
        Write-Host "FAIL-CLOSED RULES:"
        Write-Host "  - If the Scanner shows 'Hold your CASA student card...' instead: DO NOT SCAN. Return here."
        Write-Host "  - If it asks for a terminal credential: DO NOT provision another terminal. Return here."
        Write-Host "  - If face/liveness errors after that single click: DO NOT click retry a second time. Return here."
        Write-Host "  - Never scan the card during this run."
        Write-Host ""
        Write-Host "After the single face result OR any unexpected Scanner state, return to this PowerShell window."
        Write-Host ""

        [void](
            Read-Host `
                "Press ENTER after the single face/liveness result (or after stopping without scanning)"
        )

        Step "Reading authoritative same-attempt Development postflight"

        $After =
            Run-Probe `
                "Post-live exact-attempt"

        $After |
            ConvertTo-Json -Depth 40 |
            Set-Content `
                -LiteralPath (Join-Path $EvidenceRoot "AFTER.json") `
                -Encoding UTF8

        if (
            [string]$After.host -ne $ExpectedDevelopmentHost -or
            [int]$After.migrations -ne 30
        ) {
            Stop-Phase "Postflight Development boundary drifted."
        }

        if (
            (Sha $ScannerPath) -ne $ExpectedScannerHash -or
            (Sha $AwsPath) -ne $ExpectedAwsHash -or
            (Sha $PackagePath) -ne $ExpectedPackageHash
        ) {
            Stop-Phase "Protected source changed during the live biometric ceremony."
        }

        $AfterAttemptIds =
            @(
                @($After.attemptPopulation) |
                    ForEach-Object { [string]$_.id }
            )

        if (
            $AfterAttemptIds.Count -ne $BeforeAttemptIds.Count -or
            (Compare-Object $BeforeAttemptIds $AfterAttemptIds).Count -ne 0
        ) {
            Write-Host ""
            Write-Host "ATTEMPT POPULATION CHANGED. A NEW CARD-SCAN ATTEMPT MAY HAVE BEEN CREATED." -ForegroundColor Red
            Write-Host "  before attempts: $($BeforeAttemptIds.Count)"
            Write-Host "  after attempts:  $($AfterAttemptIds.Count)"
            Write-Host ""
            Write-Host "--- server stdout tail ---"
            Tail $ServerOut 160
            Write-Host ""
            Write-Host "--- server stderr tail ---"
            Tail $ServerErr 200

            Stop-Phase "No new attempt was authorized. Do not scan or retry."
        }

        if ($null -eq $After.attempt) {
            Stop-Phase "Exact attempt disappeared after the live ceremony."
        }

        $green =
            [string]$After.attempt.id -eq $AttemptId -and
            [string]$After.attempt.operation -eq "CHECK_IN" -and
            [string]$After.attempt.card_result -eq "MATCHED" -and
            [string]$After.attempt.face_result -eq "PASSED" -and
            [string]$After.attempt.liveness_result -eq "PASSED" -and
            [string]$After.attempt.outcome -eq "RECORDED" -and
            $null -ne $After.attempt.completed_at

        if (-not $green) {
            Write-Host ""
            Write-Host "SAME-ATTEMPT FACE/LIVENESS DID NOT REACH GREEN. NO SECOND TRY IS AUTHORIZED." -ForegroundColor Red
            Write-Host "  attempt:          $($After.attempt.id)"
            Write-Host "  card:             $($After.attempt.card_result)"
            Write-Host "  face:             $($After.attempt.face_result)"
            Write-Host "  liveness:         $($After.attempt.liveness_result)"
            Write-Host "  outcome:          $($After.attempt.outcome)"
            Write-Host "  reason:           $($After.attempt.reason_code)"
            Write-Host "  liveness sessions: $(@($After.livenessSessions).Count)"

            foreach ($session in @($After.livenessSessions)) {
                Write-Host "    session status: $($session.status) / failure=$($session.failure_code)"
            }

            Write-Host "  attendance/presence/evidence: $($After.protectedCounts.attendance)/$($After.protectedCounts.presence)/$($After.protectedCounts.evidence)"
            Write-Host ""
            Write-Host "--- server stdout tail ---"
            Tail $ServerOut 180
            Write-Host ""
            Write-Host "--- server stderr tail ---"
            Tail $ServerErr 220

            $failed =
                [ordered]@{
                    createdAt = (Get-Date -Format o)
                    proof = "CASA_SCANNER_SAME_ATTEMPT_FACE_LIVE_RECOVERY_V1"
                    classification = "NOT_GREEN_NO_RETRY_AUTHORIZED"
                    attemptId = $AttemptId
                    card = [string]$After.attempt.card_result
                    face = [string]$After.attempt.face_result
                    liveness = [string]$After.attempt.liveness_result
                    outcome = [string]$After.attempt.outcome
                    reasonCode = [string]$After.attempt.reason_code
                    livenessSessionCount = @($After.livenessSessions).Count
                    attemptPopulationUnchanged = $true
                    cardRescanPerformed = $false
                    sourceMutation = $false
                    stagingTouched = $false
                    productionTouched = $false
                }

            $failed |
                ConvertTo-Json -Depth 12 |
                Set-Content `
                    -LiteralPath (Join-Path $EvidenceRoot "RESULT.json") `
                    -Encoding UTF8

            Stop-Phase "Return this complete output. Do not scan the card or click face retry again."
        }

        if (
            [int]$After.protectedCounts.attendance -ne 1 -or
            [int]$After.protectedCounts.presence -ne 1 -or
            [int]$After.protectedCounts.evidence -ne 1
        ) {
            Stop-Phase "Attempt reached RECORDED but protected record counts are not exactly 1/1/1."
        }

        $records =
            @($After.attendanceRecords)
        $evidence =
            @($After.evidenceRows)
        $presence =
            @($After.presenceRows)
        $liveness =
            @($After.livenessSessions)

        if (
            $records.Count -ne 1 -or
            [string]$records[0].source_attempt_id -ne $AttemptId -or
            [string]$records[0].session_id -ne [string]$After.attempt.session_id -or
            [string]$records[0].presence_state -ne "ON_CAMPUS"
        ) {
            Stop-Phase "Attendance record is not atomically tied to the exact recovered attempt."
        }

        if (
            $evidence.Count -ne 1 -or
            [string]$evidence[0].attempt_id -ne $AttemptId
        ) {
            Stop-Phase "Trusted biometric evidence is not bound to the exact recovered attempt."
        }

        if (
            $presence.Count -ne 1 -or
            [string]$presence[0].attempt_id -ne $AttemptId -or
            [string]$presence[0].session_id -ne [string]$After.attempt.session_id -or
            [string]$presence[0].event_type -ne "CHECKED_IN"
        ) {
            Stop-Phase "CHECKED_IN presence event is not bound to the exact recovered attempt."
        }

        $completedLiveness =
            @(
                $liveness |
                    Where-Object {
                        [string]$_.status -eq "COMPLETED" -and
                        $null -ne $_.completed_at
                    }
            )

        if (
            $liveness.Count -ne 1 -or
            $completedLiveness.Count -ne 1
        ) {
            Stop-Phase "Exact recovered attempt does not have exactly one COMPLETED verification liveness session."
        }

        $result =
            [ordered]@{
                createdAt = (Get-Date -Format o)
                proof = "CASA_SCANNER_SAME_ATTEMPT_FACE_LIVE_RECOVERY_V1"
                classification = "GREEN"
                attemptId = $AttemptId
                sameAttemptRecovered = $true
                attemptPopulationUnchanged = $true
                cardRescanPerformed = $false
                card = "MATCHED"
                face = "PASSED"
                liveness = "PASSED"
                livenessSession = "COMPLETED"
                attendanceRecord = 1
                biometricEvidence = 1
                presenceEvent = "CHECKED_IN"
                sourceMutation = $false
                migrationMutation = $false
                stagingTouched = $false
                productionTouched = $false
            }

        $result |
            ConvertTo-Json -Depth 12 |
            Set-Content `
                -LiteralPath (Join-Path $EvidenceRoot "RESULT.json") `
                -Encoding UTF8

        Write-Host ""
        Write-Host "CASA SAME-ATTEMPT SCANNER FACE/LIVENESS RECOVERY IS GREEN" -ForegroundColor Green
        Write-Host "  exact attempt:                 $AttemptId"
        Write-Host "  new card scan/attempt:         NO / ATTEMPT POPULATION UNCHANGED"
        Write-Host "  card:                          MATCHED / PRESERVED"
        Write-Host "  face:                          PASSED"
        Write-Host "  AWS liveness:                  COMPLETED / PASSED"
        Write-Host "  outcome:                       RECORDED"
        Write-Host "  attendance record:             1 / EXACT ATTEMPT"
        Write-Host "  trusted biometric evidence:    1 / EXACT ATTEMPT"
        Write-Host "  presence event:                CHECKED_IN / EXACT ATTEMPT"
        Write-Host "  source/migration changes:      NO"
        Write-Host "  Staging/Production:            NOT TOUCHED"
        Write-Host "  evidence:                      $EvidenceRoot"
        Write-Host ""
        Write-Host "NEXT: return this complete GREEN output. Development Scanner liveness/face acceptance is then closed." -ForegroundColor Yellow
    }
    finally {
        if ($null -ne $oldAwsProfile) {
            $env:AWS_PROFILE = $oldAwsProfile
        }
        else {
            Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldAwsRegion) {
            $env:AWS_REGION = $oldAwsRegion
        }
        else {
            Remove-Item Env:AWS_REGION -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldAwsDefault) {
            $env:AWS_DEFAULT_REGION = $oldAwsDefault
        }
        else {
            Remove-Item Env:AWS_DEFAULT_REGION -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldSdk) {
            $env:AWS_SDK_LOAD_CONFIG = $oldSdk
        }
        else {
            Remove-Item Env:AWS_SDK_LOAD_CONFIG -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldStream) {
            $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $oldStream
        }
        else {
            Remove-Item Env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldCasaRegion) {
            $env:CASA_AWS_REKOGNITION_REGION = $oldCasaRegion
        }
        else {
            Remove-Item Env:CASA_AWS_REKOGNITION_REGION -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldQuality) {
            $env:CASA_AWS_REKOGNITION_QUALITY_FILTER = $oldQuality
        }
        else {
            Remove-Item Env:CASA_AWS_REKOGNITION_QUALITY_FILTER -ErrorAction SilentlyContinue
        }

        if ($null -ne $oldNodeOptions) {
            $env:NODE_OPTIONS = $oldNodeOptions
        }
        else {
            Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
        }

        $env:PATH = $oldPath
    }
}
catch {
    Write-Host ""
    Write-Host "CASA SAME-ATTEMPT FACE/LIVENESS LIVE RECOVERY STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($EvidenceRoot) {
        Write-Host "Evidence: $EvidenceRoot"
    }

    throw
}
finally {
    if ($DevProcess) {
        try {
            $DevProcess.Refresh()

            if (-not $DevProcess.HasExited) {
                & taskkill.exe `
                    /PID $DevProcess.Id `
                    /T `
                    /F |
                    Out-Null
            }
        }
        catch {
            try {
                Stop-Process `
                    -Id $DevProcess.Id `
                    -Force `
                    -ErrorAction SilentlyContinue
            }
            catch {}
        }
    }
}
