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

$ExpectedScannerCssHash =
    "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"

$ExpectedInstallControlHash =
    "7d7cf5f90474a3075544307998929fabb0344bdf73f6d2d591d6be82a530a6e9"

$ExpectedAwsHash =
    "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"

$ExpectedPendingRouteHash =
    "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"

$ExpectedPendingRecoverySelftestHash =
    "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"

$ExpectedProgressionHash =
    "718ed050f547361623cd9da73187ff2a2de0b7355017847481853475770ef7c9"

$ExpectedRenewalHash =
    "458982ebd6076b28777ad14aad1d66c9dd960e142e5a42b426cc87867997519"

$ExpectedRenderHash =
    "a3ab20fb06d1ca44f3c64db1fbf99bb010f8f1e38623fc7f7dc8f763f1fd1bfc"

$ExpectedTemplateRouteHash =
    "dec41315e52c2c784ac20f3ca76f4990b088eaa5ad9b6ec885227c928c5dc531"

$ExpectedRegistryHash =
    "c17fdb66b3cf70984f88da2ea6c2d88ff05bda027edfac6389f2a9dbb8afd451"

$ExpectedPassASelftestHash =
    "ce24cd2c31dae5c23c2bed86a83ea68a8b5b6525bd8b8d4c5eb5c13b88d55bd4"

$ExpectedMigration29Hash =
    "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"

$ExpectedMigration30Hash =
    "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

$PromotionEvidenceRelative =
    ".casa-backups\staging-full-prefix-16-to-30-v1r3-20260909-180233\RESULT.json"

$Utf8NoBom =
    New-Object System.Text.UTF8Encoding($false)

$Evidence = $null
$ProbePath = $null
$ServerProcess = $null
$OriginalDatabaseUrl =
    [Environment]::GetEnvironmentVariable(
        "DATABASE_URL",
        "Process"
    )
$OriginalNodeOptions =
    [Environment]::GetEnvironmentVariable(
        "NODE_OPTIONS",
        "Process"
    )

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

    return (
        Get-FileHash `
            -LiteralPath $Path `
            -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function Assert-Hash(
    [string]$RelativePath,
    [string]$ExpectedHash
) {
    $Path =
        Join-Path `
            $ProjectRoot `
            $RelativePath

    $Actual =
        Sha $Path

    if (
        $Actual -ne
        $ExpectedHash.ToLowerInvariant()
    ) {
        Stop-Phase "Checksum drift: $RelativePath"
    }
}

function Get-LfNormalizedSha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Phase "Required file missing: $Path"
    }

    $Text =
        [System.IO.File]::ReadAllText($Path)

    $Normalized =
        $Text.Replace("`r`n", "`n").Replace("`r", "`n")

    $Bytes =
        (New-Object System.Text.UTF8Encoding($false)).GetBytes($Normalized)

    $Hasher =
        [System.Security.Cryptography.SHA256]::Create()

    try {
        $HashBytes =
            $Hasher.ComputeHash($Bytes)

        return (
            -join (
                $HashBytes |
                    ForEach-Object {
                        $_.ToString("x2")
                    }
            )
        )
    }
    finally {
        $Hasher.Dispose()
    }
}

function Assert-PermanentCardRenewalAuthority {
    $RelativePath =
        "src\server\card-production\renewal-production.ts"

    $Path =
        Join-Path `
            $ProjectRoot `
            $RelativePath

    $RawHash =
        Sha $Path

    $NormalizedHash =
        Get-LfNormalizedSha $Path

    $Expected =
        $ExpectedRenewalHash.ToLowerInvariant()

    if (
        $RawHash -ne $Expected -and
        $NormalizedHash -ne $Expected
    ) {
        Stop-Phase "Checksum/content drift: $RelativePath (raw and LF-normalized hashes both differ from canonical permanent-card authority)."
    }

    $Source =
        Get-Content `
            -LiteralPath $Path `
            -Raw

    if (-not $Source.Contains("function routineCardRenewalDisabled(): boolean")) {
        Stop-Phase "Permanent-card renewal policy helper is missing."
    }

    if (([regex]::Matches($Source, "routineCardRenewalDisabled\(\)")).Count -ne 3) {
        Stop-Phase "Permanent-card renewal policy no longer guards both legacy renewal entrypoints."
    }

    if (([regex]::Matches($Source, "ROUTINE_CARD_RENEWAL_DISABLED")).Count -ne 2) {
        Stop-Phase "Both legacy routine-renewal entrypoints are not fail-closed."
    }

    if (-not $Source.Contains("Class and academic-session changes are digital only")) {
        Stop-Phase "Permanent-card digital-only class/session policy message is missing."
    }

    if ($RawHash -eq $Expected) {
        Write-Host "  renewal-production.ts:         BYTE-EXACT / VERIFIED"
    }
    else {
        Write-Host "  renewal-production.ts:         LF-NORMALIZED EXACT / CRLF-LF ONLY"
    }
}

function Read-EnvValue(
    [string]$Path,
    [string]$Name
) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Phase "Environment file missing: $Path"
    }

    foreach ($Raw in Get-Content -LiteralPath $Path) {
        $Line =
            ([string]$Raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace($Line) -or
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

function Get-LocalMigrationManifest {
    $Directories =
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

    if ($Directories.Count -ne 30) {
        Stop-Phase "Expected exactly 30 local migrations; found $($Directories.Count)."
    }

    $Rows = @()

    for (
        $Index = 0;
        $Index -lt $Directories.Count;
        $Index++
    ) {
        $Directory =
            $Directories[$Index]

        $Rows +=
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

    return $Rows
}

function Assert-ExactMigrationAuthority(
    [object]$State,
    [object[]]$LocalManifest,
    [string]$Label
) {
    if ([int]$State.appliedMigrations -ne 30) {
        Stop-Phase "$Label must be exactly migration 30; found $($State.appliedMigrations)."
    }

    $Rows =
        @($State.migrations)

    if ($Rows.Count -ne 30) {
        Stop-Phase "$Label migration history cardinality mismatch."
    }

    for (
        $Index = 0;
        $Index -lt 30;
        $Index++
    ) {
        if (
            [string]$Rows[$Index].hash -ne
            [string]$LocalManifest[$Index].hash
        ) {
            Stop-Phase "$Label migration hash diverges at position $($Index + 1)."
        }
    }
}

function Invoke-NpmChecked(
    [string]$Label,
    [string[]]$Arguments
) {
    Write-Host "  $Label"

    $Previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        & npm.cmd @Arguments

        $ExitCode =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $Previous
    }

    if ($ExitCode -ne 0) {
        Stop-Phase "$Label failed with exit code $ExitCode."
    }
}

function Invoke-NpxChecked(
    [string]$Label,
    [string[]]$Arguments
) {
    Write-Host "  $Label"

    $Previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        & npx.cmd @Arguments

        $ExitCode =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $Previous
    }

    if ($ExitCode -ne 0) {
        Stop-Phase "$Label failed with exit code $ExitCode."
    }
}

function Write-ReadOnlyProbe(
    [string]$Path
) {
    $Code = @'
import {
  Pool,
  neonConfig,
} from "@neondatabase/serverless";

const raw =
  process.env.CASA_RUNTIME_VERIFY_DB_URL;

const expectedHost =
  String(
    process.env.CASA_RUNTIME_VERIFY_EXPECTED_HOST ??
    "",
  ).toLowerCase();

const label =
  String(
    process.env.CASA_RUNTIME_VERIFY_LABEL ??
    "database",
  );

if (!raw) {
  throw new Error(
    "CASA_RUNTIME_VERIFY_DB_URL missing.",
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

async function existsTable(
  name,
) {
  const result =
    await client.query(
      `
        select exists (
          select 1
          from information_schema.tables
          where table_schema='public'
            and table_name=$1
        ) as exists
      `,
      [name],
    );

  return Boolean(
    result.rows[0]?.exists,
  );
}

async function existsColumn(
  table,
  column,
) {
  const result =
    await client.query(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema='public'
            and table_name=$1
            and column_name=$2
        ) as exists
      `,
      [
        table,
        column,
      ],
    );

  return Boolean(
    result.rows[0]?.exists,
  );
}

try {
  client =
    await pool.connect();

  await client.query(
    "begin read only",
  );

  const migrations =
    await client.query(`
      select
        id,
        hash,
        created_at
      from drizzle.__drizzle_migrations
      order by id
    `);

  const identity =
    await client.query(`
      select
        current_database() as database_name,
        current_user as database_user,
        (now() at time zone 'Africa/Lagos')::text as lagos_now
    `);

  const tables =
    await client.query(`
      select table_name
      from information_schema.tables
      where table_schema='public'
        and table_type='BASE TABLE'
      order by table_name
    `);

  const tableNames =
    tables.rows.map(
      (row) =>
        String(
          row.table_name,
        ),
    );

  const rowCounts = {};

  for (
    const table of
    tableNames
  ) {
    const quoted =
      '"' +
      table.replaceAll(
        '"',
        '""',
      ) +
      '"';

    const result =
      await client.query(
        `select count(*)::int as count from ${quoted}`,
      );

    rowCounts[table] =
      Number(
        result.rows[0]?.count ??
        0,
      );
  }

  const requiredTables = [
    "school_attendance_lifecycles",
    "school_attendance_lifecycle_events",
    "attendance_session_events",
    "attendance_session_policy_rebinds",
    "student_arrival_method_assignments",
    "student_first_card_attendance_exceptions",
    "student_supervised_late_arrivals",
    "student_identity_cards",
  ];

  const tableContract = {};

  for (
    const name of
    requiredTables
  ) {
    tableContract[name] =
      await existsTable(
        name,
      );
  }

  const columnContract = {
    scheduled_resume_at:
      await existsColumn(
        "school_attendance_lifecycles",
        "scheduled_resume_at",
      ),
    scheduled_resume_by_membership_id:
      await existsColumn(
        "school_attendance_lifecycles",
        "scheduled_resume_by_membership_id",
      ),
    scheduled_resume_reason:
      await existsColumn(
        "school_attendance_lifecycles",
        "scheduled_resume_reason",
      ),
    lifecycle_event_scheduled_for:
      await existsColumn(
        "school_attendance_lifecycle_events",
        "scheduled_for",
      ),
    arrival_internal_actor:
      await existsColumn(
        "student_arrival_method_assignments",
        "assigned_by_internal_membership_id",
      ),
  };

  const firstSchool =
    tableNames.includes(
      "schools",
    )
      ? (
          await client.query(`
            select
              id,
              slug
            from schools
            where slug is not null
              and length(trim(slug)) > 0
            order by created_at asc,
                     id asc
            limit 1
          `)
        ).rows[0] ??
        null
      : null;

  const trigger =
    await client.query(`
      select pg_get_triggerdef(t.oid) as definition
      from pg_trigger t
      join pg_class r
        on r.oid=t.tgrelid
      join pg_namespace n
        on n.oid=r.relnamespace
      where n.nspname='public'
        and r.relname='student_arrival_method_assignments'
        and t.tgname='student_arrival_method_assignments_actor_guard_trigger'
        and not t.tgisinternal
    `);

  const fn =
    await client.query(`
      select pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n
        on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname='student_arrival_method_assignments_actor_guard'
    `);

  const functionDefinition =
    String(
      fn.rows[0]?.definition ??
      "",
    );

  const actorGuardReady =
    trigger.rows.length === 1 &&
    functionDefinition.includes(
      "requires exactly one actor",
    ) &&
    functionDefinition.includes(
      "TG_OP = 'INSERT'",
    );

  const actorCounts =
    await client.query(`
      select
        count(*)::int as total,
        count(*) filter (
          where assigned_by_membership_id is null
            and assigned_by_internal_membership_id is null
        )::int as actorless,
        count(*) filter (
          where assigned_by_membership_id is not null
            and assigned_by_internal_membership_id is not null
        )::int as dual,
        count(*) filter (
          where assigned_by_internal_membership_id is not null
        )::int as internal
      from student_arrival_method_assignments
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
      lagosNow:
        identity.rows[0]?.lagos_now ??
        null,
      appliedMigrations:
        migrations.rows.length,
      migrations:
        migrations.rows.map(
          (row) => ({
            id:
              row.id,
            hash:
              String(
                row.hash ??
                "",
              ).toLowerCase(),
          }),
        ),
      publicTableCount:
        tableNames.length,
      rowCounts,
      tableContract,
      columnContract,
      actorGuardReady,
      actorCounts:
        actorCounts.rows[0] ??
        null,
      firstSchool,
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
        $Path,
        $Code,
        $Utf8NoBom
    )
}

function Invoke-ReadOnlyProbe(
    [string]$DatabaseUrl,
    [string]$ExpectedHost,
    [string]$Label,
    [int]$MaxAttempts = 4
) {
    $OldDb =
        [Environment]::GetEnvironmentVariable(
            "CASA_RUNTIME_VERIFY_DB_URL",
            "Process"
        )

    $OldHost =
        [Environment]::GetEnvironmentVariable(
            "CASA_RUNTIME_VERIFY_EXPECTED_HOST",
            "Process"
        )

    $OldLabel =
        [Environment]::GetEnvironmentVariable(
            "CASA_RUNTIME_VERIFY_LABEL",
            "Process"
        )

    try {
        $env:CASA_RUNTIME_VERIFY_DB_URL =
            $DatabaseUrl

        $env:CASA_RUNTIME_VERIFY_EXPECTED_HOST =
            $ExpectedHost

        $env:CASA_RUNTIME_VERIFY_LABEL =
            $Label

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

            if ($ExitCode -eq 0) {
                if ($Lines.Count -eq 0) {
                    Stop-Phase "$Label probe returned no output."
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

                    Stop-Phase "$Label probe returned invalid JSON."
                }
            }

            Write-Host "  $Label probe attempt ${Attempt}/${MaxAttempts}: FAILED"

            if ($Attempt -lt $MaxAttempts) {
                $Delay =
                    $Attempt * 2

                Write-Host "    retrying after ${Delay}s..."
                Start-Sleep -Seconds $Delay
            }
            else {
                $Lines |
                    Select-Object -Last 40 |
                    ForEach-Object {
                        Write-Host "    $_"
                    }

                Stop-Phase "$Label probe failed after $MaxAttempts attempts."
            }
        }
    }
    finally {
        if ($null -ne $OldDb) {
            $env:CASA_RUNTIME_VERIFY_DB_URL =
                $OldDb
        }
        else {
            Remove-Item `
                Env:CASA_RUNTIME_VERIFY_DB_URL `
                -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldHost) {
            $env:CASA_RUNTIME_VERIFY_EXPECTED_HOST =
                $OldHost
        }
        else {
            Remove-Item `
                Env:CASA_RUNTIME_VERIFY_EXPECTED_HOST `
                -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldLabel) {
            $env:CASA_RUNTIME_VERIFY_LABEL =
                $OldLabel
        }
        else {
            Remove-Item `
                Env:CASA_RUNTIME_VERIFY_LABEL `
                -ErrorAction SilentlyContinue
        }
    }
}

function Assert-PassASchema(
    [object]$State,
    [string]$Label
) {
    foreach (
        $Property in
        $State.tableContract.PSObject.Properties
    ) {
        if (-not [bool]$Property.Value) {
            Stop-Phase "$Label missing required Pass A table '$($Property.Name)'."
        }
    }

    foreach (
        $Property in
        $State.columnContract.PSObject.Properties
    ) {
        if (-not [bool]$Property.Value) {
            Stop-Phase "$Label missing required Pass A column '$($Property.Name)'."
        }
    }

    if (-not [bool]$State.actorGuardReady) {
        Stop-Phase "$Label future exact-one arrival actor guard is incomplete."
    }

    if ([int]$State.actorCounts.dual -ne 0) {
        Stop-Phase "$Label contains dual-attributed arrival assignments."
    }
}

function Assert-RowCountsEqual(
    [object]$Before,
    [object]$After,
    [string]$Label
) {
    $BeforeNames =
        @(
            $Before.PSObject.Properties |
                ForEach-Object {
                    [string]$_.Name
                }
        )

    $AfterNames =
        @(
            $After.PSObject.Properties |
                ForEach-Object {
                    [string]$_.Name
                }
        )

    $Diff =
        @(
            Compare-Object `
                $BeforeNames `
                $AfterNames
        )

    if ($Diff.Count -ne 0) {
        Stop-Phase "$Label public table set changed."
    }

    foreach (
        $Property in
        $Before.PSObject.Properties
    ) {
        $Name =
            [string]$Property.Name

        $BeforeCount =
            [int]$Property.Value

        $AfterCount =
            [int]$After.PSObject.Properties[$Name].Value

        if ($AfterCount -ne $BeforeCount) {
            Stop-Phase "$Label row count changed for '$Name': before=$BeforeCount after=$AfterCount."
        }
    }
}

function Get-FreePort {
    foreach ($Port in 3198..3225) {
        $Listener = $null

        try {
            $Listener =
                New-Object `
                    System.Net.Sockets.TcpListener(
                        [System.Net.IPAddress]::Loopback,
                        $Port
                    )

            $Listener.Start()
            $Listener.Stop()

            return $Port
        }
        catch {
            if ($null -ne $Listener) {
                try {
                    $Listener.Stop()
                }
                catch {
                }
            }
        }
    }

    Stop-Phase "No guarded localhost port is available in 3198-3225."
}

function Stop-LocalServer {
    if (
        $null -ne $ServerProcess -and
        -not $ServerProcess.HasExited
    ) {
        try {
            & taskkill `
                /PID $ServerProcess.Id `
                /T `
                /F |
                Out-Null
        }
        catch {
        }
    }

    $script:ServerProcess =
        $null
}

Write-Host "CASA School - Staging Runtime + Functional Safe Smoke Verification V1R1" -ForegroundColor Green
Write-Host "Verifies the exact migration-30 source against Staging through a local Next.js runtime."
Write-Host "V1R1 treats CRLF/LF-only normalization of renewal-production.ts as byte-format variation, but still requires the exact canonical LF-normalized hash and permanent-card fail-closed contract."
Write-Host "HTTP checks are non-mutating/anonymous only. Staging is snapshotted before and after; every public-table row count must remain unchanged."
Write-Host "Development is used only for the build environment and is snapshotted read-only before/after build."
Write-Host "No card scan. No face/liveness session. No AWS call. No Staging schema mutation. Production is never read or connected."

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Phase "CASA repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Locking exact post-Staging-promotion source authority"

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

    Assert-Hash "package.json" $ExpectedPackageHash
    Assert-Hash "src\app\scanner\scanner-client.tsx" $ExpectedScannerHash
    Assert-Hash "src\app\scanner\scanner.module.css" $ExpectedScannerCssHash
    Assert-Hash "src\app\scanner\scanner-install-control.tsx" $ExpectedInstallControlHash
    Assert-Hash "src\server\biometrics\aws-liveness.ts" $ExpectedAwsHash
    Assert-Hash "src\app\api\terminal\attempts\pending\route.ts" $ExpectedPendingRouteHash
    Assert-Hash "scripts\scanner-pending-attempt-recovery-selftest.ts" $ExpectedPendingRecoverySelftestHash
    Assert-Hash "src\server\school-operations\progression.ts" $ExpectedProgressionHash
    Assert-PermanentCardRenewalAuthority
    Assert-Hash "src\server\card-production\render.ts" $ExpectedRenderHash
    Assert-Hash "src\app\api\internal\card-production\templates\route.ts" $ExpectedTemplateRouteHash
    Assert-Hash "src\app\schools\[slug]\registry\student-cards.tsx" $ExpectedRegistryHash
    Assert-Hash "scripts\pass-a-selftest.ts" $ExpectedPassASelftestHash

    $LocalManifest =
        @(Get-LocalMigrationManifest)

    if (
        [string]$LocalManifest[28].hash -ne
        $ExpectedMigration29Hash -or
        [string]$LocalManifest[29].hash -ne
        $ExpectedMigration30Hash
    ) {
        Stop-Phase "Migration 29/30 authority drift."
    }

    $Previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        & git diff --check

        $DiffExit =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $Previous
    }

    if ($DiffExit -ne 0) {
        Stop-Phase "git diff --check failed."
    }

    Write-Host "  branch/head:                   $Branch/$Head"
    Write-Host "  migrations:                    30 / LOCAL HASHED"
    Write-Host "  permanent-card source:         LOCKED / VERIFIED"
    Write-Host "  Scanner/AWS/pending recovery:  LOCKED / VERIFIED"
    Write-Host "  git diff --check:              PASS"

    Step "Re-proving exact Staging promotion evidence"

    $PromotionEvidencePath =
        Join-Path `
            $ProjectRoot `
            $PromotionEvidenceRelative

    if (-not (Test-Path -LiteralPath $PromotionEvidencePath -PathType Leaf)) {
        Stop-Phase "Staging migration-30 GREEN evidence is missing."
    }

    $Promotion =
        Get-Content `
            -LiteralPath $PromotionEvidencePath `
            -Raw |
            ConvertFrom-Json

    if (
        [string]$Promotion.classification -ne "GREEN" -or
        [int]$Promotion.stagingBefore -ne 16 -or
        [int]$Promotion.stagingAfter -ne 30 -or
        [int]$Promotion.migrationsApplied -ne 14 -or
        [bool]$Promotion.productionConnected
    ) {
        Stop-Phase "Staging promotion evidence is not the required GREEN 16 -> 30 proof."
    }

    Write-Host "  Staging promotion:             16 -> 30 / GREEN"
    Write-Host "  Production connected there:   NO"

    Step "Running source regression gates"

    Invoke-NpmChecked "typecheck" @("run","typecheck")
    Invoke-NpmChecked "Scanner PWA self-test" @("run","scanner:selftest")
    Invoke-NpmChecked "student-card cryptographic self-test" @("run","card:selftest")
    Invoke-NpxChecked "Pass A source contract self-test" @("tsx","scripts/pass-a-selftest.ts")
    Invoke-NpxChecked "pending-attempt recovery self-test" @("tsx","scripts/scanner-pending-attempt-recovery-selftest.ts")

    Step "Locking Development and Staging database identities"

    $DevelopmentDatabaseUrl =
        Read-EnvValue `
            (Join-Path $ProjectRoot ".env.local") `
            "DATABASE_URL"

    $StagingDatabaseUrl =
        Read-EnvValue `
            (Join-Path $ProjectRoot ".env.staging.local") `
            "DATABASE_URL"

    try {
        $DevelopmentUri =
            [Uri]$DevelopmentDatabaseUrl

        $StagingUri =
            [Uri]$StagingDatabaseUrl
    }
    catch {
        Stop-Phase "Development or Staging DATABASE_URL is invalid."
    }

    if ($DevelopmentUri.Host -ne $ExpectedDevelopmentHost) {
        Stop-Phase "Development endpoint mismatch."
    }

    if ($StagingUri.Host -ne $ExpectedStagingHost) {
        Stop-Phase "Staging endpoint mismatch."
    }

    if ($DevelopmentUri.Host -eq $StagingUri.Host) {
        Stop-Phase "Development and Staging unexpectedly share a host."
    }

    Write-Host "  Development:                   VERIFIED"
    Write-Host "  Staging:                       VERIFIED"
    Write-Host "  Production:                    NOT READ / NOT CONNECTED"

    $RequiredNodeOptions =
        "--dns-result-order=ipv4first --no-network-family-autoselection"

    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
        $env:NODE_OPTIONS =
            $RequiredNodeOptions
    }
    else {
        if ($env:NODE_OPTIONS -notmatch "dns-result-order=ipv4first") {
            $env:NODE_OPTIONS +=
                " --dns-result-order=ipv4first"
        }

        if ($env:NODE_OPTIONS -notmatch "no-network-family-autoselection") {
            $env:NODE_OPTIONS +=
                " --no-network-family-autoselection"
        }
    }

    $Stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\staging-runtime-functional-smoke-v1r1-$Stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    $ProbePath =
        Join-Path `
            $Evidence `
            "runtime-readonly-websocket.mjs"

    Write-ReadOnlyProbe $ProbePath

    Step "Snapshotting Development and Staging before build/runtime"

    $DevelopmentBefore =
        Invoke-ReadOnlyProbe `
            $DevelopmentDatabaseUrl `
            $ExpectedDevelopmentHost `
            "Development pre-build"

    $StagingBefore =
        Invoke-ReadOnlyProbe `
            $StagingDatabaseUrl `
            $ExpectedStagingHost `
            "Staging pre-runtime"

    Assert-ExactMigrationAuthority `
        $DevelopmentBefore `
        $LocalManifest `
        "Development"

    Assert-ExactMigrationAuthority `
        $StagingBefore `
        $LocalManifest `
        "Staging"

    Assert-PassASchema `
        $DevelopmentBefore `
        "Development"

    Assert-PassASchema `
        $StagingBefore `
        "Staging"

    $DevelopmentBefore |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "DEVELOPMENT_BEFORE.json"
            ) `
            -Encoding UTF8

    $StagingBefore |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "STAGING_BEFORE.json"
            ) `
            -Encoding UTF8

    Write-Host "  Development migrations:       30 / EXACT"
    Write-Host "  Staging migrations:           30 / EXACT"
    Write-Host "  Staging Pass A schema:         VERIFIED"
    Write-Host "  Staging table counts:          SNAPSHOTTED"

    Step "Building exact current source with Development environment"

    [Environment]::SetEnvironmentVariable(
        "DATABASE_URL",
        $DevelopmentDatabaseUrl,
        "Process"
    )
    $env:DATABASE_URL =
        $DevelopmentDatabaseUrl

    Invoke-NpmChecked "production build" @("run","build")

    $DevelopmentAfterBuild =
        Invoke-ReadOnlyProbe `
            $DevelopmentDatabaseUrl `
            $ExpectedDevelopmentHost `
            "Development post-build"

    Assert-ExactMigrationAuthority `
        $DevelopmentAfterBuild `
        $LocalManifest `
        "Development post-build"

    Assert-RowCountsEqual `
        $DevelopmentBefore.rowCounts `
        $DevelopmentAfterBuild.rowCounts `
        "Development build"

    Write-Host "  build:                         PASS"
    Write-Host "  Development DB rows:           UNCHANGED"

    Step "Starting local Next.js runtime against Staging"

    [Environment]::SetEnvironmentVariable(
        "DATABASE_URL",
        $StagingDatabaseUrl,
        "Process"
    )
    $env:DATABASE_URL =
        $StagingDatabaseUrl

    if ($env:DATABASE_URL -ne $StagingDatabaseUrl) {
        Stop-Phase "Staging DATABASE_URL is not active before runtime launch."
    }

    $Port =
        Get-FreePort

    $BaseUrl =
        "http://127.0.0.1:$Port"

    $StdoutLog =
        Join-Path `
            $Evidence `
            "next-staging.stdout.log"

    $StderrLog =
        Join-Path `
            $Evidence `
            "next-staging.stderr.log"

    $ServerProcess =
        Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList @(
                "/d",
                "/s",
                "/c",
                "npx next start -p $Port"
            ) `
            -WorkingDirectory $ProjectRoot `
            -RedirectStandardOutput $StdoutLog `
            -RedirectStandardError $StderrLog `
            -PassThru `
            -WindowStyle Hidden

    $HealthReady =
        $false

    for ($Index = 0; $Index -lt 60; $Index++) {
        Start-Sleep -Milliseconds 500

        if ($ServerProcess.HasExited) {
            $Stderr = ""

            if (Test-Path -LiteralPath $StderrLog -PathType Leaf) {
                $Stderr =
                    Get-Content `
                        -LiteralPath $StderrLog `
                        -Raw
            }

            Stop-Phase "Staging-backed local Next.js runtime exited before health check. $Stderr"
        }

        try {
            $Response =
                Invoke-WebRequest `
                    -Uri "$BaseUrl/api/health" `
                    -UseBasicParsing `
                    -TimeoutSec 4

            if ([int]$Response.StatusCode -eq 200) {
                $HealthReady =
                    $true
                break
            }
        }
        catch {
        }
    }

    if (-not $HealthReady) {
        Stop-Phase "Staging-backed local runtime did not become healthy."
    }

    Write-Host "  local runtime:                 $BaseUrl"
    Write-Host "  DATABASE_URL target:           STAGING / VERIFIED"

    Step "Running non-mutating Staging-backed HTTP smoke"

    $SmokePath =
        Join-Path `
            $Evidence `
            "staging-http-smoke.mjs"

    $SchoolSlug =
        if (
            $null -ne $StagingBefore.firstSchool -and
            -not [string]::IsNullOrWhiteSpace(
                [string]$StagingBefore.firstSchool.slug
            )
        ) {
            [string]$StagingBefore.firstSchool.slug
        }
        else {
            ""
        }

    $SmokeCode = @'
import crypto from "node:crypto";

const base =
  process.argv[2];

const schoolSlug =
  process.argv[3] ??
  "";

if (!base) {
  throw new Error(
    "Base URL missing.",
  );
}

async function call(
  path,
  init = {},
) {
  const response =
    await fetch(
      base + path,
      {
        redirect:
          "manual",
        ...init,
        headers: {
          "content-type":
            "application/json",
          ...(init.headers || {}),
        },
      },
    );

  return {
    path,
    status:
      response.status,
    location:
      response.headers.get(
        "location",
      ),
    contentType:
      response.headers.get(
        "content-type",
      ),
  };
}

const randomPublicKey =
  crypto
    .randomBytes(
      32,
    )
    .toString(
      "base64url",
    );

const checks = [];

checks.push(
  await call(
    "/api/health",
  ),
);

checks.push(
  await call(
    "/scanner",
  ),
);

checks.push(
  await call(
    "/manifest.webmanifest",
  ),
);

checks.push(
  await call(
    "/api/internal/card-production/templates",
  ),
);

checks.push(
  await call(
    "/api/terminal/session",
  ),
);

checks.push(
  await call(
    "/api/terminal/attempts/pending",
  ),
);

checks.push(
  await call(
    `/id-card/${randomPublicKey}`,
  ),
);

if (
  schoolSlug
) {
  checks.push(
    await call(
      `/api/schools/${encodeURIComponent(
        schoolSlug,
      )}/attendance/lifecycle`,
    ),
  );
}

console.log(
  JSON.stringify({
    schoolSlug:
      schoolSlug ||
      null,
    checks,
  }),
);
'@

    [System.IO.File]::WriteAllText(
        $SmokePath,
        $SmokeCode,
        $Utf8NoBom
    )

    $Previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        $SmokeOutput =
            @(
                & node.exe `
                    $SmokePath `
                    $BaseUrl `
                    $SchoolSlug 2>&1
            )

        $SmokeExit =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $Previous
    }

    if ($SmokeExit -ne 0) {
        $SmokeOutput |
            ForEach-Object {
                Write-Host $_
            }

        Stop-Phase "Staging-backed HTTP smoke script failed."
    }

    $SmokeLines =
        @(
            $SmokeOutput |
                ForEach-Object {
                    [string]$_
                } |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace($_)
                }
        )

    if ($SmokeLines.Count -eq 0) {
        Stop-Phase "HTTP smoke returned no output."
    }

    $Smoke =
        $SmokeLines[-1] |
            ConvertFrom-Json

    $Checks =
        @($Smoke.checks)

    function Find-Check([string]$Path) {
        return @(
            $Checks |
                Where-Object {
                    [string]$_.path -eq
                    $Path
                }
        ) |
            Select-Object -First 1
    }

    $Health =
        Find-Check "/api/health"

    $Scanner =
        Find-Check "/scanner"

    $Manifest =
        Find-Check "/manifest.webmanifest"

    $Templates =
        Find-Check "/api/internal/card-production/templates"

    $TerminalSession =
        Find-Check "/api/terminal/session"

    $Pending =
        Find-Check "/api/terminal/attempts/pending"

    if ($null -eq $Health -or [int]$Health.status -ne 200) {
        Stop-Phase "/api/health did not return HTTP 200."
    }

    if ($null -eq $Scanner -or [int]$Scanner.status -ne 200) {
        Stop-Phase "/scanner did not return HTTP 200."
    }

    if ($null -eq $Manifest -or [int]$Manifest.status -ne 200) {
        Stop-Phase "/manifest.webmanifest did not return HTTP 200."
    }

    foreach (
        $Item in @(
            @{
                Name = "internal templates"
                Check = $Templates
            },
            @{
                Name = "terminal session"
                Check = $TerminalSession
            },
            @{
                Name = "pending attempt recovery"
                Check = $Pending
            }
        )
    ) {
        if ($null -eq $Item.Check) {
            Stop-Phase "Missing HTTP smoke result for $($Item.Name)."
        }

        if (
            @(401,403) -notcontains
            [int]$Item.Check.status
        ) {
            Stop-Phase "$($Item.Name) did not fail closed anonymously; HTTP $($Item.Check.status)."
        }
    }

    $PublicCheck =
        @(
            $Checks |
                Where-Object {
                    [string]$_.path -like
                    "/id-card/*"
                }
        ) |
            Select-Object -First 1

    if (
        $null -eq $PublicCheck -or
        @(404,410) -notcontains
        [int]$PublicCheck.status
    ) {
        Stop-Phase "Random public card lookup did not remain unresolved."
    }

    if (-not [string]::IsNullOrWhiteSpace($SchoolSlug)) {
        $LifecyclePath =
            "/api/schools/$SchoolSlug/attendance/lifecycle"

        $Lifecycle =
            Find-Check $LifecyclePath

        if ($null -eq $Lifecycle) {
            Stop-Phase "Missing school attendance lifecycle anonymous smoke result."
        }

        if (
            @(401,403) -notcontains
            [int]$Lifecycle.status
        ) {
            Stop-Phase "School attendance lifecycle did not fail closed anonymously; HTTP $($Lifecycle.status)."
        }
    }

    $Smoke |
        ConvertTo-Json -Depth 10 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "HTTP_SMOKE.json"
            ) `
            -Encoding UTF8

    Write-Host "  /api/health:                   HTTP 200"
    Write-Host "  /scanner:                      HTTP 200"
    Write-Host "  /manifest.webmanifest:         HTTP 200"
    Write-Host "  internal templates anonymous:  FAIL-CLOSED"
    Write-Host "  terminal session anonymous:    FAIL-CLOSED"
    Write-Host "  pending recovery anonymous:    FAIL-CLOSED"
    Write-Host "  random public card:            UNRESOLVED"
    if (-not [string]::IsNullOrWhiteSpace($SchoolSlug)) {
        Write-Host "  attendance lifecycle anonymous: FAIL-CLOSED"
    }
    else {
        Write-Host "  school-specific auth smoke:    SKIPPED / NO STAGING SCHOOL ROW"
    }

    Step "Stopping local runtime and proving Staging remained unchanged"

    Stop-LocalServer

    $StagingAfter =
        Invoke-ReadOnlyProbe `
            $StagingDatabaseUrl `
            $ExpectedStagingHost `
            "Staging post-runtime"

    Assert-ExactMigrationAuthority `
        $StagingAfter `
        $LocalManifest `
        "Staging post-runtime"

    Assert-PassASchema `
        $StagingAfter `
        "Staging post-runtime"

    Assert-RowCountsEqual `
        $StagingBefore.rowCounts `
        $StagingAfter.rowCounts `
        "Staging runtime smoke"

    $StagingAfter |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (
                Join-Path `
                    $Evidence `
                    "STAGING_AFTER.json"
            ) `
            -Encoding UTF8

    Write-Host "  Staging migrations:           30 / EXACT"
    Write-Host "  Staging public table set:     UNCHANGED"
    Write-Host "  every Staging table row count: UNCHANGED"
    Write-Host "  Staging DB mutation:          NONE"

    Step "Final source immutability proof"

    Assert-Hash "package.json" $ExpectedPackageHash
    Assert-Hash "src\app\scanner\scanner-client.tsx" $ExpectedScannerHash
    Assert-Hash "src\server\biometrics\aws-liveness.ts" $ExpectedAwsHash
    Assert-Hash "src\app\api\terminal\attempts\pending\route.ts" $ExpectedPendingRouteHash
    Assert-Hash "scripts\pass-a-selftest.ts" $ExpectedPassASelftestHash

    $FinalManifest =
        @(Get-LocalMigrationManifest)

    for ($Index = 0; $Index -lt 30; $Index++) {
        if (
            [string]$FinalManifest[$Index].hash -ne
            [string]$LocalManifest[$Index].hash
        ) {
            Stop-Phase "Migration source changed during runtime verification."
        }
    }

    $Result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_STAGING_RUNTIME_FUNCTIONAL_SAFE_SMOKE_V1R1"
            classification =
                "GREEN"
            sourceAuthority =
                "main/a7aa668"
            developmentMigrations =
                30
            stagingMigrations =
                30
            build =
                "PASS"
            scannerPage =
                "HTTP_200"
            manifest =
                "HTTP_200"
            health =
                "HTTP_200"
            anonymousInternalTemplates =
                "FAIL_CLOSED"
            anonymousTerminalSession =
                "FAIL_CLOSED"
            anonymousPendingRecovery =
                "FAIL_CLOSED"
            randomPublicCard =
                "UNRESOLVED"
            stagingRowCountsUnchanged =
                $true
            developmentBuildRowCountsUnchanged =
                $true
            passASchema =
                "VERIFIED"
            permanentCardSource =
                "VERIFIED"
            scannerRecoverySource =
                "VERIFIED"
            awsLivenessSource =
                "VERIFIED"
            cardScan =
                $false
            faceLivenessSession =
                $false
            awsCall =
                $false
            sourceMutation =
                $false
            stagingSchemaMutation =
                $false
            stagingDataMutation =
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
    Write-Host "CASA STAGING RUNTIME + FUNCTIONAL SAFE SMOKE V1R1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:              main/a7aa668 / VERIFIED"
    Write-Host "  Development migrations:       30 / READ-ONLY VERIFIED"
    Write-Host "  Staging migrations:           30 / VERIFIED"
    Write-Host "  production build:              PASS"
    Write-Host "  Staging-backed runtime:        HEALTHY"
    Write-Host "  Scanner page + manifest:       HTTP 200"
    Write-Host "  protected routes anonymous:    FAIL-CLOSED"
    Write-Host "  random public card:            UNRESOLVED"
    Write-Host "  Pass A schema/runtime contract: VERIFIED"
    Write-Host "  permanent-card source:         VERIFIED"
    Write-Host "  pending recovery source:       VERIFIED"
    Write-Host "  Staging table row counts:      ALL UNCHANGED"
    Write-Host "  card scan / face liveness:     NOT PERFORMED"
    Write-Host "  AWS calls:                      NONE"
    Write-Host "  Staging mutation this run:     NONE"
    Write-Host "  Production:                     NOT READ / NOT CONNECTED"
    Write-Host "  evidence:                       $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete GREEN output. If GREEN, Staging is closed and we prepare the guarded Production promotion/readiness gate." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA STAGING RUNTIME + FUNCTIONAL SAFE SMOKE V1R1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    throw
}
finally {
    Stop-LocalServer

    if ($null -eq $OriginalDatabaseUrl) {
        Remove-Item `
            Env:DATABASE_URL `
            -ErrorAction SilentlyContinue
    }
    else {
        [Environment]::SetEnvironmentVariable(
            "DATABASE_URL",
            $OriginalDatabaseUrl,
            "Process"
        )
        $env:DATABASE_URL =
            $OriginalDatabaseUrl
    }

    if ($null -eq $OriginalNodeOptions) {
        Remove-Item `
            Env:NODE_OPTIONS `
            -ErrorAction SilentlyContinue
    }
    else {
        [Environment]::SetEnvironmentVariable(
            "NODE_OPTIONS",
            $OriginalNodeOptions,
            "Process"
        )
        $env:NODE_OPTIONS =
            $OriginalNodeOptions
    }
}
