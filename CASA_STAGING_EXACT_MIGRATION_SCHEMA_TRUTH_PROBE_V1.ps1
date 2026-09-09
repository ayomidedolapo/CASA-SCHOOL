param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"

$ExpectedDevelopmentHost =
    "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"

$ExpectedStagingHost =
    "ep-ancient-truth-a5s7v83r-pooler.us-east-2.aws.neon.tech"

$ExpectedPackageHash =
    "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"

$ExpectedScannerHash =
    "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"

$ExpectedAwsHash =
    "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"

$ExpectedPendingRouteHash =
    "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"

$ExpectedRecoverySelftestHash =
    "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"

$ExpectedMigration22Folder =
    "20260901081825_attendance-readiness-card-replacement"

$ExpectedMigration22Hash =
    "085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b"

$ExpectedMigration29Folder =
    "20260909020000_pass-a-enum-expansion"

$ExpectedMigration29Hash =
    "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"

$ExpectedMigration30Folder =
    "20260909020500_pass-a-handover-attendance-state"

$ExpectedMigration30Hash =
    "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

$Utf8NoBom =
    New-Object System.Text.UTF8Encoding($false)

$Evidence = $null

function Stop-Phase(
    [string]$Message
) {
    throw $Message
}

function Step(
    [string]$Message
) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha(
    [string]$Path
) {
    if (
        -not (
            Test-Path `
                -LiteralPath $Path `
                -PathType Leaf
        )
    ) {
        Stop-Phase "Required file missing: $Path"
    }

    return (
        Get-FileHash `
            -LiteralPath $Path `
            -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function Read-EnvValue(
    [string]$Path,
    [string]$Name
) {
    if (
        -not (
            Test-Path `
                -LiteralPath $Path `
                -PathType Leaf
        )
    ) {
        Stop-Phase "Environment file missing: $Path"
    }

    foreach (
        $Raw in
        Get-Content `
            -LiteralPath $Path
    ) {
        $Line =
            ([string]$Raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace(
                $Line
            ) -or
            $Line.StartsWith("#")
        ) {
            continue
        }

        $Index =
            $Line.IndexOf("=")

        if ($Index -le 0) {
            continue
        }

        $Key =
            $Line.Substring(
                0,
                $Index
            ).Trim()

        if ($Key -ne $Name) {
            continue
        }

        $Value =
            $Line.Substring(
                $Index + 1
            ).Trim()

        if (
            (
                $Value.StartsWith('"') -and
                $Value.EndsWith('"')
            ) -or
            (
                $Value.StartsWith("'") -and
                $Value.EndsWith("'")
            )
        ) {
            $Value =
                $Value.Substring(
                    1,
                    $Value.Length - 2
                )
        }

        return $Value
    }

    Stop-Phase "$Name is missing from $Path"
}

function Invoke-ReadOnlyProbe(
    [string]$DatabaseUrl,
    [string]$ExpectedHost,
    [string]$Label,
    [string]$ProbePath,
    [int]$MaxAttempts = 4
) {
    $OldDb =
        [Environment]::GetEnvironmentVariable(
            "CASA_SCHEMA_TRUTH_DB_URL",
            "Process"
        )

    $OldExpectedHost =
        [Environment]::GetEnvironmentVariable(
            "CASA_SCHEMA_TRUTH_EXPECTED_HOST",
            "Process"
        )

    $OldLabel =
        [Environment]::GetEnvironmentVariable(
            "CASA_SCHEMA_TRUTH_LABEL",
            "Process"
        )

    $OldNodeOptions =
        [Environment]::GetEnvironmentVariable(
            "NODE_OPTIONS",
            "Process"
        )

    try {
        $env:CASA_SCHEMA_TRUTH_DB_URL =
            $DatabaseUrl

        $env:CASA_SCHEMA_TRUTH_EXPECTED_HOST =
            $ExpectedHost

        $env:CASA_SCHEMA_TRUTH_LABEL =
            $Label

        $RequiredNodeOptions =
            "--dns-result-order=ipv4first --no-network-family-autoselection"

        if (
            [string]::IsNullOrWhiteSpace(
                $env:NODE_OPTIONS
            )
        ) {
            $env:NODE_OPTIONS =
                $RequiredNodeOptions
        }
        else {
            if (
                $env:NODE_OPTIONS -notmatch
                    "dns-result-order=ipv4first"
            ) {
                $env:NODE_OPTIONS +=
                    " --dns-result-order=ipv4first"
            }

            if (
                $env:NODE_OPTIONS -notmatch
                    "no-network-family-autoselection"
            ) {
                $env:NODE_OPTIONS +=
                    " --no-network-family-autoselection"
            }
        }

        for (
            $Attempt = 1;
            $Attempt -le $MaxAttempts;
            $Attempt++
        ) {
            $Previous =
                $ErrorActionPreference

            try {
                $ErrorActionPreference =
                    "Continue"

                $Output =
                    @(
                        & node.exe `
                            $ProbePath 2>&1
                    )

                $ExitCode =
                    $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference =
                    $Previous
            }

            $Usable =
                @(
                    $Output |
                        ForEach-Object {
                            [string]$_
                        } |
                        Where-Object {
                            -not (
                                [string]::IsNullOrWhiteSpace(
                                    $_
                                )
                            )
                        }
                )

            if ($ExitCode -eq 0) {
                if ($Usable.Count -eq 0) {
                    Stop-Phase "$Label read-only probe returned no output."
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

                    Stop-Phase "$Label read-only probe returned invalid JSON."
                }
            }

            Write-Host "  $Label read-only probe attempt ${Attempt}/${MaxAttempts}: FAILED"

            if ($Attempt -lt $MaxAttempts) {
                $Delay =
                    $Attempt * 2

                Write-Host "    retrying after ${Delay}s..."
                Start-Sleep -Seconds $Delay
            }
            else {
                Write-Host "  $Label final safe error:"

                $Usable |
                    Select-Object -Last 40 |
                    ForEach-Object {
                        Write-Host "    $_"
                    }

                Stop-Phase "$Label read-only probe failed after $MaxAttempts attempts."
            }
        }
    }
    finally {
        if ($null -ne $OldDb) {
            $env:CASA_SCHEMA_TRUTH_DB_URL =
                $OldDb
        }
        else {
            Remove-Item `
                Env:CASA_SCHEMA_TRUTH_DB_URL `
                -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldExpectedHost) {
            $env:CASA_SCHEMA_TRUTH_EXPECTED_HOST =
                $OldExpectedHost
        }
        else {
            Remove-Item `
                Env:CASA_SCHEMA_TRUTH_EXPECTED_HOST `
                -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldLabel) {
            $env:CASA_SCHEMA_TRUTH_LABEL =
                $OldLabel
        }
        else {
            Remove-Item `
                Env:CASA_SCHEMA_TRUTH_LABEL `
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
    }
}

function Assert-Prefix(
    [object]$State,
    [object[]]$LocalManifest,
    [string]$Label
) {
    $Rows =
        @($State.migrations)

    if ($Rows.Count -gt $LocalManifest.Count) {
        Stop-Phase "$Label has more applied migrations ($($Rows.Count)) than local source ($($LocalManifest.Count))."
    }

    for (
        $Index = 0;
        $Index -lt $Rows.Count;
        $Index++
    ) {
        $Actual =
            [string]$Rows[$Index].hash

        $Expected =
            [string]$LocalManifest[$Index].hash

        if (
            $Actual.ToLowerInvariant() -ne
            $Expected.ToLowerInvariant()
        ) {
            Stop-Phase "$Label migration history diverges at position $($Index + 1)."
        }
    }
}

Write-Host "CASA School - Staging Exact Migration/Schema Truth Probe V1" -ForegroundColor Green
Write-Host "READ ONLY. Determines whether Staging is genuinely behind migration 22 or has migration-history/schema drift."
Write-Host "No source write. No Development/Staging DB write. No AWS call. No Production read/connection."
Write-Host "This probe intentionally does NOT query application tables unless existence is already proven through information_schema."

try {
    if (
        -not (
            Test-Path `
                -LiteralPath $ProjectRoot `
                -PathType Container
        )
    ) {
        Stop-Phase "CASA repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Locking exact current source authority"

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
        Join-Path `
            $ProjectRoot `
            "package.json"

    $ScannerPath =
        Join-Path `
            $ProjectRoot `
            "src\app\scanner\scanner-client.tsx"

    $AwsPath =
        Join-Path `
            $ProjectRoot `
            "src\server\biometrics\aws-liveness.ts"

    $PendingRoutePath =
        Join-Path `
            $ProjectRoot `
            "src\app\api\terminal\attempts\pending\route.ts"

    $RecoverySelftestPath =
        Join-Path `
            $ProjectRoot `
            "scripts\scanner-pending-attempt-recovery-selftest.ts"

    if (
        (Sha $PackagePath) -ne
        $ExpectedPackageHash
    ) {
        Stop-Phase "package.json drift."
    }

    if (
        (Sha $ScannerPath) -ne
        $ExpectedScannerHash
    ) {
        Stop-Phase "Scanner source drift."
    }

    if (
        (Sha $AwsPath) -ne
        $ExpectedAwsHash
    ) {
        Stop-Phase "AWS liveness source drift."
    }

    if (
        (Sha $PendingRoutePath) -ne
        $ExpectedPendingRouteHash
    ) {
        Stop-Phase "Duplicate-safe pending route drift."
    }

    if (
        (Sha $RecoverySelftestPath) -ne
        $ExpectedRecoverySelftestHash
    ) {
        Stop-Phase "Pending-recovery selftest drift."
    }

    $MigrationDirectories =
        @(
            Get-ChildItem `
                -LiteralPath (
                    Join-Path `
                        $ProjectRoot `
                        "drizzle"
                ) `
                -Directory |
                Where-Object {
                    Test-Path `
                        -LiteralPath (
                            Join-Path `
                                $_.FullName `
                                "migration.sql"
                        ) `
                        -PathType Leaf
                } |
                Sort-Object Name
        )

    if ($MigrationDirectories.Count -ne 30) {
        Stop-Phase "Expected exactly 30 local migrations; found $($MigrationDirectories.Count)."
    }

    $LocalManifest =
        @(
            for (
                $Index = 0;
                $Index -lt $MigrationDirectories.Count;
                $Index++
            ) {
                $Directory =
                    $MigrationDirectories[$Index]

                [pscustomobject]@{
                    position =
                        $Index + 1
                    folder =
                        [string]$Directory.Name
                    hash =
                        Sha (
                            Join-Path `
                                $Directory.FullName `
                                "migration.sql"
                        )
                }
            }
        )

    $Migration22 =
        @(
            $LocalManifest |
                Where-Object {
                    [string]$_.folder -eq
                    $ExpectedMigration22Folder
                }
        )

    $Migration29 =
        @(
            $LocalManifest |
                Where-Object {
                    [string]$_.folder -eq
                    $ExpectedMigration29Folder
                }
        )

    $Migration30 =
        @(
            $LocalManifest |
                Where-Object {
                    [string]$_.folder -eq
                    $ExpectedMigration30Folder
                }
        )

    if (
        $Migration22.Count -ne 1 -or
        [int]$Migration22[0].position -ne 22 -or
        [string]$Migration22[0].hash -ne
            $ExpectedMigration22Hash
    ) {
        Stop-Phase "Migration 22 authority drift."
    }

    if (
        $Migration29.Count -ne 1 -or
        [int]$Migration29[0].position -ne 29 -or
        [string]$Migration29[0].hash -ne
            $ExpectedMigration29Hash
    ) {
        Stop-Phase "Migration 29 authority drift."
    }

    if (
        $Migration30.Count -ne 1 -or
        [int]$Migration30[0].position -ne 30 -or
        [string]$Migration30[0].hash -ne
            $ExpectedMigration30Hash
    ) {
        Stop-Phase "Migration 30 authority drift."
    }

    Write-Host "  branch/head:                   $Branch/$Head"
    Write-Host "  local migrations:              30 / VERIFIED"
    Write-Host "  migration 22 lifecycle table:  VERIFIED"
    Write-Host "  migration 29/30 Pass A:        VERIFIED"
    Write-Host "  Scanner/AWS/pending recovery:  LOCKED / VERIFIED"

    Step "Locking Development and Staging identities"

    $DevelopmentUrl =
        Read-EnvValue `
            (Join-Path $ProjectRoot ".env.local") `
            "DATABASE_URL"

    $StagingUrl =
        Read-EnvValue `
            (Join-Path $ProjectRoot ".env.staging.local") `
            "DATABASE_URL"

    try {
        $DevelopmentUri =
            [Uri]$DevelopmentUrl

        $StagingUri =
            [Uri]$StagingUrl
    }
    catch {
        Stop-Phase "Development or Staging DATABASE_URL is invalid."
    }

    if (
        $DevelopmentUri.Host -ne
        $ExpectedDevelopmentHost
    ) {
        Stop-Phase "Development host guard failed: $($DevelopmentUri.Host)"
    }

    if (
        $StagingUri.Host -ne
        $ExpectedStagingHost
    ) {
        Stop-Phase "Staging host guard failed: $($StagingUri.Host)"
    }

    if (
        $DevelopmentUri.Host -eq
        $StagingUri.Host
    ) {
        Stop-Phase "Development and Staging unexpectedly share a host."
    }

    Write-Host "  Development host:              VERIFIED"
    Write-Host "  Staging host:                  VERIFIED"
    Write-Host "  Production:                    NOT READ / NOT CONNECTED"

    $Stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\staging-exact-schema-truth-v1-$Stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    $ProbePath =
        Join-Path `
            $Evidence `
            "schema-truth-readonly-websocket.mjs"

    $ProbeCode = @'
import {
  Pool,
  neonConfig,
} from "@neondatabase/serverless";

const raw =
  process.env.CASA_SCHEMA_TRUTH_DB_URL;

const expectedHost =
  String(
    process.env.CASA_SCHEMA_TRUTH_EXPECTED_HOST ??
    "",
  ).toLowerCase();

const label =
  String(
    process.env.CASA_SCHEMA_TRUTH_LABEL ??
    "database",
  );

if (!raw) {
  throw new Error(
    "CASA_SCHEMA_TRUTH_DB_URL missing.",
  );
}

const parsed =
  new URL(
    raw,
  );

const host =
  parsed.hostname.toLowerCase();

if (
  !expectedHost ||
  host !== expectedHost
) {
  throw new Error(
    `${label}: host guard failed. Expected ${expectedHost}; found ${host}.`,
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
    connectionString:
      raw,
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

  const identity =
    await client.query(`
      select
        current_database()
          as database_name,
        current_user
          as database_user,
        current_schema()
          as current_schema
    `);

  const migrationTable =
    await client.query(`
      select exists (
        select 1
        from information_schema.tables
        where table_schema='drizzle'
          and table_name='__drizzle_migrations'
      ) as exists
    `);

  let migrations = [];

  if (
    Boolean(
      migrationTable.rows[0]?.exists,
    )
  ) {
    const result =
      await client.query(`
        select
          id,
          hash,
          created_at
        from drizzle.__drizzle_migrations
        order by id
      `);

    migrations =
      result.rows;
  }

  const publicTables =
    await client.query(`
      select
        table_name
      from information_schema.tables
      where table_schema='public'
        and table_type='BASE TABLE'
      order by table_name
    `);

  const tableNames =
    publicTables.rows.map(
      (row) =>
        String(
          row.table_name,
        ),
    );

  const keyNames = [
    "schools",
    "users",
    "students",
    "attendance_sessions",
    "student_attendance_records",
    "student_presence_events",
    "school_attendance_lifecycles",
    "school_attendance_lifecycle_events",
    "attendance_session_events",
    "attendance_session_policy_rebinds",
    "student_arrival_method_assignments",
    "student_first_card_attendance_exceptions",
    "student_supervised_late_arrivals",
  ];

  const keyTables =
    Object.fromEntries(
      keyNames.map(
        (name) => [
          name,
          tableNames.includes(
            name,
          ),
        ],
      ),
    );

  const lifecycleColumns =
    await client.query(`
      select
        column_name
      from information_schema.columns
      where table_schema='public'
        and table_name='school_attendance_lifecycles'
      order by ordinal_position
    `);

  const arrivalColumns =
    await client.query(`
      select
        column_name
      from information_schema.columns
      where table_schema='public'
        and table_name='student_arrival_method_assignments'
      order by ordinal_position
    `);

  await client.query(
    "rollback",
  );

  console.log(
    JSON.stringify({
      transport:
        "NEON_WEBSOCKET_POOL_READ_ONLY",
      label,
      host,
      database:
        identity.rows[0]?.database_name ??
        null,
      role:
        identity.rows[0]?.database_user ??
        null,
      currentSchema:
        identity.rows[0]?.current_schema ??
        null,
      migrationTableExists:
        Boolean(
          migrationTable.rows[0]?.exists,
        ),
      appliedMigrations:
        migrations.length,
      migrations:
        migrations.map(
          (row) => ({
            id:
              row.id,
            hash:
              String(
                row.hash ??
                "",
              ).toLowerCase(),
            createdAt:
              row.created_at,
          }),
        ),
      publicTableCount:
        tableNames.length,
      keyTables,
      lifecycleColumns:
        lifecycleColumns.rows.map(
          (row) =>
            String(
              row.column_name,
            ),
        ),
      arrivalColumns:
        arrivalColumns.rows.map(
          (row) =>
            String(
              row.column_name,
            ),
        ),
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
        $ProbePath,
        $ProbeCode,
        $Utf8NoBom
    )

    Step "Reading Development migration/schema truth read-only"

    $DevelopmentState =
        Invoke-ReadOnlyProbe `
            $DevelopmentUrl `
            $ExpectedDevelopmentHost `
            "Development" `
            $ProbePath

    Assert-Prefix `
        $DevelopmentState `
        $LocalManifest `
        "Development"

    if (
        [int]$DevelopmentState.appliedMigrations -ne
        30
    ) {
        Stop-Phase "Development must remain exactly 30/30; found $($DevelopmentState.appliedMigrations)."
    }

    if (
        -not [bool]$DevelopmentState.keyTables.school_attendance_lifecycles
    ) {
        Stop-Phase "Development 30/30 unexpectedly lacks school_attendance_lifecycles."
    }

    Write-Host "  Development migrations:       30 / EXACT PREFIX"
    Write-Host "  Development lifecycle table:  PRESENT / VERIFIED"

    Step "Reading Staging migration/schema truth read-only"

    $StagingState =
        Invoke-ReadOnlyProbe `
            $StagingUrl `
            $ExpectedStagingHost `
            "Staging" `
            $ProbePath

    Assert-Prefix `
        $StagingState `
        $LocalManifest `
        "Staging"

    $StagingApplied =
        [int]$StagingState.appliedMigrations

    $LifecyclePresent =
        [bool]$StagingState.keyTables.school_attendance_lifecycles

    $Classification =
        "UNCLASSIFIED"

    $PromotionAuthorized =
        $false

    if (
        $StagingApplied -ge 22 -and
        -not $LifecyclePresent
    ) {
        $Classification =
            "MIGRATION_HISTORY_SCHEMA_DRIFT__M22_OR_LATER_RECORDED_BUT_LIFECYCLE_TABLE_MISSING"
    }
    elseif (
        $StagingApplied -lt 22 -and
        -not $LifecyclePresent
    ) {
        $Classification =
            "STAGING_GENUINELY_BEHIND_MIGRATION_22"
    }
    elseif (
        $StagingApplied -ge 22 -and
        $LifecyclePresent -and
        $StagingApplied -lt 30
    ) {
        $Classification =
            "STAGING_VALID_PREFIX_BEHIND_DEVELOPMENT"
        $PromotionAuthorized =
            $true
    }
    elseif (
        $StagingApplied -eq 30 -and
        $LifecyclePresent
    ) {
        $Classification =
            "STAGING_ALREADY_AT_30"
    }
    elseif (
        $StagingApplied -gt 30
    ) {
        $Classification =
            "STAGING_HISTORY_AHEAD_OF_LOCAL_AUTHORITY"
    }

    $Missing =
        @(
            if (
                $StagingApplied -lt
                $LocalManifest.Count
            ) {
                $LocalManifest |
                    Where-Object {
                        [int]$_.position -gt
                        $StagingApplied
                    }
            }
        )

    $DevelopmentState |
        ConvertTo-Json -Depth 20 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "DEVELOPMENT_STATE.json"
            ) `
            -Encoding UTF8

    $StagingState |
        ConvertTo-Json -Depth 20 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "STAGING_STATE.json"
            ) `
            -Encoding UTF8

    $Missing |
        ConvertTo-Json -Depth 10 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "MISSING_MIGRATIONS.json"
            ) `
            -Encoding UTF8

    $Result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_STAGING_EXACT_MIGRATION_SCHEMA_TRUTH_V1"
            classification =
                $Classification
            developmentAppliedMigrations =
                30
            stagingAppliedMigrations =
                $StagingApplied
            stagingHistoryPrefixMatch =
                $true
            migration22LifecycleTablePresent =
                $LifecyclePresent
            publicTableCount =
                [int]$StagingState.publicTableCount
            database =
                [string]$StagingState.database
            role =
                [string]$StagingState.role
            missingMigrationCount =
                @($Missing).Count
            automaticPromotionAuthorizedByThisProbe =
                $PromotionAuthorized
            sourceMutation =
                $false
            developmentMutation =
                $false
            stagingMutation =
                $false
            awsMutation =
                $false
            productionRead =
                $false
            productionConnected =
                $false
            productionMutation =
                $false
        }

    $Result |
        ConvertTo-Json -Depth 12 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "RESULT.json"
            ) `
            -Encoding UTF8

    Write-Host ""
    Write-Host "CASA STAGING EXACT MIGRATION/SCHEMA TRUTH PROBE IS GREEN" -ForegroundColor Green
    Write-Host "  Staging host:                    $ExpectedStagingHost / VERIFIED"
    Write-Host "  Staging database:                $($StagingState.database)"
    Write-Host "  Staging role:                    $($StagingState.role)"
    Write-Host "  Staging applied migrations:      $StagingApplied"
    Write-Host "  Staging migration history:       EXACT LOCAL PREFIX / VERIFIED"
    Write-Host "  Staging public tables:           $($StagingState.publicTableCount)"
    Write-Host "  migration-22 lifecycle table:    $(if ($LifecyclePresent) { 'PRESENT' } else { 'ABSENT' })"
    Write-Host "  missing migrations to Dev 30:    $(@($Missing).Count)"
    Write-Host "  classification:                  $Classification"
    Write-Host "  mutation this run:               NONE / READ ONLY"
    Write-Host "  Production:                      NOT READ / NOT CONNECTED"
    Write-Host "  evidence:                        $Evidence"
    Write-Host ""

    if (
        $Classification -eq
        "MIGRATION_HISTORY_SCHEMA_DRIFT__M22_OR_LATER_RECORDED_BUT_LIFECYCLE_TABLE_MISSING"
    ) {
        Write-Host "NEXT: return this output. Do NOT promote Staging; migration-history/schema repair must be designed first." -ForegroundColor Yellow
    }
    elseif (
        $Classification -eq
        "STAGING_GENUINELY_BEHIND_MIGRATION_22"
    ) {
        Write-Host "NEXT: return this output. We will build a guarded full-prefix promotion from this exact Staging stage to 30 rather than assuming stage 25." -ForegroundColor Yellow
    }
    elseif (
        $Classification -eq
        "STAGING_VALID_PREFIX_BEHIND_DEVELOPMENT"
    ) {
        Write-Host "NEXT: return this output. We can build the promotion from this exact verified prefix to 30." -ForegroundColor Yellow
    }
    elseif (
        $Classification -eq
        "STAGING_ALREADY_AT_30"
    ) {
        Write-Host "NEXT: return this output. No schema promotion is needed; proceed to Staging runtime verification." -ForegroundColor Yellow
    }
    else {
        Write-Host "NEXT: return this output for state-aware review before any Staging write." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "CASA STAGING EXACT MIGRATION/SCHEMA TRUTH PROBE STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    throw
}
