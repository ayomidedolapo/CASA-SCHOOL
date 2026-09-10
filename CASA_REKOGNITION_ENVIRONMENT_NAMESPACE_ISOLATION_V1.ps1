param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$ExpectedStagingPrefix = "casa-school-staging"
$ExpectedProductionPrefix = "casa-school-production"

$RekognitionRelative = "src\server\biometrics\aws-rekognition.ts"
$HelperRelative = "src\server\aws\vercel-oidc-credentials.ts"
$PackageRelative = "package.json"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-EnvMap([string]$Path) {
    $map = @{}

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail "Required env file missing: $Path"
    }

    foreach ($raw in [System.IO.File]::ReadAllLines($Path)) {
        $line = ([string]$raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace($line) -or
            $line.StartsWith("#")
        ) {
            continue
        }

        $index = $line.IndexOf("=")

        if ($index -le 0) {
            continue
        }

        $name = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $map[$name] = $value
    }

    return $map
}

function Normalize-Newlines([string]$Text) {
    return (
        $Text.
            Replace("`r`n", "`n").
            Replace("`r", "`n")
    )
}

function Restore-Newlines(
    [string]$Text,
    [string]$Original
) {
    if ($Original.Contains("`r`n")) {
        return $Text.Replace("`n", "`r`n")
    }

    return $Text
}

function Invoke-CheckedNpm(
    [string[]]$Arguments,
    [string]$Label
) {
    $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue

    if ($null -eq $npm) {
        $npm = Get-Command "npm" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npm) {
        Fail "npm is not available."
    }

    $command =
        if (-not [string]::IsNullOrWhiteSpace([string]$npm.Source)) {
            [string]$npm.Source
        }
        else {
            [string]$npm.Name
        }

    & $command @Arguments

    if ($LASTEXITCODE -ne 0) {
        Fail "$Label failed with exit code $LASTEXITCODE."
    }
}

Write-Host "CASA School - Rekognition Environment Namespace Isolation V1" -ForegroundColor Green
Write-Host "Closes the remaining Staging/Production Rekognition namespace gap before Vercel OIDC IAM roles are created."
Write-Host "Vercel runtimes must use CASA_AWS_REKOGNITION_COLLECTION_PREFIX; local non-Vercel development preserves the legacy casa-school prefix."
Write-Host "No AWS IAM/S3/Rekognition mutation. No Vercel env mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking CASA checkpoint and already-wired OIDC source state"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    foreach ($command in @("git", "npm")) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            Fail "$command is not available."
        }
    }

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()

    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    $migrationCount =
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
        ).Count

    if ($migrationCount -ne $ExpectedMigrationCount) {
        Fail "Expected $ExpectedMigrationCount migrations; found $migrationCount."
    }

    $rekognitionPath = Join-Path $ProjectRoot $RekognitionRelative
    $helperPath = Join-Path $ProjectRoot $HelperRelative
    $packagePath = Join-Path $ProjectRoot $PackageRelative

    foreach ($path in @($rekognitionPath, $helperPath, $packagePath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Fail "Required source file missing: $path"
        }
    }

    $rekognition = [System.IO.File]::ReadAllText($rekognitionPath)
    $helper = [System.IO.File]::ReadAllText($helperPath)
    $package = [System.IO.File]::ReadAllText($packagePath)

    if (
        $rekognition -notmatch "getVercelOidcAwsCredentials" -or
        $rekognition -notmatch "new RekognitionClient" -or
        $rekognition -notmatch "new STSClient"
    ) {
        Fail "Expected V1R3 OIDC Rekognition/STS wiring is not present."
    }

    if (
        $helper -notmatch "@vercel/oidc-aws-credentials-provider" -or
        $helper -notmatch "sts\.amazonaws\.com" -or
        $helper -notmatch "AWS_ROLE_ARN"
    ) {
        Fail "Expected Vercel OIDC helper state is not present."
    }

    if (
        $package -notmatch '"@vercel/oidc-aws-credentials-provider"\s*:\s*"3\.3\.5"'
    ) {
        Fail "Expected exact OIDC package 3.3.5 is not present."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Vercel OIDC helper:             PRESENT / VERIFIED"
    Write-Host "  Rekognition + STS OIDC wiring:  PRESENT / VERIFIED"

    Step "Locking Staging/Production Rekognition prefix authority"

    $stagingEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.staging.local")

    $productionEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.production.local")

    if (
        -not $stagingEnv.ContainsKey("CASA_AWS_REKOGNITION_COLLECTION_PREFIX") -or
        [string]$stagingEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne
        $ExpectedStagingPrefix
    ) {
        Fail "Staging Rekognition collection prefix authority drift."
    }

    if (
        -not $productionEnv.ContainsKey("CASA_AWS_REKOGNITION_COLLECTION_PREFIX") -or
        [string]$productionEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne
        $ExpectedProductionPrefix
    ) {
        Fail "Production Rekognition collection prefix authority drift."
    }

    if ($ExpectedStagingPrefix -eq $ExpectedProductionPrefix) {
        Fail "Staging and Production Rekognition prefixes must differ."
    }

    Write-Host "  Staging collection prefix:      $ExpectedStagingPrefix / VERIFIED"
    Write-Host "  Production collection prefix:   $ExpectedProductionPrefix / VERIFIED"
    Write-Host "  namespace separation:           DISTINCT / VERIFIED"

    Step "Proving exact legacy hardcoded collection-ID preimage"

    $normalized = Normalize-Newlines $rekognition

    $oldFunction = @'
export function awsCollectionIdForSchool(
  schoolId: string,
): string {
  const compact =
    schoolId
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      );

  if (
    compact.length !== 32
  ) {
    throw new Error(
      "INVALID_SCHOOL_ID_FOR_AWS_COLLECTION",
    );
  }

  return `casa-school-${compact}`;
}
'@

    $oldFunction = Normalize-Newlines $oldFunction

    $first =
        $normalized.IndexOf(
            $oldFunction,
            [System.StringComparison]::Ordinal
        )

    if ($first -lt 0) {
        Fail "Exact legacy awsCollectionIdForSchool preimage not found."
    }

    $second =
        $normalized.IndexOf(
            $oldFunction,
            $first + $oldFunction.Length,
            [System.StringComparison]::Ordinal
        )

    if ($second -ge 0) {
        Fail "Legacy collection-ID preimage is not unique."
    }

    if ($normalized.Contains("CASA_AWS_REKOGNITION_COLLECTION_PREFIX")) {
        Fail "Collection-prefix source wiring already exists unexpectedly; refusing duplicate patch."
    }

    Write-Host "  hardcoded legacy prefix:         casa-school / EXACT PREIMAGE VERIFIED"
    Write-Host "  configured prefix currently used:NO / DEFECT CONFIRMED"

    Step "Creating rollback snapshot"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\rekognition-environment-namespace-isolation-v1-$stamp"

    New-Item -ItemType Directory -Path $backup -Force | Out-Null

    $backupFile = Join-Path $backup $RekognitionRelative
    New-Item `
        -ItemType Directory `
        -Path (Split-Path -Parent $backupFile) `
        -Force |
        Out-Null

    Copy-Item `
        -LiteralPath $rekognitionPath `
        -Destination $backupFile `
        -Force

    $preHash =
        (Get-FileHash -LiteralPath $rekognitionPath -Algorithm SHA256).
            Hash.
            ToLowerInvariant()

    Write-Host "  preimage SHA256:                $preHash"
    Write-Host "  backup:                         $backup"

    Step "Wiring environment-scoped Rekognition collection IDs"

    $newFunction = @'
function awsCollectionPrefix(): string {
  const configured =
    process.env
      .CASA_AWS_REKOGNITION_COLLECTION_PREFIX
      ?.trim();

  const prefix =
    configured ||
    (
      process.env.VERCEL === "1"
        ? undefined
        : "casa-school"
    );

  if (!prefix) {
    throw new Error(
      "CASA_AWS_REKOGNITION_COLLECTION_PREFIX is required on Vercel.",
    );
  }

  if (
    !/^[a-zA-Z0-9_.-]+$/.test(
      prefix,
    )
  ) {
    throw new Error(
      "AWS_BIOMETRIC_INVALID_COLLECTION_PREFIX",
    );
  }

  return prefix;
}

export function awsCollectionIdForSchool(
  schoolId: string,
): string {
  const compact =
    schoolId
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      );

  if (
    compact.length !== 32
  ) {
    throw new Error(
      "INVALID_SCHOOL_ID_FOR_AWS_COLLECTION",
    );
  }

  const collectionId =
    `${awsCollectionPrefix()}-${compact}`;

  if (
    collectionId.length > 255
  ) {
    throw new Error(
      "AWS_BIOMETRIC_COLLECTION_ID_TOO_LONG",
    );
  }

  return collectionId;
}
'@

    $newFunction = Normalize-Newlines $newFunction

    $patched =
        $normalized.Substring(0, $first) +
        $newFunction +
        $normalized.Substring($first + $oldFunction.Length)

    $patched =
        Restore-Newlines `
            $patched `
            $rekognition

    [System.IO.File]::WriteAllText(
        $rekognitionPath,
        $patched,
        $Utf8NoBom
    )

    Step "Verifying source postconditions"

    $post =
        [System.IO.File]::ReadAllText(
            $rekognitionPath
        )

    if (
        $post -notmatch "CASA_AWS_REKOGNITION_COLLECTION_PREFIX" -or
        $post -notmatch "awsCollectionPrefix" -or
        $post -notmatch "getVercelOidcAwsCredentials" -or
        $post -notmatch "CASA_AWS_LIVENESS_STREAM_ROLE_ARN"
    ) {
        Fail "Post-write Rekognition/OIDC/liveness invariants are incomplete."
    }

    if ($post -match 'return `casa-school-\$\{compact\}`;') {
        Fail "Legacy hardcoded collection-ID path still exists."
    }

    $postHash =
        (Get-FileHash -LiteralPath $rekognitionPath -Algorithm SHA256).
            Hash.
            ToLowerInvariant()

    Write-Host "  configured prefix source wiring:WIRED"
    Write-Host "  Vercel missing-prefix behavior: FAIL CLOSED"
    Write-Host "  local legacy dev prefix:        casa-school / PRESERVED"
    Write-Host "  OIDC credential wiring:         PRESERVED"
    Write-Host "  liveness stream-role path:      PRESERVED"
    Write-Host "  postimage SHA256:               $postHash"

    Step "Running TypeScript verification"

    Invoke-CheckedNpm @("run", "typecheck") "npm run typecheck"
    Write-Host "  typecheck:                      GREEN"

    Step "Running production build verification"

    Invoke-CheckedNpm @("run", "build") "npm run build"
    Write-Host "  production build:               GREEN"

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_REKOGNITION_ENVIRONMENT_NAMESPACE_ISOLATION_V1"
            sourceAuthorityBeforePatch = "$branch/$head"
            migrations = $migrationCount
            stagingPrefix = $ExpectedStagingPrefix
            productionPrefix = $ExpectedProductionPrefix
            localFallbackPrefix = "casa-school"
            preHash = $preHash
            postHash = $postHash
            validation = [ordered]@{
                typecheck = "GREEN"
                build = "GREEN"
                oidcWiringPreserved = $true
                livenessStreamRolePreserved = $true
                vercelMissingPrefixFailsClosed = $true
            }
            mutations = [ordered]@{
                source = $true
                awsIam = $false
                awsRekognition = $false
                awsS3 = $false
                vercelEnvironment = $false
                database = $false
                migration = $false
                deployment = $false
            }
        }

    [System.IO.File]::WriteAllText(
        (Join-Path $backup "RESULT.json"),
        ($result | ConvertTo-Json -Depth 10),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA REKOGNITION ENVIRONMENT NAMESPACE ISOLATION V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority before patch:  $branch/$head"
    Write-Host "  migrations:                     $migrationCount / UNCHANGED"
    Write-Host "  Staging namespace:              $ExpectedStagingPrefix / WIRED"
    Write-Host "  Production namespace:           $ExpectedProductionPrefix / WIRED"
    Write-Host "  local Development namespace:    casa-school / PRESERVED"
    Write-Host "  OIDC source wiring:             PRESERVED"
    Write-Host "  Face Liveness role path:        PRESERVED"
    Write-Host "  typecheck:                      GREEN"
    Write-Host "  production build:               GREEN"
    Write-Host "  AWS/Vercel/DB/deployment:       NONE"
    Write-Host "  rollback/evidence:              $backup"
    Write-Host ""
    Write-Host "NEXT: return this complete output. Then the Vercel Team OIDC provider and environment-specific AWS runtime roles can be created without cross-environment Rekognition access." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA REKOGNITION ENVIRONMENT NAMESPACE ISOLATION V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No AWS IAM/S3/Rekognition, Vercel environment, DB, migration, or deployment mutation was authorized by this installer."
    throw
}
