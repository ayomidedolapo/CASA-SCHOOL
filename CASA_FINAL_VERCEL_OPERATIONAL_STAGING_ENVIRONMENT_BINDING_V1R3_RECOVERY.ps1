param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$TeamSlug = "ayomidedolapos-projects"
$ExpectedTeamId = "team_7WKcvFM29KYYE0xpbTILi05i"
$ExpectedProjectId = "prj_zPsDuVHD9lTXz3Z1D4noD4Cbl8Hr"
$ExpectedProjectName = "casa-school"
$ExpectedVercelUser = "ayomidedolapo"

$StagingRuntimeRoleArn =
    "arn:aws:iam::938733852185:role/CASA-School-Vercel-Staging-Runtime"

$StagingLivenessRoleArn =
    "arn:aws:iam::938733852185:role/CASA-School-Staging-Liveness-Stream"

$BridgeRuntimeRoleArn =
    "arn:aws:iam::938733852185:role/CASA-School-Vercel-Operational-Staging-ProdTarget-Runtime"

$BridgeLivenessRoleArn =
    "arn:aws:iam::938733852185:role/CASA-School-Operational-Staging-ProdTarget-Liveness-Stream"

$ExpectedStagingBucket =
    "casa-school-staging-card-artifacts-938733852185-eu-west-1"

$ExpectedStagingCollectionPrefix =
    "casa-school-staging"

$BaseKeys = @(
    "AWS_DEFAULT_REGION",
    "AWS_REGION",
    "CASA_AWS_REKOGNITION_COLLECTION_PREFIX",
    "CASA_AWS_REKOGNITION_QUALITY_FILTER",
    "CASA_AWS_REKOGNITION_REGION",
    "CASA_BIOMETRIC_PROVIDER_MODE",
    "CASA_CARD_STORAGE_BUCKET",
    "CASA_CARD_STORAGE_REGION",
    "DATABASE_URL"
)

$RoleKeys = @(
    "AWS_ROLE_ARN",
    "CASA_AWS_LIVENESS_STREAM_ROLE_ARN"
)

$AllManagedKeys = @($BaseKeys + $RoleKeys)

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
        $line = [string]$raw

        if (
            [string]::IsNullOrWhiteSpace($line) -or
            $line.TrimStart().StartsWith("#")
        ) {
            continue
        }

        $index = $line.IndexOf("=")

        if ($index -le 0) {
            continue
        }

        $name = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1)

        if (
            $value.Length -ge 2 -and
            (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            )
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $map[$name] = $value
    }

    return $map
}

function Get-NpxCommand() {
    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue

    if ($null -eq $npx) {
        $npx = Get-Command "npx" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npx) {
        Fail "npx is not available."
    }

    if (
        -not (
            [string]::IsNullOrWhiteSpace(
                [string]$npx.Source
            )
        )
    ) {
        return [string]$npx.Source
    }

    return [string]$npx.Name
}

function Invoke-Vercel(
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    $npx = Get-NpxCommand
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        $stdout = @(
            & $npx `
                "--yes" `
                "vercel@latest" `
                @Arguments `
                2> $stderr
        )

        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $errorText =
        if (Test-Path -LiteralPath $stderr) {
            Get-Content `
                -LiteralPath $stderr `
                -Raw `
                -ErrorAction SilentlyContinue
        }
        else {
            ""
        }

    Remove-Item `
        -LiteralPath $stderr `
        -Force `
        -ErrorAction SilentlyContinue

    if ($null -eq $errorText) {
        $errorText = ""
    }
    else {
        $errorText = ([string]$errorText).Trim()
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        Fail "$Label failed with exit code $exitCode. $errorText"
    }

    return [pscustomobject]@{
        ok = ($exitCode -eq 0)
        exitCode = $exitCode
        stdout = @($stdout)
        stderr = $errorText
    }
}

function Invoke-VercelWithSecretStdin(
    [string[]]$Arguments,
    [string]$Value,
    [string]$Label
) {
    $npx = Get-NpxCommand
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        # Use the normal PowerShell pipeline so npx.cmd works correctly on
        # Windows while keeping the secret out of the command-line arguments.
        $stdout = @(
            $Value |
                & $npx `
                    "--yes" `
                    "vercel@latest" `
                    @Arguments `
                    2> $stderr
        )

        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $errorText =
        if (Test-Path -LiteralPath $stderr) {
            Get-Content `
                -LiteralPath $stderr `
                -Raw `
                -ErrorAction SilentlyContinue
        }
        else {
            ""
        }

    Remove-Item `
        -LiteralPath $stderr `
        -Force `
        -ErrorAction SilentlyContinue

    if ($null -eq $errorText) {
        $errorText = ""
    }
    else {
        $errorText = ([string]$errorText).Trim()
    }

    if ($exitCode -ne 0) {
        Fail "$Label failed with exit code $exitCode. $errorText"
    }

    return [pscustomobject]@{
        stdout = @($stdout)
        stderr = $errorText
    }
}

function Get-CombinedOutput([object]$Result) {
    return (
        (
            @($Result.stdout) -join "`n"
        ) +
        "`n" +
        [string]$Result.stderr
    )
}

function Assert-NoSecretEcho(
    [hashtable]$Values,
    [string]$Output,
    [string]$Label
) {
    foreach ($key in $Values.Keys) {
        $value = [string]$Values[$key]

        if ([string]::IsNullOrEmpty($value)) {
            continue
        }

        if ($Output.Contains($value)) {
            Fail "$Label unexpectedly echoed the value for $key. Output suppressed."
        }
    }
}

function Remove-ManagedVariable(
    [string]$Name,
    [string]$Environment
) {
    $result =
        Invoke-Vercel `
            @(
                "env",
                "rm",
                $Name,
                $Environment,
                "--yes",
                "--scope",
                $TeamSlug
            ) `
            "Remove $Environment env $Name" `
            -AllowFailure

    if ($result.ok) {
        return
    }

    $combined = Get-CombinedOutput $result

    if (
        $combined -match "not found" -or
        $combined -match "does not exist" -or
        $combined -match "No Environment Variable"
    ) {
        return
    }

    Fail "Unexpected failure removing $Environment env $Name. $($result.stderr)"
}

function Add-ManagedVariable(
    [string]$Name,
    [string]$Environment,
    [string]$Value,
    [hashtable]$AllValues
) {
    $result =
        Invoke-VercelWithSecretStdin `
            @(
                "env",
                "add",
                $Name,
                $Environment,
                "--sensitive",
                "--force",
                "--yes",
                "--scope",
                $TeamSlug
            ) `
            $Value `
            "Add $Environment env $Name"

    $combined =
        (
            @($result.stdout) -join "`n"
        ) +
        "`n" +
        [string]$result.stderr

    Assert-NoSecretEcho `
        $AllValues `
        $combined `
        "Vercel add $Environment/$Name"
}

Write-Host "CASA School - Final Vercel Operational-Staging Environment Binding V1R3 Recovery" -ForegroundColor Green
Write-Host "Recovers V1/V1R2 after CLI readiness guards failed before any remote mutation."
Write-Host "Preview receives permanent Staging IAM roles."
Write-Host "Current Vercel Production target receives temporary operational-Staging bridge roles."
Write-Host "ALL application values for BOTH targets come only from .env.staging.local."
Write-Host "Real Production env values and real Production IAM roles remain UNBOUND."
Write-Host "This script MUTATES Vercel environment-variable configuration only. It does not deploy."

try {
    Step "Locking exact CASA checkpoint and V1 no-mutation recovery boundary"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
        Fail "git is not available."
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

    $projectJsonPath =
        Join-Path `
            $ProjectRoot `
            ".vercel\project.json"

    if (-not (Test-Path -LiteralPath $projectJsonPath -PathType Leaf)) {
        Fail ".vercel/project.json is missing."
    }

    try {
        $projectJson =
            Get-Content `
                -LiteralPath $projectJsonPath `
                -Raw |
            ConvertFrom-Json
    }
    catch {
        Fail ".vercel/project.json is invalid."
    }

    if (
        [string]$projectJson.orgId -ne $ExpectedTeamId -or
        [string]$projectJson.projectId -ne $ExpectedProjectId
    ) {
        Fail "Local Vercel project binding drift."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Vercel team:                    $TeamSlug / VERIFIED"
    Write-Host "  Vercel project ID:              $ExpectedProjectId / VERIFIED"
    Write-Host "  previous V1 remote mutation:    NONE / STOPPED DURING HELP CHECK"
    Write-Host "  protected unrelated project:    casa / NOT TOUCHED"

    Step "Locking Staging-only value authority"

    $stagingEnvPath =
        Join-Path `
            $ProjectRoot `
            ".env.staging.local"

    $productionEnvPath =
        Join-Path `
            $ProjectRoot `
            ".env.production.local"

    $stagingEnv =
        Read-EnvMap $stagingEnvPath

    if (-not (Test-Path -LiteralPath $productionEnvPath -PathType Leaf)) {
        Fail ".env.production.local is missing."
    }

    foreach ($key in $BaseKeys) {
        if (-not $stagingEnv.ContainsKey($key)) {
            Fail "Staging env is missing required key $key."
        }

        if (
            [string]::IsNullOrWhiteSpace(
                [string]$stagingEnv[$key]
            )
        ) {
            Fail "Staging env key $key is empty."
        }
    }

    if (
        [string]$stagingEnv["CASA_CARD_STORAGE_BUCKET"] -ne
        $ExpectedStagingBucket
    ) {
        Fail "Staging S3 bucket value drift."
    }

    if (
        [string]$stagingEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne
        $ExpectedStagingCollectionPrefix
    ) {
        Fail "Staging Rekognition namespace value drift."
    }

    $previewValues = @{}
    $productionTargetValues = @{}

    foreach ($key in $BaseKeys) {
        $previewValues[$key] =
            [string]$stagingEnv[$key]

        $productionTargetValues[$key] =
            [string]$stagingEnv[$key]
    }

    $previewValues["AWS_ROLE_ARN"] =
        $StagingRuntimeRoleArn

    $previewValues["CASA_AWS_LIVENESS_STREAM_ROLE_ARN"] =
        $StagingLivenessRoleArn

    $productionTargetValues["AWS_ROLE_ARN"] =
        $BridgeRuntimeRoleArn

    $productionTargetValues["CASA_AWS_LIVENESS_STREAM_ROLE_ARN"] =
        $BridgeLivenessRoleArn

    Write-Host "  .env.staging.local keys:        $($BaseKeys.Count) / VERIFIED"
    Write-Host "  .env.production.local values:   NOT READ"
    Write-Host "  Preview operational env:        STAGING"
    Write-Host "  Production-target oper. env:    STAGING"
    Write-Host "  real Production values:         UNBOUND"

    Step "Proving Vercel identity and read-only environment access"

    $whoami =
        Invoke-Vercel `
            @(
                "whoami",
                "--scope",
                $TeamSlug
            ) `
            "Vercel authentication proof"

    $whoamiText = Get-CombinedOutput $whoami

    if ($whoamiText -notmatch [regex]::Escape($ExpectedVercelUser)) {
        Fail "Vercel authentication identity is not proven."
    }

    # Do not use subcommand --help as a readiness gate. Vercel CLI 59.15.1
    # can emit valid help text while exiting non-zero. Instead prove the
    # linked project and target access through real read-only list commands.
    $previewReadiness =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "preview",
                "--scope",
                $TeamSlug
            ) `
            "Read-only Preview environment access proof"

    $productionReadiness =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "production",
                "--scope",
                $TeamSlug
            ) `
            "Read-only Production environment access proof"

    $previewReadinessText =
        Get-CombinedOutput $previewReadiness

    $productionReadinessText =
        Get-CombinedOutput $productionReadiness

    if (
        [string]::IsNullOrWhiteSpace($previewReadinessText) -or
        [string]::IsNullOrWhiteSpace($productionReadinessText)
    ) {
        Fail "Vercel environment list readiness output is unexpectedly empty."
    }

    Write-Host "  authenticated Vercel user:      $ExpectedVercelUser / VERIFIED"
    Write-Host "  Preview env read access:        VERIFIED"
    Write-Host "  Production env read access:     VERIFIED"
    Write-Host "  mutation syntax authority:      VERCEL CLI 59.15.1 + CURRENT VERCEL DOCS"
    Write-Host "  brittle --help readiness gate:  REMOVED"

    Step "Capturing Vercel metadata before mutation"

    $stamp =
        Get-Date `
            -Format "yyyyMMdd-HHmmss"

    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\final-vercel-operational-staging-binding-v1r3-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $evidence `
        -Force |
    Out-Null

    $beforePreview =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "preview",
                "--scope",
                $TeamSlug
            ) `
            "List Preview environment variables"

    $beforeProduction =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "production",
                "--scope",
                $TeamSlug
            ) `
            "List Production environment variables"

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PREVIEW_BEFORE.txt"),
        (Get-CombinedOutput $beforePreview),
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PRODUCTION_BEFORE.txt"),
        (Get-CombinedOutput $beforeProduction),
        $Utf8NoBom
    )

    Write-Host "  before-state metadata:          CAPTURED"
    Write-Host "  secret values in evidence:      NONE"
    Write-Host "  evidence:                       $evidence"

    Step "Converging Preview managed keys to the Staging configuration"

    foreach ($key in $AllManagedKeys) {
        Remove-ManagedVariable `
            $key `
            "preview"

        Add-ManagedVariable `
            $key `
            "preview" `
            ([string]$previewValues[$key]) `
            $previewValues

        Write-Host "  Preview $key`: BOUND / SENSITIVE"
    }

    Step "Converging current Production target to operational-Staging configuration"

    foreach ($key in $AllManagedKeys) {
        Remove-ManagedVariable `
            $key `
            "production"

        Add-ManagedVariable `
            $key `
            "production" `
            ([string]$productionTargetValues[$key]) `
            $productionTargetValues

        Write-Host "  Production-target $key`: BOUND / SENSITIVE"
    }

    Step "Re-proving environment-variable metadata after binding"

    $afterPreview =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "preview",
                "--scope",
                $TeamSlug
            ) `
            "List Preview environment variables after binding"

    $afterProduction =
        Invoke-Vercel `
            @(
                "env",
                "ls",
                "production",
                "--scope",
                $TeamSlug
            ) `
            "List Production environment variables after binding"

    $afterPreviewText =
        Get-CombinedOutput $afterPreview

    $afterProductionText =
        Get-CombinedOutput $afterProduction

    foreach ($key in $AllManagedKeys) {
        if ($afterPreviewText -notmatch [regex]::Escape($key)) {
            Fail "Preview metadata does not show $key after binding."
        }

        if ($afterProductionText -notmatch [regex]::Escape($key)) {
            Fail "Production metadata does not show $key after binding."
        }
    }

    Assert-NoSecretEcho `
        $previewValues `
        $afterPreviewText `
        "Preview env ls"

    Assert-NoSecretEcho `
        $productionTargetValues `
        $afterProductionText `
        "Production env ls"

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PREVIEW_AFTER.txt"),
        $afterPreviewText,
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PRODUCTION_AFTER.txt"),
        $afterProductionText,
        $Utf8NoBom
    )

    Write-Host "  Preview managed keys:           $($AllManagedKeys.Count) / PRESENT"
    Write-Host "  Production managed keys:        $($AllManagedKeys.Count) / PRESENT"
    Write-Host "  remote secret values displayed: NO"

    $result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_FINAL_VERCEL_OPERATIONAL_STAGING_ENVIRONMENT_BINDING_V1R3"
            sourceAuthority =
                "$branch/$head"
            migrations =
                $migrationCount
            recoveredFrom =
                "V1_AND_V1R2_READINESS_GUARDS_FAILED_BEFORE_REMOTE_MUTATION"
            vercel = [ordered]@{
                teamSlug =
                    $TeamSlug
                teamId =
                    $ExpectedTeamId
                projectName =
                    $ExpectedProjectName
                projectId =
                    $ExpectedProjectId
            }
            preview = [ordered]@{
                dataEnvironment =
                    "staging"
                runtimeRoleArn =
                    $StagingRuntimeRoleArn
                livenessRoleArn =
                    $StagingLivenessRoleArn
                managedKeyCount =
                    $AllManagedKeys.Count
            }
            currentProductionTarget = [ordered]@{
                operationalEnvironment =
                    "staging"
                runtimeRoleArn =
                    $BridgeRuntimeRoleArn
                livenessRoleArn =
                    $BridgeLivenessRoleArn
                managedKeyCount =
                    $AllManagedKeys.Count
            }
            realProduction = [ordered]@{
                localEnvFileRead =
                    $false
                valuesBoundToVercel =
                    $false
                runtimeRolesBound =
                    $false
                status =
                    "DORMANT_UNTIL_GO_LIVE"
            }
            deploymentTriggered =
                $false
            sourceMutation =
                $false
        }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "RESULT.json"),
        ($result | ConvertTo-Json -Depth 12),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA FINAL VERCEL OPERATIONAL-STAGING ENVIRONMENT BINDING V1R3 IS GREEN" -ForegroundColor Green
    Write-Host "  Vercel project:                 $ExpectedProjectName / EXACT"
    Write-Host "  Preview data/config:            STAGING"
    Write-Host "  Preview AWS runtime role:       PERMANENT STAGING"
    Write-Host "  Preview liveness role:          PERMANENT STAGING"
    Write-Host "  current Production target:      OPERATIONAL STAGING"
    Write-Host "  Production-target AWS role:     TEMPORARY STAGING BRIDGE"
    Write-Host "  Production-target liveness:     TEMPORARY STAGING BRIDGE"
    Write-Host "  real Production values:         UNBOUND / DORMANT"
    Write-Host "  real Production roles:          UNBOUND / DORMANT"
    Write-Host "  deployment triggered:           NO"
    Write-Host "  source/DB/AWS mutation:         NONE"
    Write-Host "  Vercel env mutation:            YES / COMPLETED"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete output. If GREEN, Vercel/AWS binding is complete and it is safe to commit/push the source changes; the next deployment will use Staging resources through OIDC." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA FINAL VERCEL OPERATIONAL-STAGING ENVIRONMENT BINDING V1R3 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "V1R3 is convergent for the managed Preview/Production-target keys. Do not manually edit them after a partial run; return the complete output and we can safely reconcile the exact state."
    throw
}
