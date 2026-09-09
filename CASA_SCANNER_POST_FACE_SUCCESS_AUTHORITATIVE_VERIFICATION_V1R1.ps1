param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"

$TargetAttemptId = "caa12c89-a355-41eb-b387-8eed946cf3b5"
$OlderAttemptId = "c3609f74-7abe-4e33-9f50-ce0a33664e16"

$ExpectedAttemptIds = @(
    "7e2cad4c-c088-4353-966f-9b4e88ec5baa",
    "dab3c087-f749-47fa-8dd5-3edd83dec63f",
    "fd2f2465-9973-4191-a2e8-62fdbafde910",
    "d38aa227-0200-42ec-9087-cdf32f55c9f5",
    "c3609f74-7abe-4e33-9f50-ce0a33664e16",
    "caa12c89-a355-41eb-b387-8eed946cf3b5"
)

$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedScannerHash = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
$ExpectedAwsHash = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"
$ExpectedPendingRouteHash = "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"
$ExpectedRecoverySelftestHash = "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"

$Migration29Relative = "drizzle\20260909020000_pass-a-enum-expansion\migration.sql"
$Migration29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$Migration30Relative = "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql"
$Migration30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Evidence = $null

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

function Invoke-ReadOnlyState(
    [string]$DatabaseUrl,
    [int]$MaxAttempts = 4
) {
    $Probe =
        Join-Path `
            $Evidence `
            "post-face-readonly-websocket.mjs"

    $Code = @'
import {
  Pool,
  neonConfig,
} from "@neondatabase/serverless";

const expectedHost =
  "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech";

const targetAttemptId =
  "caa12c89-a355-41eb-b387-8eed946cf3b5";

const olderAttemptId =
  "c3609f74-7abe-4e33-9f50-ce0a33664e16";

const connectionString =
  process.env.CASA_POST_FACE_DB_URL;

if (!connectionString) {
  throw new Error(
    "CASA_POST_FACE_DB_URL missing.",
  );
}

const parsed =
  new URL(
    connectionString,
  );

if (
  parsed.hostname !==
  expectedHost
) {
  throw new Error(
    `Development database host mismatch: ${parsed.hostname}`,
  );
}

if (
  typeof globalThis.WebSocket !==
  "function"
) {
  throw new Error(
    "Global WebSocket unavailable.",
  );
}

neonConfig.webSocketConstructor =
  globalThis.WebSocket;

const pool =
  new Pool({
    connectionString,
    connectionTimeoutMillis:
      20000,
    idleTimeoutMillis:
      5000,
    max:
      1,
  });

let client;

try {
  client =
    await pool.connect();

  await client.query(
    "begin read only",
  );

  const migrationResult =
    await client.query(`
      select count(*)::int as count
      from drizzle.__drizzle_migrations
    `);

  const clockResult =
    await client.query(`
      select
        (now() at time zone 'Africa/Lagos')::date::text as date,
        (now() at time zone 'Africa/Lagos')::time(0)::text as time
    `);

  const attemptResult =
    await client.query(
      `
        select
          a.id,
          a.school_id,
          a.student_id,
          a.terminal_id,
          a.session_id,
          s.attendance_date::text
            as attendance_date,
          s.status::text
            as session_status,
          a.operation::text
            as operation,
          a.card_result::text
            as card_result,
          a.time_result::text
            as time_result,
          a.face_result::text
            as face_result,
          a.liveness_result::text
            as liveness_result,
          a.outcome::text
            as outcome,
          a.reason_code,
          a.occurred_at,
          a.completed_at,
          a.created_at
        from attendance_verification_attempts a
        join attendance_sessions s
          on s.school_id =
             a.school_id
         and s.id =
             a.session_id
        where a.id in (
          $1::uuid,
          $2::uuid
        )
        order by a.created_at asc,
                 a.id asc
      `,
      [
        olderAttemptId,
        targetAttemptId,
      ],
    );

  const target =
    attemptResult.rows.find(
      (row) =>
        String(row.id) ===
        targetAttemptId,
    ) ??
    null;

  const older =
    attemptResult.rows.find(
      (row) =>
        String(row.id) ===
        olderAttemptId,
    ) ??
    null;

  if (
    !target ||
    !older
  ) {
    throw new Error(
      "Guarded target/older attempt pair is incomplete.",
    );
  }

  if (
    String(target.school_id) !==
      String(older.school_id) ||
    String(target.student_id) !==
      String(older.student_id) ||
    String(target.terminal_id) !==
      String(older.terminal_id) ||
    String(target.session_id) !==
      String(older.session_id)
  ) {
    throw new Error(
      "Guarded duplicate attempts no longer share school/student/terminal/session.",
    );
  }

  const schoolId =
    String(
      target.school_id,
    );

  const studentId =
    String(
      target.student_id,
    );

  const terminalId =
    String(
      target.terminal_id,
    );

  const sessionId =
    String(
      target.session_id,
    );

  const targetLiveness =
    await client.query(
      `
        select
          id,
          attempt_id,
          status::text
            as status,
          failure_code,
          liveness_confidence_bps,
          face_similarity_bps,
          expires_at,
          created_at,
          completed_at
        from biometric_liveness_sessions
        where school_id =
              $1::uuid
          and attempt_id =
              $2::uuid
          and purpose::text =
              'VERIFICATION'
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        targetAttemptId,
      ],
    );

  const olderLiveness =
    await client.query(
      `
        select
          id,
          status::text
            as status,
          failure_code,
          created_at,
          completed_at
        from biometric_liveness_sessions
        where school_id =
              $1::uuid
          and attempt_id =
              $2::uuid
          and purpose::text =
              'VERIFICATION'
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        olderAttemptId,
      ],
    );

  const targetAttendance =
    await client.query(
      `
        select
          id,
          session_id,
          student_id,
          source_attempt_id,
          terminal_id,
          card_id,
          status::text
            as status,
          presence_state::text
            as presence_state,
          recorded_at,
          created_at
        from student_attendance_records
        where school_id =
              $1::uuid
          and source_attempt_id =
              $2::uuid
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        targetAttemptId,
      ],
    );

  const targetPresence =
    await client.query(
      `
        select
          id,
          session_id,
          student_id,
          attempt_id,
          terminal_id,
          card_id,
          event_type::text
            as event_type,
          occurred_at,
          created_at
        from student_presence_events
        where school_id =
              $1::uuid
          and attempt_id =
              $2::uuid
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        targetAttemptId,
      ],
    );

  const targetEvidence =
    await client.query(
      `
        select
          id,
          attempt_id,
          student_id,
          profile_id,
          face_confidence_bps,
          liveness_confidence_bps,
          verified_at,
          created_at
        from biometric_verification_evidence
        where school_id =
              $1::uuid
          and attempt_id =
              $2::uuid
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        targetAttemptId,
      ],
    );

  const olderProtected =
    await client.query(
      `
        select
          (
            select count(*)::int
            from student_attendance_records
            where school_id =
                  $1::uuid
              and source_attempt_id =
                  $2::uuid
          ) as attendance,
          (
            select count(*)::int
            from student_presence_events
            where school_id =
                  $1::uuid
              and attempt_id =
                  $2::uuid
          ) as presence,
          (
            select count(*)::int
            from biometric_verification_evidence
            where school_id =
                  $1::uuid
              and attempt_id =
                  $2::uuid
          ) as evidence
      `,
      [
        schoolId,
        olderAttemptId,
      ],
    );

  const sessionAttendance =
    await client.query(
      `
        select
          id,
          source_attempt_id,
          status::text
            as status,
          presence_state::text
            as presence_state,
          recorded_at
        from student_attendance_records
        where school_id =
              $1::uuid
          and session_id =
              $2::uuid
          and student_id =
              $3::uuid
        order by created_at asc,
                 id asc
      `,
      [
        schoolId,
        sessionId,
        studentId,
      ],
    );

  const latestEligiblePending =
    await client.query(
      `
        select
          a.id,
          a.created_at
        from attendance_verification_attempts a
        where a.school_id =
              $1::uuid
          and a.terminal_id =
              $2::uuid
          and a.session_id =
              $3::uuid
          and a.student_id =
              $4::uuid
          and a.operation::text =
              'CHECK_IN'
          and a.card_result::text =
              'MATCHED'
          and a.outcome::text =
              'PENDING'
          and not exists (
            select 1
            from student_attendance_records r
            where r.school_id =
                  a.school_id
              and r.session_id =
                  a.session_id
              and r.student_id =
                  a.student_id
          )
        order by a.created_at desc,
                 a.id desc
        limit 1
      `,
      [
        schoolId,
        terminalId,
        sessionId,
        studentId,
      ],
    );

  const population =
    await client.query(
      `
        select
          a.id,
          a.created_at,
          a.outcome::text
            as outcome,
          a.card_result::text
            as card_result,
          a.face_result::text
            as face_result,
          a.liveness_result::text
            as liveness_result
        from attendance_verification_attempts a
        where a.school_id =
              $1::uuid
          and a.student_id =
              $2::uuid
          and a.terminal_id =
              $3::uuid
        order by a.created_at asc,
                 a.id asc
      `,
      [
        schoolId,
        studentId,
        terminalId,
      ],
    );

  await client.query(
    "rollback",
  );

  console.log(
    JSON.stringify({
      transport:
        "NEON_WEBSOCKET_POOL_READ_ONLY",
      host:
        parsed.hostname,
      migrations:
        Number(
          migrationResult.rows[0]?.count ??
          -1,
        ),
      clock:
        clockResult.rows[0] ??
        null,
      target,
      older,
      targetLiveness:
        targetLiveness.rows,
      olderLiveness:
        olderLiveness.rows,
      targetAttendance:
        targetAttendance.rows,
      targetPresence:
        targetPresence.rows,
      targetEvidence:
        targetEvidence.rows,
      olderProtected:
        olderProtected.rows[0] ??
        null,
      sessionAttendance:
        sessionAttendance.rows,
      latestEligiblePending:
        latestEligiblePending.rows[0] ??
        null,
      population:
        population.rows,
    }),
  );
}
catch (error) {
  try {
    if (client) {
      await client.query(
        "rollback",
      );
    }
  }
  catch {
    // Read-only rollback best effort.
  }

  console.error(
    error instanceof Error
      ? error.stack ??
        error.message
      : String(
          error,
        ),
  );

  process.exitCode =
    1;
}
finally {
  if (client) {
    client.release();
  }

  await pool.end();
}
'@

    [System.IO.File]::WriteAllText(
        $Probe,
        $Code,
        $Utf8NoBom
    )

    $OldDb =
        [Environment]::GetEnvironmentVariable(
            "CASA_POST_FACE_DB_URL",
            "Process"
        )

    $OldNodeOptions =
        [Environment]::GetEnvironmentVariable(
            "NODE_OPTIONS",
            "Process"
        )

    try {
        $env:CASA_POST_FACE_DB_URL =
            $DatabaseUrl

        $env:NODE_OPTIONS =
            "--dns-result-order=ipv4first --no-network-family-autoselection"

        for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
            $PreviousPreference =
                $ErrorActionPreference

            try {
                $ErrorActionPreference =
                    "Continue"

                $Output =
                    @(
                        & node.exe `
                            $Probe 2>&1
                    )

                $ExitCode =
                    $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference =
                    $PreviousPreference
            }

            $Usable =
                @(
                    $Output |
                        ForEach-Object {
                            [string]$_
                        } |
                        Where-Object {
                            -not [string]::IsNullOrWhiteSpace($_)
                        }
                )

            if ($ExitCode -eq 0) {
                if ($Usable.Count -eq 0) {
                    Stop-Phase "Read-only WebSocket postflight returned no output."
                }

                try {
                    return (
                        $Usable[-1] |
                            ConvertFrom-Json
                    )
                }
                catch {
                    $Usable |
                        ForEach-Object {
                            Write-Host $_
                        }

                    Stop-Phase "Read-only WebSocket postflight returned invalid JSON."
                }
            }

            Write-Host "  Development WebSocket read attempt ${Attempt}/${MaxAttempts}: FAILED"

            if ($Attempt -lt $MaxAttempts) {
                $Delay = $Attempt * 2
                Write-Host "    retrying after ${Delay}s..."
                Start-Sleep -Seconds $Delay
            }
            else {
                Write-Host "  final safe error:"
                $Usable |
                    Select-Object -Last 30 |
                    ForEach-Object {
                        Write-Host "    $_"
                    }

                Stop-Phase "Read-only Development postflight could not connect after $MaxAttempts attempts."
            }
        }
    }
    finally {
        if ($null -ne $OldDb) {
            $env:CASA_POST_FACE_DB_URL =
                $OldDb
        }
        else {
            Remove-Item `
                Env:CASA_POST_FACE_DB_URL `
                -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldNodeOptions) {
            $env:NODE_OPTIONS =
                $OldNodeOptions
        }
        else {
            Remove-Item `
                Env:NODE_OPTIONS `
                -ErrorAction SilentlyContinue
        }

        Remove-Item `
            -LiteralPath $Probe `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

Write-Host "CASA School - Post-Face Success Authoritative Verification V1R1" -ForegroundColor Green
Write-Host "READ ONLY. Verifies the successful Scanner face/liveness ceremony after the previous HTTP Neon postflight transport failure. V1R1 normalizes empty Compare-Object results for Windows PowerShell StrictMode."
Write-Host "No card scan. No face retry. No AWS call. No CASA source/schema/DB mutation."
Write-Host "No Staging/Production connection."
Write-Host "Target attempt: $TargetAttemptId"
Write-Host "Older duplicate: $OlderAttemptId"

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
            ".casa-backups\scanner-post-face-authoritative-verification-v1r1-$Stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    Step "Re-proving exact current source authority"

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
        Stop-Phase "Scanner source drift."
    }

    if ((Sha $AwsPath) -ne $ExpectedAwsHash) {
        Stop-Phase "AWS liveness source drift."
    }

    if ((Sha $PendingRoutePath) -ne $ExpectedPendingRouteHash) {
        Stop-Phase "Duplicate-safe pending route drift."
    }

    if ((Sha $RecoverySelftestPath) -ne $ExpectedRecoverySelftestHash) {
        Stop-Phase "Pending recovery selftest drift."
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
    Write-Host "  duplicate-safe pending route:  LOCKED / VERIFIED"
    Write-Host "  source mutation planned:       NO"

    Step "Validating exact Development DB configuration"

    $EnvMap =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.local")

    if (-not $EnvMap.ContainsKey("DATABASE_URL")) {
        Stop-Phase "DATABASE_URL missing from .env.local."
    }

    try {
        $DbUri =
            [System.Uri][string]$EnvMap["DATABASE_URL"]
    }
    catch {
        Stop-Phase "Development DATABASE_URL is invalid."
    }

    if ($DbUri.Host -ne $ExpectedDevelopmentHost) {
        Stop-Phase ".env.local is not the authorized Development endpoint."
    }

    Write-Host "  Development host:              VERIFIED"
    Write-Host "  database credential printed:   NO"

    Step "Reading authoritative post-face state through Neon WebSocket Pool"

    $State =
        Invoke-ReadOnlyState `
            ([string]$EnvMap["DATABASE_URL"])

    $State |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "STATE.json") `
            -Encoding UTF8

    if (
        [string]$State.transport -ne "NEON_WEBSOCKET_POOL_READ_ONLY" -or
        [string]$State.host -ne $ExpectedDevelopmentHost -or
        [int]$State.migrations -ne 30
    ) {
        Stop-Phase "Authoritative Development transport/boundary proof failed."
    }

    $Population =
        @($State.population)

    $ObservedIds =
        @(
            $Population |
                ForEach-Object {
                    [string]$_.id
                }
        )

    $AttemptPopulationDiff =
        @(
            Compare-Object `
                $ExpectedAttemptIds `
                $ObservedIds
        )

    if (
        @($ObservedIds).Count -ne @($ExpectedAttemptIds).Count -or
        @($AttemptPopulationDiff).Count -ne 0
    ) {
        Write-Host ""
        Write-Host "ATTEMPT POPULATION DRIFT DETECTED" -ForegroundColor Red
        Write-Host "  expected count: $(@($ExpectedAttemptIds).Count)"
        Write-Host "  observed count: $(@($ObservedIds).Count)"
        Stop-Phase "A new or missing attempt exists; no rescan or face retry is authorized."
    }

    $Target =
        $State.target

    $Older =
        $State.older

    if ($null -eq $Target -or $null -eq $Older) {
        Stop-Phase "Guarded target/older attempt pair is incomplete."
    }

    $TargetLiveness =
        @($State.targetLiveness)

    $OlderLiveness =
        @($State.olderLiveness)

    $TargetAttendance =
        @($State.targetAttendance)

    $TargetPresence =
        @($State.targetPresence)

    $TargetEvidence =
        @($State.targetEvidence)

    $SessionAttendance =
        @($State.sessionAttendance)

    Write-Host "  school-local date/time:        $($State.clock.date) $($State.clock.time)"
    Write-Host "  attempt population:            $(@($Population).Count) / UNCHANGED"
    Write-Host ""
    Write-Host "  TARGET $TargetAttemptId"
    Write-Host "    card/time:                    $($Target.card_result) / $($Target.time_result)"
    Write-Host "    face/liveness:                $($Target.face_result) / $($Target.liveness_result)"
    Write-Host "    outcome:                      $($Target.outcome)"
    Write-Host "    reason:                       $($Target.reason_code)"
    Write-Host "    liveness sessions:            $(@($TargetLiveness).Count)"
    Write-Host "    attendance/evidence/presence: $(@($TargetAttendance).Count)/$(@($TargetEvidence).Count)/$(@($TargetPresence).Count)"
    Write-Host ""
    Write-Host "  OLDER DUPLICATE $OlderAttemptId"
    Write-Host "    card/time:                    $($Older.card_result) / $($Older.time_result)"
    Write-Host "    face/liveness:                $($Older.face_result) / $($Older.liveness_result)"
    Write-Host "    outcome:                      $($Older.outcome)"
    Write-Host "    liveness sessions:            $(@($OlderLiveness).Count)"
    Write-Host "    protected records:            $($State.olderProtected.attendance)/$($State.olderProtected.evidence)/$($State.olderProtected.presence)"
    Write-Host ""
    Write-Host "  same-student/session attendance: $(@($SessionAttendance).Count)"
    Write-Host "  eligible pending after record:    $(if ($null -eq $State.latestEligiblePending) { 'NONE' } else { [string]$State.latestEligiblePending.id })"

    $OlderGreen =
        [string]$Older.id -eq $OlderAttemptId -and
        [string]$Older.operation -eq "CHECK_IN" -and
        [string]$Older.card_result -eq "MATCHED" -and
        @("ON_TIME","LATE") -contains [string]$Older.time_result -and
        [string]$Older.face_result -eq "NOT_RUN" -and
        [string]$Older.liveness_result -eq "NOT_RUN" -and
        [string]$Older.outcome -eq "PENDING" -and
        $null -eq $Older.completed_at -and
        @($OlderLiveness).Count -eq 0 -and
        [int]$State.olderProtected.attendance -eq 0 -and
        [int]$State.olderProtected.presence -eq 0 -and
        [int]$State.olderProtected.evidence -eq 0

    $TargetGreen =
        [string]$Target.id -eq $TargetAttemptId -and
        [string]$Target.operation -eq "CHECK_IN" -and
        [string]$Target.card_result -eq "MATCHED" -and
        @("ON_TIME","LATE") -contains [string]$Target.time_result -and
        [string]$Target.face_result -eq "PASSED" -and
        [string]$Target.liveness_result -eq "PASSED" -and
        [string]$Target.outcome -eq "RECORDED" -and
        $null -ne $Target.completed_at

    $CompletedLiveness =
        @(
            $TargetLiveness |
                Where-Object {
                    [string]$_.status -eq "COMPLETED" -and
                    $null -ne $_.completed_at -and
                    $null -eq $_.failure_code
                }
        )

    $ArtifactsGreen =
        @($TargetLiveness).Count -eq 1 -and
        @($CompletedLiveness).Count -eq 1 -and
        @($TargetAttendance).Count -eq 1 -and
        [string]$TargetAttendance[0].source_attempt_id -eq $TargetAttemptId -and
        [string]$TargetAttendance[0].session_id -eq [string]$Target.session_id -and
        [string]$TargetAttendance[0].presence_state -eq "ON_CAMPUS" -and
        @($TargetEvidence).Count -eq 1 -and
        [string]$TargetEvidence[0].attempt_id -eq $TargetAttemptId -and
        @($TargetPresence).Count -eq 1 -and
        [string]$TargetPresence[0].attempt_id -eq $TargetAttemptId -and
        [string]$TargetPresence[0].session_id -eq [string]$Target.session_id -and
        [string]$TargetPresence[0].event_type -eq "CHECKED_IN"

    $SuppressionGreen =
        @($SessionAttendance).Count -eq 1 -and
        [string]$SessionAttendance[0].source_attempt_id -eq $TargetAttemptId -and
        $null -eq $State.latestEligiblePending

    if (
        $TargetGreen -and
        $ArtifactsGreen -and
        $OlderGreen -and
        $SuppressionGreen
    ) {
        $Result =
            [ordered]@{
                createdAt = (Get-Date -Format o)
                classification = "GREEN"
                proof = "CASA_SCANNER_POST_FACE_SUCCESS_AUTHORITATIVE_VERIFICATION_V1R1"
                targetAttempt = $TargetAttemptId
                olderDuplicate = $OlderAttemptId
                targetOutcome = "RECORDED"
                targetCard = "MATCHED"
                targetFace = "PASSED"
                targetLiveness = "PASSED"
                completedLivenessSessions = 1
                attendanceRecords = 1
                biometricEvidence = 1
                presenceEvents = 1
                presenceEventType = "CHECKED_IN"
                attemptPopulationUnchanged = $true
                olderDuplicateUnchanged = $true
                olderDuplicateSuppressedFromRecovery = $true
                cardRescanPerformed = $false
                faceRetryPerformedByThisScript = $false
                sourceMutation = $false
                databaseMutation = $false
                awsMutation = $false
                stagingTouched = $false
                productionTouched = $false
            }

        $Result |
            ConvertTo-Json -Depth 10 |
            Set-Content `
                -LiteralPath (Join-Path $Evidence "RESULT.json") `
                -Encoding UTF8

        Write-Host ""
        Write-Host "CASA SCANNER FACE/LIVENESS + ATTENDANCE POSTFLIGHT IS GREEN" -ForegroundColor Green
        Write-Host "  target attempt:                 $TargetAttemptId / RECORDED"
        Write-Host "  card:                           MATCHED"
        Write-Host "  face:                           PASSED"
        Write-Host "  AWS liveness:                   COMPLETED / PASSED"
        Write-Host "  attendance record:              1 / EXACT TARGET"
        Write-Host "  trusted biometric evidence:     1 / EXACT TARGET"
        Write-Host "  presence event:                 CHECKED_IN / EXACT TARGET"
        Write-Host "  older duplicate:                $OlderAttemptId / PENDING UNCHANGED"
        Write-Host "  older duplicate recovery:       SUPPRESSED AFTER RECORDED ATTENDANCE"
        Write-Host "  attempt population:             6 / UNCHANGED"
        Write-Host "  card rescan:                     NO"
        Write-Host "  mutation by this verifier:       NONE / READ ONLY"
        Write-Host "  Staging/Production:              NOT TOUCHED"
        Write-Host "  evidence:                        $Evidence"
        Write-Host ""
        Write-Host "NEXT: return this GREEN output. The Development Scanner face/liveness acceptance gate is then closed." -ForegroundColor Yellow
        exit 0
    }

    $Classification =
        "NOT_GREEN_REVIEW_REQUIRED"

    if (
        [string]$Target.face_result -eq "PASSED" -and
        [string]$Target.liveness_result -eq "PASSED" -and
        [string]$Target.outcome -eq "PENDING"
    ) {
        $Classification =
            "BIOMETRIC_PASSED_BUT_ATTENDANCE_NOT_FINALIZED"
    }
    elseif (
        @($CompletedLiveness).Count -eq 1 -and
        [string]$Target.outcome -ne "RECORDED"
    ) {
        $Classification =
            "LIVENESS_COMPLETED_WITHOUT_RECORDED_ATTENDANCE"
    }
    elseif (
        @($TargetLiveness).Count -gt 0 -and
        @($CompletedLiveness).Count -eq 0
    ) {
        $Classification =
            "LIVENESS_SESSION_NOT_COMPLETED"
    }
    elseif (
        [string]$Target.outcome -eq "RECORDED" -and
        -not $ArtifactsGreen
    ) {
        $Classification =
            "RECORDED_ATTEMPT_WITH_PROTECTED_ARTIFACT_MISMATCH"
    }

    $FailureResult =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            classification = $Classification
            proof = "CASA_SCANNER_POST_FACE_SUCCESS_AUTHORITATIVE_VERIFICATION_V1R1"
            targetAttempt = $TargetAttemptId
            targetCard = [string]$Target.card_result
            targetTime = [string]$Target.time_result
            targetFace = [string]$Target.face_result
            targetLiveness = [string]$Target.liveness_result
            targetOutcome = [string]$Target.outcome
            targetReason = $Target.reason_code
            targetLivenessSessionCount = @($TargetLiveness).Count
            completedLivenessSessionCount = @($CompletedLiveness).Count
            attendanceRecordCount = @($TargetAttendance).Count
            biometricEvidenceCount = @($TargetEvidence).Count
            presenceEventCount = @($TargetPresence).Count
            olderDuplicateUnchanged = $OlderGreen
            duplicateRecoverySuppressed = $SuppressionGreen
            attemptPopulationUnchanged = $true
            noRetryAuthorized = $true
            sourceMutation = $false
            databaseMutation = $false
            awsMutation = $false
            stagingTouched = $false
            productionTouched = $false
        }

    $FailureResult |
        ConvertTo-Json -Depth 10 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "RESULT.json") `
            -Encoding UTF8

    Write-Host ""
    Write-Host "CASA POST-FACE AUTHORITATIVE STATE IS NOT FULLY GREEN" -ForegroundColor Red
    Write-Host "  classification:                 $Classification"
    Write-Host "  NO CARD RESCAN OR FACE RETRY IS AUTHORIZED."
    Write-Host "  evidence:                       $Evidence"
    Stop-Phase "Return this complete output for the next state-aware recovery step."
}
catch {
    Write-Host ""
    Write-Host "CASA POST-FACE SUCCESS AUTHORITATIVE VERIFICATION V1R1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    throw
}
