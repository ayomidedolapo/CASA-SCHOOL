param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedStagingHost = "ep-ancient-truth-a5s7v83r-pooler.us-east-2.aws.neon.tech"

$ExpectedStagingStart = 16
$ExpectedFinalStage = 30

$PackageJsonHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$PackageLockHash = "1f031c58be57c0525d535881d1287666c8c059292cea9111d88ef6b8e94f7a15"
$DrizzleConfigHash = "77e9d1759af7ad1b1d3c009e7f57c6c6e25dd159a3da9907fb410552508eff80"

$ScannerHash = "60bea94ac01bbb59c2f1418bf2f2a0a6f1e7519c8942465e254983c1b37300fa"
$ScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$ScannerInstallControlHash = "7d7cf5f90474a3075544307998929fabb0344bdf73f6d2d591d6be82a530a6e9"

$AwsLivenessHash = "225848d3b7320ad993d61f5973c9c0f411f4cc934bccf9b581f2e432576e000b"
$PendingRouteHash = "b0a62936d4bff65ad3751407209e761a7caaa89feffab764ea5c828c1af94d35"
$PendingRecoverySelftestHash = "f7da32a43580c67eec6658887e1fb06f4f6525504d6eb6f511a555557e0ea785"

$ProgressionHash = "718ed050f547361623cd9da73187ff2a2de0b7355017847481853475770ef7c9"
$RenewalProductionHash = "458982ebd6076b28777ad14aad1d66c9dd960e1420e5a42b426cc87867997519"
$RenderHash = "a3ab20fb06d1ca44f3c64db1fbf99bb010f8f1e38623fc7f7dc8f763f1fd1bfc"
$TemplateRouteHash = "dec41315e52c2c784ac20f3ca76f4990b088eaa5ad9b6ec885227c928c5dc531"
$RegistryHash = "c17fdb66b3cf70984f88da2ea6c2d88ff05bda027edfac6389f2a9dbb8afd451"
$PassASelftestHash = "ce24cd2c31dae5c23c2bed86a83ea68a8b5b6525bd8b8d4c5eb5c13b88d55bd4"

$LiveGateEvidenceRelative = ".casa-backups\scanner-post-face-authoritative-verification-v1r1-20260909-153737\RESULT.json"
$TruthEvidenceRelative = ".casa-backups\staging-exact-schema-truth-v1-20260909-155528\RESULT.json"

$PassA29Folder = "20260909020000_pass-a-enum-expansion"
$PassA30Folder = "20260909020500_pass-a-handover-attendance-state"

$MigrationManifestJson = @'
{"drizzle/20260827143258_school-foundation/migration.sql":"683a432f36721229e86ebe016e4d956ab3df649b702930c8c05a803e0b9be613","drizzle/20260827171725_school-auth-foundation/migration.sql":"a6d01bb226545d3f67422aa3149572b5c7cf85168269dba1fcda8e06b0e3fc36","drizzle/20260827174117_secure-login/migration.sql":"76f5468f8c2554be98e5d6969b36b36a865d4bd1adcad1b1dd200b5c8da06b63","drizzle/20260827191914_student-registry-foundation/migration.sql":"9224cc76ea86744ac79aa0a705173a007d3fdee01b2b449eb83d0ce88b9a7fb4","drizzle/20260827211507_student-id-card-lifecycle/migration.sql":"7382817a032979d577536bf9d1556f269388b105899346c9af546fc185f2f06d","drizzle/20260828003838_attendance-foundation/migration.sql":"70f2ac13858e78bc7f668e99fa7f1b3cfcee14d33f20b12326e0c57a9a1ba452","drizzle/20260828014547_student-identity-operating-model/migration.sql":"981a83662ea810c1e00cbadc0c19fcbfe6a75624e194581bfe23c495c8a230fb","drizzle/20260828015513_presence-school-messaging/migration.sql":"5d4ef2848c3190328c104c8924303b8618f1835e9bae7bf6ae4c892d7588eab8","drizzle/20260828020702_scanner-trust-card-resolution/migration.sql":"346fb3e397be6c89ddae30982801d4b288e17f07a08c746cd9104ee851c030c4","drizzle/20260828022058_trusted-biometric-presence-finalization/migration.sql":"bf672317df4f953d3ef55763589ae2d961673405532254de68940e139108bb33","drizzle/20260828024845_passkey-identity-step-up/migration.sql":"070aebf19da8eb13a3287a0530310a111c109fe4d44b478a71652acefff59aba","drizzle/20260828030204_face-enrollment-biometric-gateway/migration.sql":"fc244d51841bac5873f30fc70c943abac0470f5ae7381b155ba5115a38e13dcc","drizzle/20260828032347_aws-rekognition-biometric-engine/migration.sql":"5738c4a86b86cd588072f0c4bc5121a2ec496d47e483d153fa8a516295453591","drizzle/20260828103906_attendance-operations-supervised-exceptions/migration.sql":"2d011422410a7ee64c498a9f9e056331c536ee059e6dea2690c8564d70c1ec58","drizzle/20260829002614_equal_sabra/migration.sql":"743027f1b2f533b12a2ca498a6adaf108e6138785ddab46bc705fcc749ffb279","drizzle/20260829120249_school-scoped-card-templates/migration.sql":"4b80bbe96046dd86ff07ab727393df8a87db461817239cd3cbb12bf098db80a1","drizzle/20260830031700_school-real-world-foundation/migration.sql":"a5caed6e5750af3282570dc44c8c678dc31e46a7aabc269d57c76b03599b1b66","drizzle/20260830143000_card-production-authority/migration.sql":"ef109d255d53a2f6a7c729a9ab0d7bf93208f82f9957e9a87769bf6201893b44","drizzle/20260830153500_identity-card-lifecycle-authority/migration.sql":"b6f3c065c9055b65f6669afb3e6f567612764bc0bf4653ee91b5a36994df9a8d","drizzle/20260831064829_post-migration19-snapshot-baseline/migration.sql":"63e0a9f759662885c6a1d350596b957c6765d0ded53467f4475a8ebcfd78f9a6","drizzle/20260831064909_teacher-my-class-assignment/migration.sql":"d0f080bc0bd5256416d1dc61e74a4cf1bd5e7fa2caa9b9e7f28fe44d2d8f4f27","drizzle/20260901081825_attendance-readiness-card-replacement/migration.sql":"085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b","drizzle/20260902190300_wave1_transport_casa_internal/migration.sql":"5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3","drizzle/20260902201500_wave2_structure_audit/migration.sql":"96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f","drizzle/20260905030000_internal_face_authority/migration.sql":"cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7","drizzle/20260907043140_attendance-session-reopen/migration.sql":"881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd","drizzle/20260907105900_attendance-session-event-stream-multicycle/migration.sql":"bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4","drizzle/20260908135855_attendance-session-policy-rebind/migration.sql":"7791abd6bcf90d2038e434fb7e6334d98a38d19c9f14c1f2871d03f27e498681","drizzle/20260909020000_pass-a-enum-expansion/migration.sql":"cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11","drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql":"6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"}
'@

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Evidence = $null
$ProbePath = $null
$StagingDatabaseUrl = $null
$DevelopmentDatabaseUrl = $null

$OriginalDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
$OriginalNodeOptions = [Environment]::GetEnvironmentVariable("NODE_OPTIONS", "Process")

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

function Assert-Hash([string]$RelativePath, [string]$ExpectedHash) {
    $Path = Join-Path $ProjectRoot ($RelativePath.Replace("/", "\"))
    $Actual = Sha $Path

    if ($Actual -ne $ExpectedHash.ToLowerInvariant()) {
        Stop-Phase "Checksum drift: $RelativePath`nExpected: $ExpectedHash`nActual:   $Actual"
    }
}

function Read-EnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Phase "Environment file missing: $Path"
    }

    foreach ($Raw in Get-Content -LiteralPath $Path) {
        $Line = ([string]$Raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace($Line) -or
            $Line.StartsWith("#")
        ) {
            continue
        }

        $Index = $Line.IndexOf("=")

        if ($Index -le 0) {
            continue
        }

        $Key = $Line.Substring(0, $Index).Trim()

        if ($Key -ne $Name) {
            continue
        }

        $Value = $Line.Substring($Index + 1).Trim()

        if (
            ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
            ($Value.StartsWith("'") -and $Value.EndsWith("'"))
        ) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }

        return $Value
    }

    Stop-Phase "$Name is missing from $Path"
}

function Get-MigrationDirectories {
    return @(
        Get-ChildItem `
            -LiteralPath (Join-Path $ProjectRoot "drizzle") `
            -Directory |
            Where-Object {
                Test-Path `
                    -LiteralPath (Join-Path $_.FullName "migration.sql") `
                    -PathType Leaf
            } |
            Sort-Object Name
    )
}

function Get-LocalMigrationManifest {
    $Directories = @(Get-MigrationDirectories)

    if ($Directories.Count -ne 30) {
        Stop-Phase "Expected exactly 30 local migrations; found $($Directories.Count)."
    }

    $Rows = New-Object System.Collections.Generic.List[object]

    for ($Index = 0; $Index -lt $Directories.Count; $Index++) {
        $Directory = $Directories[$Index]

        [void]$Rows.Add(
            [pscustomobject]@{
                position = $Index + 1
                folder = [string]$Directory.Name
                relative = "drizzle/$($Directory.Name)/migration.sql"
                path = Join-Path $Directory.FullName "migration.sql"
                hash = Sha (Join-Path $Directory.FullName "migration.sql")
            }
        )
    }

    return @($Rows)
}

function Assert-Manifest {
    $ExpectedObject = $MigrationManifestJson | ConvertFrom-Json
    $ExpectedMap = @{}

    foreach ($Property in $ExpectedObject.PSObject.Properties) {
        $ExpectedMap[[string]$Property.Name] = [string]$Property.Value
    }

    $Local = @(Get-LocalMigrationManifest)

    if ($ExpectedMap.Count -ne 30 -or $Local.Count -ne 30) {
        Stop-Phase "Migration manifest cardinality drift."
    }

    foreach ($Migration in $Local) {
        $Expected = $ExpectedMap[[string]$Migration.relative]

        if ([string]::IsNullOrWhiteSpace($Expected)) {
            Stop-Phase "Migration absent from locked manifest: $($Migration.relative)"
        }

        if ([string]$Migration.hash -ne $Expected.ToLowerInvariant()) {
            Stop-Phase "Migration checksum drift: $($Migration.relative)"
        }
    }

    return $Local
}

function Invoke-NpmChecked([string]$Label, [string[]]$Arguments) {
    Write-Host "  $Label"

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & npm.cmd @Arguments
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($ExitCode -ne 0) {
        Stop-Phase "$Label failed with exit code $ExitCode."
    }
}

function Invoke-NpxChecked([string]$Label, [string[]]$Arguments) {
    Write-Host "  $Label"

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & npx.cmd @Arguments
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($ExitCode -ne 0) {
        Stop-Phase "$Label failed with exit code $ExitCode."
    }
}

function Write-ProbeScript([string]$Path) {
    $Code = @'
import {
  Pool,
  neonConfig,
} from "@neondatabase/serverless";

const raw =
  process.env.CASA_STAGE_PROMOTION_DB_URL;

const expectedHost =
  String(
    process.env.CASA_STAGE_PROMOTION_EXPECTED_HOST ??
    "",
  ).toLowerCase();

const label =
  String(
    process.env.CASA_STAGE_PROMOTION_LABEL ??
    "database",
  );

if (!raw) {
  throw new Error(
    "CASA_STAGE_PROMOTION_DB_URL missing.",
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

async function tableExists(
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

async function columnExists(
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

async function enumValues(
  typeName,
) {
  const exists =
    await client.query(
      `
        select exists (
          select 1
          from pg_type t
          join pg_namespace n
            on n.oid=t.typnamespace
          where n.nspname='public'
            and t.typname=$1
        ) as exists
      `,
      [typeName],
    );

  if (
    !Boolean(
      exists.rows[0]?.exists,
    )
  ) {
    return [];
  }

  const values =
    await client.query(
      `
        select e.enumlabel
        from pg_type t
        join pg_enum e
          on e.enumtypid=t.oid
        join pg_namespace n
          on n.oid=t.typnamespace
        where n.nspname='public'
          and t.typname=$1
        order by e.enumsortorder
      `,
      [typeName],
    );

  return values.rows.map(
    (row) =>
      String(
        row.enumlabel,
      ),
  );
}

try {
  client =
    await pool.connect();

  await client.query(
    "begin read only",
  );

  const identity =
    await client.query(`
      select
        current_database() as database_name,
        current_user as database_user
    `);

  const migrations =
    await client.query(`
      select
        id,
        hash,
        created_at
      from drizzle.__drizzle_migrations
      order by id
    `);

  const publicTables =
    await client.query(`
      select table_name
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

  const keyNames = [
    "school_attendance_lifecycles",
    "school_attendance_lifecycle_events",
    "attendance_session_events",
    "attendance_session_policy_rebinds",
    "student_arrival_method_assignments",
    "student_first_card_attendance_exceptions",
    "student_supervised_late_arrivals",
  ];

  const keyTables = {};

  for (
    const name of
    keyNames
  ) {
    keyTables[name] =
      await tableExists(
        name,
      );
  }

  const structural = {
    scheduled_resume_at:
      await columnExists(
        "school_attendance_lifecycles",
        "scheduled_resume_at",
      ),
    scheduled_resume_by_membership_id:
      await columnExists(
        "school_attendance_lifecycles",
        "scheduled_resume_by_membership_id",
      ),
    scheduled_resume_reason:
      await columnExists(
        "school_attendance_lifecycles",
        "scheduled_resume_reason",
      ),
    lifecycle_event_scheduled_for:
      await columnExists(
        "school_attendance_lifecycle_events",
        "scheduled_for",
      ),
    arrival_internal_actor:
      await columnExists(
        "student_arrival_method_assignments",
        "assigned_by_internal_membership_id",
      ),
    identity_status_default_ready:
      false,
  };

  if (
    await columnExists(
      "student_identity_cards",
      "status",
    )
  ) {
    const result =
      await client.query(`
        select column_default
        from information_schema.columns
        where table_schema='public'
          and table_name='student_identity_cards'
          and column_name='status'
      `);

    structural.identity_status_default_ready =
      String(
        result.rows[0]?.column_default ??
        "",
      ).includes(
        "READY_FOR_ACTIVATION",
      );
  }

  const enums = {
    identityStatus:
      await enumValues(
        "student_identity_card_status",
      ),
    identityEvent:
      await enumValues(
        "student_identity_card_event_type",
      ),
    lifecycleEvent:
      await enumValues(
        "school_attendance_lifecycle_event_type",
      ),
  };

  let arrival = {
    total:
      null,
    actorless:
      null,
    internal:
      null,
    dual:
      null,
  };

  if (
    keyTables.student_arrival_method_assignments
  ) {
    if (
      structural.arrival_internal_actor
    ) {
      const result =
        await client.query(`
          select
            count(*)::int as total,
            count(*) filter (
              where assigned_by_membership_id is null
                and assigned_by_internal_membership_id is null
            )::int as actorless,
            count(*) filter (
              where assigned_by_internal_membership_id is not null
            )::int as internal,
            count(*) filter (
              where assigned_by_membership_id is not null
                and assigned_by_internal_membership_id is not null
            )::int as dual
          from student_arrival_method_assignments
        `);

      arrival = {
        total:
          Number(
            result.rows[0]?.total ??
            0,
          ),
        actorless:
          Number(
            result.rows[0]?.actorless ??
            0,
          ),
        internal:
          Number(
            result.rows[0]?.internal ??
            0,
          ),
        dual:
          Number(
            result.rows[0]?.dual ??
            0,
          ),
      };
    }
    else {
      const result =
        await client.query(`
          select
            count(*)::int as total,
            count(*) filter (
              where assigned_by_membership_id is null
            )::int as actorless
          from student_arrival_method_assignments
        `);

      arrival = {
        total:
          Number(
            result.rows[0]?.total ??
            0,
          ),
        actorless:
          Number(
            result.rows[0]?.actorless ??
            0,
          ),
        internal:
          null,
        dual:
          null,
      };
    }
  }

  let triggerReady =
    false;

  let actorConstraintReady =
    false;

  if (
    keyTables.student_arrival_method_assignments
  ) {
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

    const definition =
      String(
        fn.rows[0]?.definition ??
        "",
      );

    triggerReady =
      trigger.rows.length === 1 &&
      definition.includes(
        "requires exactly one actor",
      ) &&
      definition.includes(
        "TG_OP = 'INSERT'",
      );

    const constraint =
      await client.query(`
        select pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        join pg_class r
          on r.oid=c.conrelid
        join pg_namespace n
          on n.oid=r.relnamespace
        where n.nspname='public'
          and r.relname='student_arrival_method_assignments'
          and c.conname='student_arrival_method_assignments_actor_check'
      `);

    actorConstraintReady =
      constraint.rows.length ===
      1;
  }

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
            createdAt:
              row.created_at,
          }),
        ),
      publicTableCount:
        tableNames.length,
      rowCounts,
      keyTables,
      structural,
      enums,
      arrival,
      triggerReady,
      actorConstraintReady,
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
    // Best effort only.
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

function Invoke-Probe(
    [string]$DatabaseUrl,
    [string]$ExpectedHost,
    [string]$Label,
    [int]$MaxAttempts = 4
) {
    $OldDb = [Environment]::GetEnvironmentVariable("CASA_STAGE_PROMOTION_DB_URL", "Process")
    $OldHost = [Environment]::GetEnvironmentVariable("CASA_STAGE_PROMOTION_EXPECTED_HOST", "Process")
    $OldLabel = [Environment]::GetEnvironmentVariable("CASA_STAGE_PROMOTION_LABEL", "Process")

    try {
        $env:CASA_STAGE_PROMOTION_DB_URL = $DatabaseUrl
        $env:CASA_STAGE_PROMOTION_EXPECTED_HOST = $ExpectedHost
        $env:CASA_STAGE_PROMOTION_LABEL = $Label

        for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
            $Previous = $ErrorActionPreference

            try {
                $ErrorActionPreference = "Continue"
                $Output = @(& node.exe $ProbePath 2>&1)
                $ExitCode = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $Previous
            }

            $Lines = @(
                $Output |
                    ForEach-Object { [string]$_ } |
                    Where-Object {
                        -not [string]::IsNullOrWhiteSpace($_)
                    }
            )

            if ($ExitCode -eq 0) {
                if ($Lines.Count -eq 0) {
                    Stop-Phase "$Label probe returned no output."
                }

                try {
                    return ($Lines[-1] | ConvertFrom-Json)
                }
                catch {
                    $Lines | ForEach-Object { Write-Host $_ }
                    Stop-Phase "$Label probe returned invalid JSON."
                }
            }

            Write-Host "  $Label read-only probe attempt ${Attempt}/${MaxAttempts}: FAILED"

            if ($Attempt -lt $MaxAttempts) {
                $Delay = $Attempt * 2
                Write-Host "    retrying after ${Delay}s..."
                Start-Sleep -Seconds $Delay
            }
            else {
                Write-Host "  $Label final safe error:"
                $Lines |
                    Select-Object -Last 40 |
                    ForEach-Object { Write-Host "    $_" }

                Stop-Phase "$Label read-only probe failed after $MaxAttempts attempts."
            }
        }
    }
    finally {
        if ($null -ne $OldDb) {
            $env:CASA_STAGE_PROMOTION_DB_URL = $OldDb
        }
        else {
            Remove-Item Env:CASA_STAGE_PROMOTION_DB_URL -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldHost) {
            $env:CASA_STAGE_PROMOTION_EXPECTED_HOST = $OldHost
        }
        else {
            Remove-Item Env:CASA_STAGE_PROMOTION_EXPECTED_HOST -ErrorAction SilentlyContinue
        }

        if ($null -ne $OldLabel) {
            $env:CASA_STAGE_PROMOTION_LABEL = $OldLabel
        }
        else {
            Remove-Item Env:CASA_STAGE_PROMOTION_LABEL -ErrorAction SilentlyContinue
        }
    }
}

function Assert-ExactPrefix(
    [object]$State,
    [object[]]$LocalManifest,
    [int]$ExpectedCount,
    [string]$Label
) {
    if ([int]$State.appliedMigrations -ne $ExpectedCount) {
        Stop-Phase "$Label migration count is $($State.appliedMigrations); expected $ExpectedCount."
    }

    $Rows = @($State.migrations)

    if ($Rows.Count -ne $ExpectedCount) {
        Stop-Phase "$Label migration history cardinality mismatch."
    }

    for ($Index = 0; $Index -lt $ExpectedCount; $Index++) {
        $Actual = [string]$Rows[$Index].hash
        $Expected = [string]$LocalManifest[$Index].hash

        if ($Actual.ToLowerInvariant() -ne $Expected.ToLowerInvariant()) {
            Stop-Phase "$Label migration history diverges at position $($Index + 1)."
        }
    }
}

function Assert-OriginalRowCountsUnchanged(
    [object]$BeforeCounts,
    [object]$AfterCounts,
    [string]$Label
) {
    foreach ($Property in $BeforeCounts.PSObject.Properties) {
        $Name = [string]$Property.Name
        $Before = [int]$Property.Value
        $AfterProperty = $AfterCounts.PSObject.Properties[$Name]

        if ($null -eq $AfterProperty) {
            Stop-Phase "$Label lost pre-existing table '$Name'."
        }

        $After = [int]$AfterProperty.Value

        if ($After -ne $Before) {
            Stop-Phase "$Label changed row count for pre-existing table '$Name': before=$Before after=$After."
        }
    }
}

function Assert-StageSemantics(
    [object]$State,
    [int]$Stage,
    [string]$Label
) {
    if ($Stage -ge 22) {
        if (-not [bool]$State.keyTables.school_attendance_lifecycles) {
            Stop-Phase "$Label stage >=22 but school_attendance_lifecycles is missing."
        }
    }

    if ($Stage -ge 27) {
        if (-not [bool]$State.keyTables.attendance_session_events) {
            Stop-Phase "$Label stage >=27 but attendance_session_events is missing."
        }
    }

    if ($Stage -ge 28) {
        if (-not [bool]$State.keyTables.attendance_session_policy_rebinds) {
            Stop-Phase "$Label stage >=28 but attendance_session_policy_rebinds is missing."
        }
    }

    if ($Stage -lt 29) {
        $IdentityStatus = @($State.enums.identityStatus)
        $LifecycleEvents = @($State.enums.lifecycleEvent)

        if ($IdentityStatus -contains "READY_FOR_ACTIVATION") {
            Stop-Phase "$Label has Pass A identity status enum before migration 29."
        }

        if ($LifecycleEvents -contains "RESUME_SCHEDULED") {
            Stop-Phase "$Label has Pass A lifecycle enum before migration 29."
        }
    }

    if ($Stage -ge 29) {
        $IdentityStatus = @($State.enums.identityStatus)
        $IdentityEvent = @($State.enums.identityEvent)
        $LifecycleEvent = @($State.enums.lifecycleEvent)

        foreach ($Required in @("READY_FOR_ACTIVATION")) {
            if ($IdentityStatus -notcontains $Required) {
                Stop-Phase "$Label migration 29 enum expansion is missing $Required."
            }
        }

        foreach ($Required in @("ACTIVATED")) {
            if ($IdentityEvent -notcontains $Required) {
                Stop-Phase "$Label migration 29 event enum expansion is missing $Required."
            }
        }

        foreach ($Required in @("RESUME_SCHEDULED","RESUME_SCHEDULE_CANCELLED")) {
            if ($LifecycleEvent -notcontains $Required) {
                Stop-Phase "$Label migration 29 lifecycle enum expansion is missing $Required."
            }
        }
    }

    if ($Stage -ge 30) {
        foreach ($Field in @(
            "scheduled_resume_at",
            "scheduled_resume_by_membership_id",
            "scheduled_resume_reason",
            "lifecycle_event_scheduled_for",
            "arrival_internal_actor",
            "identity_status_default_ready"
        )) {
            if (-not [bool]$State.structural.$Field) {
                Stop-Phase "$Label migration 30 structural invariant '$Field' is missing."
            }
        }

        if (-not [bool]$State.keyTables.student_first_card_attendance_exceptions) {
            Stop-Phase "$Label migration 30 first-card exception table is missing."
        }

        if (-not [bool]$State.keyTables.student_supervised_late_arrivals) {
            Stop-Phase "$Label migration 30 supervised-late-arrival table is missing."
        }

        if (-not [bool]$State.triggerReady) {
            Stop-Phase "$Label migration 30 future exact-one arrival actor trigger/function is incomplete."
        }

        if (-not [bool]$State.actorConstraintReady) {
            Stop-Phase "$Label migration 30 legacy-compatible arrival actor constraint is incomplete."
        }

        if ($null -ne $State.arrival.dual -and [int]$State.arrival.dual -ne 0) {
            Stop-Phase "$Label contains dual-attributed arrival assignments."
        }
    }
}

function Test-PendingMigrationSqlSafety(
    [object[]]$LocalManifest,
    [int]$FromExclusive,
    [int]$ToInclusive
) {
    $ScannerPath = Join-Path $Evidence "pending-migration-sql-safety.mjs"

    $Code = @'
import fs from "node:fs";

const paths =
  process.argv.slice(2);

function stripCommentsAndStrings(
  sql,
) {
  let out = "";
  let i = 0;

  while (
    i <
    sql.length
  ) {
    if (
      sql[i] === "-" &&
      sql[i + 1] === "-"
    ) {
      while (
        i < sql.length &&
        sql[i] !== "\n"
      ) {
        out += " ";
        i++;
      }

      continue;
    }

    if (
      sql[i] === "/" &&
      sql[i + 1] === "*"
    ) {
      out += "  ";
      i += 2;

      while (
        i < sql.length &&
        !(
          sql[i] === "*" &&
          sql[i + 1] === "/"
        )
      ) {
        out +=
          sql[i] === "\n"
            ? "\n"
            : " ";
        i++;
      }

      if (
        i <
        sql.length
      ) {
        out += "  ";
        i += 2;
      }

      continue;
    }

    if (
      sql[i] === "'"
    ) {
      out += " ";
      i++;

      while (
        i <
        sql.length
      ) {
        if (
          sql[i] === "'" &&
          sql[i + 1] === "'"
        ) {
          out += "  ";
          i += 2;
          continue;
        }

        if (
          sql[i] === "'"
        ) {
          out += " ";
          i++;
          break;
        }

        out +=
          sql[i] === "\n"
            ? "\n"
            : " ";
        i++;
      }

      continue;
    }

    if (
      sql[i] === '"'
    ) {
      out += " ";
      i++;

      while (
        i <
        sql.length
      ) {
        if (
          sql[i] === '"' &&
          sql[i + 1] === '"'
        ) {
          out += "  ";
          i += 2;
          continue;
        }

        if (
          sql[i] === '"'
        ) {
          out += " ";
          i++;
          break;
        }

        out +=
          sql[i] === "\n"
            ? "\n"
            : " ";
        i++;
      }

      continue;
    }

    out +=
      sql[i];

    i++;
  }

  return out;
}

const forbidden = [
  [/\bINSERT\s+INTO\b/i, "INSERT INTO"],
  [/\bUPDATE\b/i, "UPDATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bCOPY\b/i, "COPY"],
  [/\bMERGE\b/i, "MERGE"],
  [/\bDROP\s+TABLE\b/i, "DROP TABLE"],
  [/\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
];

const findings = [];

for (
  const path of
  paths
) {
  const raw =
    fs.readFileSync(
      path,
      "utf8",
    );

  const normalized =
    stripCommentsAndStrings(
      raw,
    );

  for (
    const [
      regex,
      label,
    ] of
    forbidden
  ) {
    if (
      regex.test(
        normalized,
      )
    ) {
      findings.push({
        path,
        label,
      });
    }
  }
}

if (
  findings.length >
  0
) {
  console.error(
    JSON.stringify(
      findings,
      null,
      2,
    ),
  );

  process.exit(2);
}

console.log(
  JSON.stringify({
    checked:
      paths.length,
    explicitDataDml:
      false,
    destructiveDropTableOrColumn:
      false,
  }),
);
'@

    [System.IO.File]::WriteAllText(
        $ScannerPath,
        $Code,
        $Utf8NoBom
    )

    $Targets = @(
        $LocalManifest |
            Where-Object {
                [int]$_.position -gt $FromExclusive -and
                [int]$_.position -le $ToInclusive
            } |
            ForEach-Object {
                [string]$_.path
            }
    )

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $Output = @(& node.exe $ScannerPath @Targets 2>&1)
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($ExitCode -ne 0) {
        $Output | ForEach-Object { Write-Host $_ }
        Stop-Phase "Pending migration SQL safety scan found explicit DML or destructive table/column removal. No Staging write was attempted."
    }

    $Output |
        Select-Object -Last 1 |
        ForEach-Object {
            Write-Host "  migration SQL safety: $_"
        }
}

function Copy-MigrationSet(
    [object[]]$LocalManifest,
    [int]$Count,
    [string]$Destination
) {
    New-Item `
        -ItemType Directory `
        -Path $Destination `
        -Force |
        Out-Null

    foreach ($Migration in @($LocalManifest | Select-Object -First $Count)) {
        $SourceDirectory = Split-Path -Parent ([string]$Migration.path)
        $TargetDirectory = Join-Path $Destination ([string]$Migration.folder)

        Copy-Item `
            -LiteralPath $SourceDirectory `
            -Destination $TargetDirectory `
            -Recurse `
            -Force
    }
}

function New-IsolatedMigrationConfig(
    [string]$ConfigPath,
    [string]$MigrationOut
) {
    if ($MigrationOut.Contains('"')) {
        Stop-Phase "Temporary migration path contains an unsupported quote character."
    }

    $Out = $MigrationOut -replace "\\","/"

    $Content = @"
import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not configured.",
  );
}

const parsed =
  new URL(
    databaseUrl,
  );

if (
  parsed.hostname.toLowerCase() !==
  "$ExpectedStagingHost"
) {
  throw new Error(
    "STAGING HOST GUARD FAILED. Expected $ExpectedStagingHost; found " +
    parsed.hostname,
  );
}

export default defineConfig({
  out:
    "$Out",
  dialect:
    "postgresql",
  migrations: {
    table:
      "__drizzle_migrations",
    schema:
      "drizzle",
  },
  dbCredentials: {
    url:
      databaseUrl,
  },
});
"@

    [System.IO.File]::WriteAllText(
        $ConfigPath,
        $Content,
        $Utf8NoBom
    )
}

function Invoke-DrizzleMigrate(
    [string]$Label,
    [string]$ConfigPath
) {
    if ($env:DATABASE_URL -ne $StagingDatabaseUrl) {
        Stop-Phase "DATABASE_URL is not locked to authorized Staging before $Label."
    }

    $Stdout = Join-Path $Evidence (($Label -replace '[^A-Za-z0-9_-]','_') + ".stdout.log")
    $Stderr = Join-Path $Evidence (($Label -replace '[^A-Za-z0-9_-]','_') + ".stderr.log")

    $Process = Start-Process `
        -FilePath "npx.cmd" `
        -ArgumentList @(
            "drizzle-kit",
            "migrate",
            "--config",
            $ConfigPath
        ) `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $Stdout `
        -RedirectStandardError $Stderr `
        -PassThru `
        -Wait `
        -WindowStyle Hidden

    if (Test-Path -LiteralPath $Stdout -PathType Leaf) {
        Get-Content -LiteralPath $Stdout |
            ForEach-Object { Write-Host $_ }
    }

    if (Test-Path -LiteralPath $Stderr -PathType Leaf) {
        $ErrorLines = @(
            Get-Content `
                -LiteralPath $Stderr `
                -ErrorAction SilentlyContinue |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace([string]$_)
                }
        )

        if ($ErrorLines.Count -gt 0) {
            $ErrorLines |
                ForEach-Object {
                    Write-Host $_
                }
        }
    }

    if ($Process.ExitCode -ne 0) {
        throw "$Label failed with exit code $($Process.ExitCode)."
    }
}

Write-Host "CASA School - Guarded Staging Full-Prefix Promotion 16 to 30 V1" -ForegroundColor Green
Write-Host "Promotes the exact verified Staging prefix from migration 16 to Development migration 30."
Write-Host "Migrations 17-28 are advanced first; migration 29 and migration 30 are committed in separate invocations."
Write-Host "Requires the completed Development Scanner face/liveness GREEN gate and the exact Staging truth-probe evidence."
Write-Host "No source generation. Development is read-only. No AWS mutation. Production is never read or connected."

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Phase "CASA repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Locking exact current source and migration authority"

    $Branch = (& git branch --show-current).Trim()
    $Head = (& git rev-parse --short HEAD).Trim()

    if ($Branch -ne $ExpectedBranch -or $Head -ne $ExpectedHead) {
        Stop-Phase "Git checkpoint drift: $Branch/$Head"
    }

    Assert-Hash "package.json" $PackageJsonHash
    Assert-Hash "package-lock.json" $PackageLockHash
    Assert-Hash "drizzle.config.ts" $DrizzleConfigHash

    Assert-Hash "src/app/scanner/scanner-client.tsx" $ScannerHash
    Assert-Hash "src/app/scanner/scanner.module.css" $ScannerCssHash
    Assert-Hash "src/app/scanner/scanner-install-control.tsx" $ScannerInstallControlHash
    Assert-Hash "src/server/biometrics/aws-liveness.ts" $AwsLivenessHash
    Assert-Hash "src/app/api/terminal/attempts/pending/route.ts" $PendingRouteHash
    Assert-Hash "scripts/scanner-pending-attempt-recovery-selftest.ts" $PendingRecoverySelftestHash

    Assert-Hash "src/server/school-operations/progression.ts" $ProgressionHash
    Assert-Hash "src/server/card-production/renewal-production.ts" $RenewalProductionHash
    Assert-Hash "src/server/card-production/render.ts" $RenderHash
    Assert-Hash "src/app/api/internal/card-production/templates/route.ts" $TemplateRouteHash
    Assert-Hash "src/app/schools/[slug]/registry/student-cards.tsx" $RegistryHash
    Assert-Hash "scripts/pass-a-selftest.ts" $PassASelftestHash

    $LocalManifest = @(Assert-Manifest)

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & git diff --check
        $DiffExit = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($DiffExit -ne 0) {
        Stop-Phase "git diff --check failed."
    }

    Write-Host "  branch/head:                   $Branch/$Head"
    Write-Host "  local migrations:              30 / EXACT HASH MANIFEST"
    Write-Host "  permanent-card source:         LOCKED / VERIFIED"
    Write-Host "  Scanner/AWS/pending recovery:  LOCKED / VERIFIED"
    Write-Host "  git diff --check:              PASS"

    Step "Re-proving completed Development Scanner and Staging truth gates"

    $LiveGatePath = Join-Path $ProjectRoot $LiveGateEvidenceRelative
    $TruthGatePath = Join-Path $ProjectRoot $TruthEvidenceRelative

    if (-not (Test-Path -LiteralPath $LiveGatePath -PathType Leaf)) {
        Stop-Phase "Required Development Scanner GREEN evidence is missing: $LiveGatePath"
    }

    if (-not (Test-Path -LiteralPath $TruthGatePath -PathType Leaf)) {
        Stop-Phase "Required Staging truth-probe evidence is missing: $TruthGatePath"
    }

    $LiveGate = Get-Content -LiteralPath $LiveGatePath -Raw | ConvertFrom-Json
    $TruthGate = Get-Content -LiteralPath $TruthGatePath -Raw | ConvertFrom-Json

    if (
        [string]$LiveGate.classification -ne "GREEN" -or
        [string]$LiveGate.targetAttempt -ne "caa12c89-a355-41eb-b387-8eed946cf3b5" -or
        -not [bool]$LiveGate.attemptPopulationUnchanged -or
        -not [bool]$LiveGate.olderDuplicateUnchanged -or
        -not [bool]$LiveGate.olderDuplicateSuppressedFromRecovery
    ) {
        Stop-Phase "Development Scanner face/liveness evidence is not the required GREEN acceptance proof."
    }

    if (
        [string]$TruthGate.classification -ne "STAGING_GENUINELY_BEHIND_MIGRATION_22" -or
        [int]$TruthGate.stagingAppliedMigrations -ne 16 -or
        -not [bool]$TruthGate.stagingHistoryPrefixMatch
    ) {
        Stop-Phase "Staging truth evidence is not the exact verified migration-16 prefix."
    }

    Write-Host "  Development Scanner live gate: GREEN / VERIFIED"
    Write-Host "  Staging truth gate:            16 / EXACT PREFIX / VERIFIED"

    Step "Running source gates before any Staging write"

    Invoke-NpmChecked "typecheck" @("run","typecheck")
    Invoke-NpmChecked "Scanner contract self-test" @("run","scanner:selftest")
    Invoke-NpmChecked "student-card cryptographic self-test" @("run","card:selftest")
    Invoke-NpxChecked "Pass A source contract self-test" @("tsx","scripts/pass-a-selftest.ts")
    Invoke-NpxChecked "pending-attempt recovery self-test" @("tsx","scripts/scanner-pending-attempt-recovery-selftest.ts")

    Step "Locking Development and Staging environment identities"

    $DevelopmentDatabaseUrl = Read-EnvValue (Join-Path $ProjectRoot ".env.local") "DATABASE_URL"
    $StagingDatabaseUrl = Read-EnvValue (Join-Path $ProjectRoot ".env.staging.local") "DATABASE_URL"

    try {
        $DevUri = [Uri]$DevelopmentDatabaseUrl
        $StageUri = [Uri]$StagingDatabaseUrl
    }
    catch {
        Stop-Phase "Development or Staging DATABASE_URL is invalid."
    }

    if ($DevUri.Host -ne $ExpectedDevelopmentHost) {
        Stop-Phase ".env.local is not authorized Development; found $($DevUri.Host)."
    }

    if ($StageUri.Host -ne $ExpectedStagingHost) {
        Stop-Phase ".env.staging.local is not authorized Staging; found $($StageUri.Host)."
    }

    if ($DevUri.Host -eq $StageUri.Host) {
        Stop-Phase "Development and Staging unexpectedly share a host."
    }

    $TrackedStageEnv = (& git ls-files -- ".env.staging.local" | Out-String).Trim()

    if (-not [string]::IsNullOrWhiteSpace($TrackedStageEnv)) {
        Stop-Phase ".env.staging.local is tracked by Git."
    }

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & git check-ignore --quiet -- ".env.staging.local"
        $IgnoreExit = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($IgnoreExit -ne 0) {
        Stop-Phase ".env.staging.local is not Git-ignored."
    }

    Write-Host "  Development:                   $ExpectedDevelopmentHost / VERIFIED"
    Write-Host "  Staging:                       $ExpectedStagingHost / VERIFIED"
    Write-Host "  .env.staging.local:            GIT-IGNORED"
    Write-Host "  Production:                    NOT READ / NOT CONNECTED"

    $RequiredNodeOptions = "--dns-result-order=ipv4first --no-network-family-autoselection"

    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
        $env:NODE_OPTIONS = $RequiredNodeOptions
    }
    else {
        if ($env:NODE_OPTIONS -notmatch "dns-result-order=ipv4first") {
            $env:NODE_OPTIONS += " --dns-result-order=ipv4first"
        }

        if ($env:NODE_OPTIONS -notmatch "no-network-family-autoselection") {
            $env:NODE_OPTIONS += " --no-network-family-autoselection"
        }
    }

    $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Evidence = Join-Path $ProjectRoot ".casa-backups\staging-full-prefix-16-to-30-v1-$Stamp"

    New-Item -ItemType Directory -Path $Evidence -Force | Out-Null

    $ProbePath = Join-Path $Evidence "staging-promotion-readonly-websocket.mjs"
    Write-ProbeScript $ProbePath

    Step "Re-proving Development 30/30 read-only authority"

    $DevelopmentBefore = Invoke-Probe $DevelopmentDatabaseUrl $ExpectedDevelopmentHost "Development"
    Assert-ExactPrefix $DevelopmentBefore $LocalManifest 30 "Development"
    Assert-StageSemantics $DevelopmentBefore 30 "Development"

    Write-Host "  Development migrations:       30 / EXACT"
    Write-Host "  Development Pass A semantics: VERIFIED"

    Step "Re-proving Staging is still exact migration 16 before mutation"

    $StagingBefore = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging preflight"
    Assert-ExactPrefix $StagingBefore $LocalManifest 16 "Staging preflight"
    Assert-StageSemantics $StagingBefore 16 "Staging preflight"

    if ([int]$StagingBefore.publicTableCount -ne 42) {
        Stop-Phase "Staging public-table count changed since the truth probe; expected 42, found $($StagingBefore.publicTableCount). Re-run the truth probe."
    }

    if ([bool]$StagingBefore.keyTables.school_attendance_lifecycles) {
        Stop-Phase "Staging migration-16 preflight unexpectedly already has the migration-22 lifecycle table."
    }

    $PreExistingCounts = $StagingBefore.rowCounts

    $StagingBefore |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "STAGING_BEFORE.json") `
            -Encoding UTF8

    Write-Host "  Staging migrations:           16 / EXACT PREFIX"
    Write-Host "  Staging public tables:        42 / VERIFIED"
    Write-Host "  pre-existing row counts:      SNAPSHOTTED"

    Step "Inspecting pending migrations 17-30 for explicit DML/destructive table-column removal"

    Test-PendingMigrationSqlSafety $LocalManifest 16 30

    Write-Host "  pending migrations:           14"
    Write-Host "  explicit INSERT/UPDATE/DELETE/TRUNCATE/COPY/MERGE: NONE"
    Write-Host "  DROP TABLE / DROP COLUMN:     NONE"

    Write-Host ""
    Write-Host "================ CASA STAGING 16 -> 30 GATE ================" -ForegroundColor Yellow
    Write-Host "Target host:              $ExpectedStagingHost"
    Write-Host "Current exact prefix:     16"
    Write-Host "Target prefix:            30"
    Write-Host "Stage A:                  migrations 17-28"
    Write-Host "Stage B:                  migration 29 only"
    Write-Host "Stage C:                  migration 30 only"
    Write-Host "Pre-existing table rows:  must remain count-stable"
    Write-Host "Development:              read only"
    Write-Host "AWS:                      untouched"
    Write-Host "Production:               never connected"
    Write-Host ""

    $Confirmation = Read-Host "Type exactly 'APPLY CASA STAGING 16 TO 30' to continue"

    if ($Confirmation -ne "APPLY CASA STAGING 16 TO 30") {
        Stop-Phase "Confirmation phrase did not match. Staging was not mutated."
    }

    Step "Preparing isolated immutable migration prefixes"

    $Set28 = Join-Path $Evidence "isolated-drizzle-through-28"
    $Set29 = Join-Path $Evidence "isolated-drizzle-through-29"
    $Set30 = Join-Path $Evidence "isolated-drizzle-through-30"

    $Config28 = Join-Path $Evidence "drizzle-staging-through-28.config.ts"
    $Config29 = Join-Path $Evidence "drizzle-staging-through-29.config.ts"
    $Config30 = Join-Path $Evidence "drizzle-staging-through-30.config.ts"

    Copy-MigrationSet $LocalManifest 28 $Set28
    Copy-MigrationSet $LocalManifest 29 $Set29
    Copy-MigrationSet $LocalManifest 30 $Set30

    New-IsolatedMigrationConfig $Config28 $Set28
    New-IsolatedMigrationConfig $Config29 $Set29
    New-IsolatedMigrationConfig $Config30 $Set30

    # Re-lock source/migrations immediately before the first write.
    $LocalManifest = @(Assert-Manifest)
    Assert-Hash "src/app/scanner/scanner-client.tsx" $ScannerHash
    Assert-Hash "src/server/biometrics/aws-liveness.ts" $AwsLivenessHash
    Assert-Hash "src/app/api/terminal/attempts/pending/route.ts" $PendingRouteHash
    Assert-Hash "scripts/pass-a-selftest.ts" $PassASelftestHash

    [Environment]::SetEnvironmentVariable("DATABASE_URL", $StagingDatabaseUrl, "Process")
    $env:DATABASE_URL = $StagingDatabaseUrl

    Step "Applying exact Staging migrations 17-28"

    try {
        Invoke-DrizzleMigrate "staging_17_through_28" $Config28
    }
    catch {
        Write-Host ""
        Write-Host "==> Stage A failed; reading exact committed Staging boundary" -ForegroundColor Yellow

        try {
            $Recovery = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging Stage-A recovery"
            Write-Host "  committed migrations after failure: $($Recovery.appliedMigrations)"
            Assert-OriginalRowCountsUnchanged $PreExistingCounts $Recovery.rowCounts "Staging Stage-A recovery"
        }
        catch {
            Write-Host "  recovery proof failed: $($_.Exception.Message)"
        }

        throw
    }

    $Stage28 = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging after 28"
    Assert-ExactPrefix $Stage28 $LocalManifest 28 "Staging after 28"
    Assert-StageSemantics $Stage28 28 "Staging after 28"
    Assert-OriginalRowCountsUnchanged $PreExistingCounts $Stage28.rowCounts "Staging after 28"

    Write-Host "  Staging migrations:           28 / EXACT"
    Write-Host "  migration-22 lifecycle:       PRESENT"
    Write-Host "  migration-27 event stream:    PRESENT"
    Write-Host "  migration-28 policy rebind:   PRESENT"
    Write-Host "  pre-existing row counts:      UNCHANGED"

    Step "Applying Staging migration 29 ONLY"

    try {
        Invoke-DrizzleMigrate "staging_migration_29" $Config29
    }
    catch {
        Write-Host ""
        Write-Host "==> Migration 29 failed; proving migration 28 remains committed safe boundary" -ForegroundColor Yellow

        try {
            $Recovery = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging migration-29 recovery"
            Assert-ExactPrefix $Recovery $LocalManifest 28 "Staging migration-29 recovery"
            Assert-StageSemantics $Recovery 28 "Staging migration-29 recovery"
            Assert-OriginalRowCountsUnchanged $PreExistingCounts $Recovery.rowCounts "Staging migration-29 recovery"
            Write-Host "  committed boundary:           28 / VERIFIED"
        }
        catch {
            Write-Host "  recovery proof failed: $($_.Exception.Message)"
        }

        throw
    }

    $Stage29 = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging after 29"
    Assert-ExactPrefix $Stage29 $LocalManifest 29 "Staging after 29"
    Assert-StageSemantics $Stage29 29 "Staging after 29"
    Assert-OriginalRowCountsUnchanged $PreExistingCounts $Stage29.rowCounts "Staging after 29"

    Write-Host "  Staging migrations:           29 / EXACT"
    Write-Host "  Pass A enum expansion:        VERIFIED"
    Write-Host "  pre-existing row counts:      UNCHANGED"

    Step "Applying Staging migration 30 ONLY"

    $ArrivalBefore30 = $Stage29.arrival

    try {
        Invoke-DrizzleMigrate "staging_migration_30" $Config30
    }
    catch {
        Write-Host ""
        Write-Host "==> Migration 30 failed; proving migration 29 remains committed safe boundary" -ForegroundColor Yellow

        try {
            $Recovery = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging migration-30 recovery"
            Assert-ExactPrefix $Recovery $LocalManifest 29 "Staging migration-30 recovery"
            Assert-StageSemantics $Recovery 29 "Staging migration-30 recovery"
            Assert-OriginalRowCountsUnchanged $PreExistingCounts $Recovery.rowCounts "Staging migration-30 recovery"
            Write-Host "  committed boundary:           29 / VERIFIED"
        }
        catch {
            Write-Host "  recovery proof failed: $($_.Exception.Message)"
        }

        throw
    }

    Step "Final read-only Staging migration-30 proof"

    $StagingAfter = Invoke-Probe $StagingDatabaseUrl $ExpectedStagingHost "Staging final"
    Assert-ExactPrefix $StagingAfter $LocalManifest 30 "Staging final"
    Assert-StageSemantics $StagingAfter 30 "Staging final"
    Assert-OriginalRowCountsUnchanged $PreExistingCounts $StagingAfter.rowCounts "Staging final"

    if (
        $null -ne $ArrivalBefore30.total -and
        [int]$StagingAfter.arrival.total -ne [int]$ArrivalBefore30.total
    ) {
        Stop-Phase "Migration 30 changed student_arrival_method_assignments row count."
    }

    if (
        $null -ne $ArrivalBefore30.actorless -and
        [int]$StagingAfter.arrival.actorless -ne [int]$ArrivalBefore30.actorless
    ) {
        Stop-Phase "Migration 30 changed historical unknown-actor arrival count."
    }

    if (
        $null -ne $StagingAfter.arrival.dual -and
        [int]$StagingAfter.arrival.dual -ne 0
    ) {
        Stop-Phase "Migration 30 produced dual-attributed arrival rows."
    }

    $StagingAfter |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "STAGING_AFTER.json") `
            -Encoding UTF8

    Step "Re-locking source after Staging promotion"

    $LocalManifest = @(Assert-Manifest)
    Assert-Hash "package.json" $PackageJsonHash
    Assert-Hash "package-lock.json" $PackageLockHash
    Assert-Hash "drizzle.config.ts" $DrizzleConfigHash
    Assert-Hash "src/app/scanner/scanner-client.tsx" $ScannerHash
    Assert-Hash "src/app/scanner/scanner.module.css" $ScannerCssHash
    Assert-Hash "src/server/biometrics/aws-liveness.ts" $AwsLivenessHash
    Assert-Hash "src/app/api/terminal/attempts/pending/route.ts" $PendingRouteHash
    Assert-Hash "scripts/scanner-pending-attempt-recovery-selftest.ts" $PendingRecoverySelftestHash
    Assert-Hash "src/server/school-operations/progression.ts" $ProgressionHash
    Assert-Hash "src/server/card-production/renewal-production.ts" $RenewalProductionHash
    Assert-Hash "src/server/card-production/render.ts" $RenderHash
    Assert-Hash "src/app/api/internal/card-production/templates/route.ts" $TemplateRouteHash
    Assert-Hash "src/app/schools/[slug]/registry/student-cards.tsx" $RegistryHash
    Assert-Hash "scripts/pass-a-selftest.ts" $PassASelftestHash

    $Previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & git diff --check
        $DiffExit = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $Previous
    }

    if ($DiffExit -ne 0) {
        Stop-Phase "git diff --check failed after Staging promotion."
    }

    $Result = [ordered]@{
        createdAt = (Get-Date -Format o)
        proof = "CASA_STAGING_FULL_PREFIX_16_TO_30_V1"
        classification = "GREEN"
        developmentMigrations = 30
        developmentMutation = $false
        stagingBefore = 16
        stagingAfter = 30
        migrationsApplied = 14
        stageA = "17-28_APPLIED_VERIFIED"
        stageB = "29_APPLIED_VERIFIED"
        stageC = "30_APPLIED_VERIFIED"
        migrationHistory = "EXACT_LOCAL_PREFIX_30"
        preExistingTableRowCountsUnchanged = $true
        explicitMigrationDmlDetected = $false
        destructiveTableColumnRemovalDetected = $false
        passAEnums = "VERIFIED"
        passAStructuralSchema = "VERIFIED"
        futureExactOneArrivalActorTrigger = "VERIFIED"
        sourceMutation = $false
        awsMutation = $false
        productionRead = $false
        productionConnected = $false
        productionMutation = $false
    }

    $Result |
        ConvertTo-Json -Depth 12 |
        Set-Content `
            -LiteralPath (Join-Path $Evidence "RESULT.json") `
            -Encoding UTF8

    Write-Host ""
    Write-Host "CASA STAGING FULL-PREFIX PROMOTION 16 -> 30 IS GREEN" -ForegroundColor Green
    Write-Host "  Development migrations:           30 / READ-ONLY VERIFIED"
    Write-Host "  Staging migrations before:        16 / EXACT"
    Write-Host "  Staging migrations after:         30 / EXACT"
    Write-Host "  migrations applied this run:      14"
    Write-Host "  migrations 17-28:                 APPLIED / VERIFIED"
    Write-Host "  migration 29 enum expansion:      APPLIED / VERIFIED"
    Write-Host "  migration 30 Pass A structure:    APPLIED / VERIFIED"
    Write-Host "  Pass A arrival actor enforcement: VERIFIED"
    Write-Host "  pre-existing table row counts:    UNCHANGED"
    Write-Host "  explicit migration DML:           NONE"
    Write-Host "  source mutation:                  NO"
    Write-Host "  AWS mutation:                     NO"
    Write-Host "  Production:                       NOT READ / NOT CONNECTED"
    Write-Host "  evidence:                         $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete GREEN output. Then we run Staging runtime/source verification; do not touch Production yet." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA STAGING FULL-PREFIX PROMOTION STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    throw
}
finally {
    if ($null -eq $OriginalDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
    else {
        [Environment]::SetEnvironmentVariable("DATABASE_URL", $OriginalDatabaseUrl, "Process")
        $env:DATABASE_URL = $OriginalDatabaseUrl
    }

    if ($null -eq $OriginalNodeOptions) {
        Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    }
    else {
        [Environment]::SetEnvironmentVariable("NODE_OPTIONS", $OriginalNodeOptions, "Process")
        $env:NODE_OPTIONS = $OriginalNodeOptions
    }
}
