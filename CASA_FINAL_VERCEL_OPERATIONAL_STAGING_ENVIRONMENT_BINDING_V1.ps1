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

function Invoke-VercelWithStdin(
    [string[]]$Arguments,
    [string]$Value,
    [string]$Label
) {
    $npx = Get-NpxCommand

    $psi =
        New-Object `
            System.Diagnostics.ProcessStartInfo

    $psi.FileName = $npx
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = $ProjectRoot

    [void]$psi.ArgumentList.Add("--yes")
    [void]$psi.ArgumentList.Add("vercel@latest")

    foreach ($arg in $Arguments) {
        [void]$psi.ArgumentList.Add($arg)
    }

    $process =
        New-Object `
            System.Diagnostics.Process

    $process.StartInfo = $psi

    if (-not $process.Start()) {
        Fail "Unable to start Vercel CLI for $Label."
    }

    try {
        $process.StandardInput.Write($Value)
        $process.StandardInput.Write("`n")
        $process.StandardInput.Close()

        $stdout =
            $process.StandardOutput.ReadToEnd()

        $stderr =
            $process.StandardError.ReadToEnd()

        $process.WaitForExit()

        if ($process.ExitCode -ne 0) {
            Fail "$Label failed with exit code $($process.ExitCode). $($stderr.Trim())"
        }

        return [pscustomobject]@{
            stdout = $stdout
            stderr = $stderr
        }
    }
    finally {
        $process.Dispose()
    }
}

function Assert-SecretSafe(
    [hashtable]$Values,
    [string[]]$Outputs
) {
    foreach ($key in $Values.Keys) {
        $value = [string]$Values[$key]

        if ([string]::IsNullOrEmpty($value)) {
            continue
        }

        foreach ($output in $Outputs) {
            if (
                -not [string]::IsNullOrEmpty($output) -and
                $output.Contains($value)
            ) {
                Fail "Vercel CLI unexpectedly echoed the value for $key. Output suppressed."
            }
        }
    }
}

Write-Host "CASA School - Final Vercel Operational-Staging Environment Binding V1" -ForegroundColor Green
Write-Host "Binds Vercel Preview to permanent Staging IAM roles."
Write-Host "Binds the current Vercel Production target to temporary operational-Staging IAM bridge roles."
Write-Host "ALL non-role values for BOTH targets come only from .env.staging.local."
Write-Host "Real Production env values and real Production IAM roles remain UNBOUND."
Write-Host "This script MUTATES Vercel environment-variable configuration only. It does not deploy."

try {
    Step "Locking CASA source checkpoint and local Vercel project identity"

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
    Write-Host "  Preview data environment:       STAGING"
    Write-Host "  Production-target data env:     STAGING"
    Write-Host "  real Production values:         UNBOUND"

    Step "Self-checking current Vercel CLI environment mutation syntax"

    $whoami =
        Invoke-Vercel `
            @(
                "whoami",
                "--scope",
                $TeamSlug
            ) `
            "Vercel authentication proof"

    $whoamiText =
        (@($whoami.stdout) -join "`n").Trim()

    if (
        [string]::IsNullOrWhiteSpace($whoamiText) -or
        $whoamiText -notmatch "ayomidedolapo"
    ) {
        Fail "Vercel authentication identity is not proven."
    }

    $addHelp =
        Invoke-Vercel `
            @(
                "env",
                "add",
                "--help"
            ) `
            "Vercel env add help"

    $rmHelp =
        Invoke-Vercel `
            @(
                "env",
                "rm",
                "--help"
            ) `
            "Vercel env rm help"

    $addHelpText =
        (
            @($addHelp.stdout) -join "`n"
        ) +
        "`n" +
        $addHelp.stderr

    $rmHelpText =
        (
            @($rmHelp.stdout) -join "`n"
        ) +
        "`n" +
        $rmHelp.stderr

    foreach ($required in @(
        "--sensitive",
        "--force",
        "preview",
        "production"
    )) {
        if ($addHelpText -notmatch [regex]::Escape($required)) {
            Fail "Current Vercel CLI env add help does not prove required capability $required."
        }
    }

    if ($rmHelpText -notmatch [regex]::Escape("--yes")) {
        Fail "Current Vercel CLI env rm help does not prove --yes support."
    }

    Write-Host "  authenticated Vercel user:      ayomidedolapo / VERIFIED"
    Write-Host "  env add --sensitive:            SUPPORTED"
    Write-Host "  env add --force:                SUPPORTED"
    Write-Host "  preview/production targets:     SUPPORTED"
    Write-Host "  env rm --yes:                   SUPPORTED"

    Step "Creating Vercel-binding evidence snapshot before mutation"

    $stamp =
        Get-Date `
            -Format "yyyyMMdd-HHmmss"

    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\final-vercel-operational-staging-binding-v1-$stamp"

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
        (@($beforePreview.stdout) -join "`n"),
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PRODUCTION_BEFORE.txt"),
        (@($beforeProduction.stdout) -join "`n"),
        $Utf8NoBom
    )

    Write-Host "  before-state metadata:          CAPTURED"
    Write-Host "  secret values in evidence:      NONE"
    Write-Host "  evidence:                       $evidence"

    Step "Removing managed keys from Preview scope"

    foreach ($key in $AllManagedKeys) {
        $result =
            Invoke-Vercel `
                @(
                    "env",
                    "rm",
                    $key,
                    "preview",
                    "--yes",
                    "--scope",
                    $TeamSlug
                ) `
                "Remove Preview env $key" `
                -AllowFailure

        if (-not $result.ok) {
            $combined =
                (
                    @($result.stdout) -join "`n"
                ) +
                "`n" +
                $result.stderr

            if (
                $combined -notmatch "not found" -and
                $combined -notmatch "does not exist" -and
                $combined -notmatch "No Environment Variable"
            ) {
                Fail "Unexpected failure removing Preview env $key. $($result.stderr)"
            }
        }

        Write-Host "  Preview $key`: cleared"
    }

    Step "Removing managed keys from current Production target"

    foreach ($key in $AllManagedKeys) {
        $result =
            Invoke-Vercel `
                @(
                    "env",
                    "rm",
                    $key,
                    "production",
                    "--yes",
                    "--scope",
                    $TeamSlug
                ) `
                "Remove Production env $key" `
                -AllowFailure

        if (-not $result.ok) {
            $combined =
                (
                    @($result.stdout) -join "`n"
                ) +
                "`n" +
                $result.stderr

            if (
                $combined -notmatch "not found" -and
                $combined -notmatch "does not exist" -and
                $combined -notmatch "No Environment Variable"
            ) {
                Fail "Unexpected failure removing Production env $key. $($result.stderr)"
            }
        }

        Write-Host "  Production-target $key`: cleared"
    }

    Step "Binding Preview to permanent Staging values and roles"

    foreach ($key in $AllManagedKeys) {
        $value =
            [string]$previewValues[$key]

        $result =
            Invoke-VercelWithStdin `
                @(
                    "env",
                    "add",
                    $key,
                    "preview",
                    "--sensitive",
                    "--force",
                    "--scope",
                    $TeamSlug
                ) `
                $value `
                "Add Preview env $key"

        Assert-SecretSafe `
            $previewValues `
            @(
                [string]$result.stdout,
                [string]$result.stderr
            )

        Write-Host "  Preview $key`: BOUND / SENSITIVE"
    }

    Step "Binding current Production target to operational-Staging values and bridge roles"

    foreach ($key in $AllManagedKeys) {
        $value =
            [string]$productionTargetValues[$key]

        $result =
            Invoke-VercelWithStdin `
                @(
                    "env",
                    "add",
                    $key,
                    "production",
                    "--sensitive",
                    "--force",
                    "--scope",
                    $TeamSlug
                ) `
                $value `
                "Add Production env $key"

        Assert-SecretSafe `
            $productionTargetValues `
            @(
                [string]$result.stdout,
                [string]$result.stderr
            )

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
        (
            @($afterPreview.stdout) -join "`n"
        ) +
        "`n" +
        $afterPreview.stderr

    $afterProductionText =
        (
            @($afterProduction.stdout) -join "`n"
        ) +
        "`n" +
        $afterProduction.stderr

    foreach ($key in $AllManagedKeys) {
        if ($afterPreviewText -notmatch [regex]::Escape($key)) {
            Fail "Preview metadata does not show $key after binding."
        }

        if ($afterProductionText -notmatch [regex]::Escape($key)) {
            Fail "Production metadata does not show $key after binding."
        }
    }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PREVIEW_AFTER.txt"),
        (@($afterPreview.stdout) -join "`n"),
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "PRODUCTION_AFTER.txt"),
        (@($afterProduction.stdout) -join "`n"),
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
                "CASA_FINAL_VERCEL_OPERATIONAL_STAGING_ENVIRONMENT_BINDING_V1"
            sourceAuthority =
                "$branch/$head"
            migrations =
                $migrationCount
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
    Write-Host "CASA FINAL VERCEL OPERATIONAL-STAGING ENVIRONMENT BINDING V1 IS GREEN" -ForegroundColor Green
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
    Write-Host "NEXT: return this complete output. If GREEN, the binding is finished and it is safe to commit/push the source changes; the resulting deployment will use Staging resources through OIDC." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA FINAL VERCEL OPERATIONAL-STAGING ENVIRONMENT BINDING V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Do not manually edit Vercel env variables after a partial run. Return the complete output so the exact remote partial state can be reconciled safely."
    throw
}
