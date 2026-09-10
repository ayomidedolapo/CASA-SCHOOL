param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$AwsProfile = "casa-dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30

$ExpectedVercelUser = "ayomidedolapo"
$ExpectedTeamSlug = "ayomidedolapos-projects"
$ExpectedTeamId = "team_7WKcvFM29KYYE0xpbTILi05i"
$ExpectedProjectName = "casa-school"
$ExpectedProjectId = "prj_zPsDuVHD9lTXz3Z1D4noD4Cbl8Hr"

$ProtectedOtherCasaProjectId = "prj_ttIrmj3X5fcOzYNBVmiiq2hZc5W9"

$ExpectedAwsAccount = "938733852185"
$AwsRegion = "eu-west-1"

$StaticAwsCredentialKeys = @(
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN"
)

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$script:VercelRunnerCommand = $null
$script:VercelRunnerPrefix = @()
$script:VercelRunnerMode = $null

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

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
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

        if ($map.ContainsKey($name)) {
            Fail "Duplicate env key $name in $Path"
        }

        $map[$name] = $value
    }

    return $map
}

function Invoke-Native(
    [string]$Command,
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $stdout = @(& $Command @Arguments 2> $stderr)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $rawError =
        if (Test-Path -LiteralPath $stderr) {
            Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        }
        else {
            $null
        }

    $errorText =
        if ($null -eq $rawError) {
            ""
        }
        else {
            ([string]$rawError).Trim()
        }

    Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue

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

function Resolve-VercelRunner {
    $direct = Get-Command "vercel.cmd" -ErrorAction SilentlyContinue
    if ($null -eq $direct) {
        $direct = Get-Command "vercel" -ErrorAction SilentlyContinue
    }

    if ($null -ne $direct) {
        $script:VercelRunnerCommand =
            if (-not [string]::IsNullOrWhiteSpace([string]$direct.Source)) {
                [string]$direct.Source
            }
            else {
                [string]$direct.Name
            }

        $script:VercelRunnerPrefix = @()
        $script:VercelRunnerMode = "DIRECT"
        return
    }

    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
    if ($null -eq $npx) {
        $npx = Get-Command "npx" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npx) {
        Fail "Neither Vercel CLI nor npx is available."
    }

    $script:VercelRunnerCommand =
        if (-not [string]::IsNullOrWhiteSpace([string]$npx.Source)) {
            [string]$npx.Source
        }
        else {
            [string]$npx.Name
        }

    $script:VercelRunnerPrefix = @("--yes", "vercel@latest")
    $script:VercelRunnerMode = "NPX_TRANSIENT"
}

function Invoke-Vercel(
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    if ([string]::IsNullOrWhiteSpace([string]$script:VercelRunnerCommand)) {
        Fail "Vercel runner has not been resolved."
    }

    $allArguments = @(@($script:VercelRunnerPrefix) + @($Arguments))

    if ($AllowFailure) {
        return Invoke-Native $script:VercelRunnerCommand $allArguments $Label -AllowFailure
    }

    return Invoke-Native $script:VercelRunnerCommand $allArguments $Label
}

function Parse-JsonResult([object]$Result, [string]$Label) {
    $text = (@($Result.stdout) -join "`n").Trim()

    if ([string]::IsNullOrWhiteSpace($text)) {
        Fail "$Label returned no JSON."
    }

    try {
        return ($text | ConvertFrom-Json)
    }
    catch {
        Fail "$Label returned invalid JSON."
    }
}

function As-Array([object]$Value) {
    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Array]) {
        return @($Value)
    }

    return @($Value)
}

function Get-PropertyString(
    [object]$Object,
    [string[]]$Names
) {
    if ($null -eq $Object) {
        return $null
    }

    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]

        if ($null -ne $property -and $null -ne $property.Value) {
            $value = ([string]$property.Value).Trim()

            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
        }
    }

    return $null
}

function Get-PropertyValue(
    [object]$Object,
    [string[]]$Names
) {
    if ($null -eq $Object) {
        return $null
    }

    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property) {
            return $property.Value
        }
    }

    return $null
}

function Normalize-StringArray([object]$Value) {
    if ($null -eq $Value) {
        return @()
    }

    $result = @()

    foreach ($item in @(As-Array $Value)) {
        if ($null -eq $item) {
            continue
        }

        $text = ([string]$item).Trim()
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            $result += $text
        }
    }

    return @($result)
}

function Extract-EnvironmentVariables([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Array]) {
        return @($Json)
    }

    foreach ($property in @(
        "envs",
        "environmentVariables",
        "items",
        "data"
    )) {
        if ($null -ne $Json.PSObject.Properties[$property]) {
            return @(As-Array $Json.$property)
        }
    }

    return @()
}

function Has-Target(
    [object]$Entry,
    [string]$Target
) {
    $targets =
        Normalize-StringArray `
            (Get-PropertyValue $Entry @("target", "targets"))

    foreach ($value in $targets) {
        if ([string]$value -ieq $Target) {
            return $true
        }
    }

    return $false
}

Write-Host "CASA School - Vercel Preview/Production Environment Scope Audit V1" -ForegroundColor Green
Write-Host "Read-only audit before AWS OIDC/IAM binding."
Write-Host "CASA Staging candidate is Vercel Preview; Production remains Vercel Production."
Write-Host "No environment values are printed or written to evidence."
Write-Host "No Vercel mutation. No AWS IAM/S3 mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking CASA source, local environments, and exact Vercel binding"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    foreach ($command in @("git", "aws")) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            Fail "$command is not available."
        }
    }

    Resolve-VercelRunner

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

    $stagingEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.staging.local")

    $productionEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.production.local")

    $linkPath =
        Join-Path `
            $ProjectRoot `
            ".vercel\project.json"

    if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) {
        Fail "Exact local Vercel binding is missing."
    }

    try {
        $linkJson =
            Get-Content `
                -LiteralPath $linkPath `
                -Raw |
            ConvertFrom-Json
    }
    catch {
        Fail ".vercel/project.json is invalid JSON."
    }

    $linkedOrgId =
        Get-PropertyString `
            $linkJson `
            @("orgId")

    $linkedProjectId =
        Get-PropertyString `
            $linkJson `
            @("projectId")

    if (
        $linkedOrgId -ne $ExpectedTeamId -or
        $linkedProjectId -ne $ExpectedProjectId
    ) {
        Fail "Local Vercel binding drift."
    }

    if ($linkedProjectId -eq $ProtectedOtherCasaProjectId) {
        Fail "Safety invariant failed: old unrelated CASA module selected."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  local Staging env keys:         $($stagingEnv.Keys.Count)"
    Write-Host "  local Production env keys:      $($productionEnv.Keys.Count)"
    Write-Host "  owner/team ID:                  $linkedOrgId / VERIFIED"
    Write-Host "  project ID:                     $linkedProjectId / VERIFIED"

    Step "Locking authenticated Vercel and AWS identities read-only"

    $versionResult =
        Invoke-Vercel `
            @("--version") `
            "Vercel CLI version"

    $versionText =
        (@($versionResult.stdout) -join " ").Trim()

    $whoamiResult =
        Invoke-Vercel `
            @(
                "whoami",
                "--no-color"
            ) `
            "Vercel whoami"

    $vercelUser =
        (
            @($whoamiResult.stdout) |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace([string]$_)
            } |
            Select-Object -Last 1
        )

    $vercelUser =
        ([string]$vercelUser).Trim()

    if ($vercelUser -ne $ExpectedVercelUser) {
        Fail "Authenticated Vercel identity drift: $vercelUser"
    }

    $awsIdentityResult =
        Invoke-Native `
            "aws" `
            @(
                "sts",
                "get-caller-identity",
                "--profile",
                $AwsProfile,
                "--region",
                $AwsRegion,
                "--output",
                "json",
                "--no-cli-pager"
            ) `
            "AWS caller identity"

    $awsIdentity =
        Parse-JsonResult `
            $awsIdentityResult `
            "AWS caller identity"

    if ([string]$awsIdentity.Account -ne $ExpectedAwsAccount) {
        Fail "AWS account mismatch."
    }

    Write-Host "  Vercel CLI:                     $versionText"
    Write-Host "  Vercel runner:                  $script:VercelRunnerMode"
    Write-Host "  authenticated user:             $vercelUser / VERIFIED"
    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  AWS region:                     $AwsRegion"

    Step "Re-proving exact casa-school project through authenticated Vercel API"

    $projectApiPath =
        "/v9/projects/$ExpectedProjectId"

    $projectResult =
        Invoke-Vercel `
            @(
                "api",
                $projectApiPath,
                "--scope",
                $ExpectedTeamSlug,
                "--no-color"
            ) `
            "Vercel exact project API"

    $projectJson =
        Parse-JsonResult `
            $projectResult `
            "Vercel exact project API"

    $apiProjectId =
        Get-PropertyString `
            $projectJson `
            @(
                "id",
                "uid"
            )

    $apiProjectName =
        Get-PropertyString `
            $projectJson `
            @("name")

    if (
        $apiProjectId -ne $ExpectedProjectId -or
        $apiProjectName -ne $ExpectedProjectName
    ) {
        Fail "Vercel project API identity mismatch."
    }

    Write-Host "  API project name:               $apiProjectName / VERIFIED"
    Write-Host "  API project ID:                 $apiProjectId / VERIFIED"

    Step "Reading Vercel environment-variable metadata only"

    $envApiPath =
        "/v9/projects/$ExpectedProjectId/env"

    $envResult =
        Invoke-Vercel `
            @(
                "api",
                $envApiPath,
                "--scope",
                $ExpectedTeamSlug,
                "--no-color"
            ) `
            "Vercel project environment metadata API"

    $envJson =
        Parse-JsonResult `
            $envResult `
            "Vercel project environment metadata API"

    $remoteEntries =
        @(
            Extract-EnvironmentVariables `
                $envJson
        )

    $safeRows =
        New-Object `
            System.Collections.Generic.List[object]

    foreach ($entry in $remoteEntries) {
        $key =
            Get-PropertyString `
                $entry `
                @(
                    "key",
                    "name"
                )

        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        $targets =
            Normalize-StringArray `
                (Get-PropertyValue $entry @("target", "targets"))

        $type =
            Get-PropertyString `
                $entry `
                @("type")

        $gitBranch =
            Get-PropertyString `
                $entry `
                @("gitBranch")

        $customEnvironmentIds =
            Normalize-StringArray `
                (
                    Get-PropertyValue `
                        $entry `
                        @(
                            "customEnvironmentIds",
                            "customEnvironmentId"
                        )
                )

        $safeRows.Add(
            [pscustomobject]@{
                key = $key
                targets = @($targets)
                type = $type
                gitBranch = $gitBranch
                customEnvironmentIds = @($customEnvironmentIds)
            }
        ) | Out-Null
    }

    Write-Host "  Vercel env metadata entries:    $($safeRows.Count)"

    foreach (
        $row in
        (
            $safeRows |
            Sort-Object `
                key
        )
    ) {
        $targetText =
            if (@($row.targets).Count -gt 0) {
                @($row.targets) -join ","
            }
            else {
                "<none>"
            }

        $typeText =
            if ([string]::IsNullOrWhiteSpace([string]$row.type)) {
                "<unknown>"
            }
            else {
                [string]$row.type
            }

        Write-Host "    $($row.key) :: targets=$targetText :: type=$typeText"
    }

    Step "Comparing CASA Staging keys to Vercel Preview scope"

    $previewKeys =
        @(
            $safeRows |
            Where-Object {
                @($_.targets) |
                Where-Object {
                    [string]$_ -ieq "preview"
                }
            } |
            ForEach-Object {
                [string]$_.key
            } |
            Sort-Object -Unique
        )

    $productionKeys =
        @(
            $safeRows |
            Where-Object {
                @($_.targets) |
                Where-Object {
                    [string]$_ -ieq "production"
                }
            } |
            ForEach-Object {
                [string]$_.key
            } |
            Sort-Object -Unique
        )

    $localStagingKeys =
        @(
            $stagingEnv.Keys |
            ForEach-Object {
                [string]$_
            } |
            Sort-Object -Unique
        )

    $localProductionKeys =
        @(
            $productionEnv.Keys |
            ForEach-Object {
                [string]$_
            } |
            Sort-Object -Unique
        )

    $missingPreviewKeys =
        @(
            $localStagingKeys |
            Where-Object {
                $previewKeys -notcontains $_
            }
        )

    $missingProductionKeys =
        @(
            $localProductionKeys |
            Where-Object {
                $productionKeys -notcontains $_
            }
        )

    Write-Host "  Preview-scoped remote keys:     $(@($previewKeys).Count)"
    Write-Host "  Staging keys missing Preview:   $(@($missingPreviewKeys).Count)"

    foreach ($key in $missingPreviewKeys) {
        Write-Host "    MISSING PREVIEW: $key"
    }

    Write-Host "  Production-scoped remote keys:  $(@($productionKeys).Count)"
    Write-Host "  Prod keys missing Production:   $(@($missingProductionKeys).Count)"

    foreach ($key in $missingProductionKeys) {
        Write-Host "    MISSING PRODUCTION: $key"
    }

    Step "Checking scope-conflict and static-AWS-credential hazards"

    $sharedConflictKeys =
        New-Object `
            System.Collections.Generic.List[string]

    foreach ($key in $localStagingKeys) {
        if (
            $productionEnv.ContainsKey($key) -and
            [string]$stagingEnv[$key] -ne
            [string]$productionEnv[$key]
        ) {
            $sharedRemoteEntries =
                @(
                    $safeRows |
                    Where-Object {
                        [string]$_.key -eq $key -and
                        (
                            @($_.targets) -contains "preview"
                        ) -and
                        (
                            @($_.targets) -contains "production"
                        )
                    }
                )

            if (@($sharedRemoteEntries).Count -gt 0) {
                [void]$sharedConflictKeys.Add($key)
            }
        }
    }

    $staticAwsRemoteKeys =
        @(
            $safeRows |
            Where-Object {
                $StaticAwsCredentialKeys -contains
                [string]$_.key
            } |
            ForEach-Object {
                [string]$_.key
            } |
            Sort-Object -Unique
        )

    $staticAwsLocalKeys =
        @(
            @(
                $localStagingKeys +
                $localProductionKeys
            ) |
            Where-Object {
                $StaticAwsCredentialKeys -contains $_
            } |
            Sort-Object -Unique
        )

    Write-Host "  shared-scope value conflicts:   $($sharedConflictKeys.Count)"
    foreach ($key in $sharedConflictKeys) {
        Write-Host "    CONFLICT: $key differs locally but one remote entry targets Preview + Production"
    }

    Write-Host "  static AWS keys in Vercel:      $(@($staticAwsRemoteKeys).Count)"
    foreach ($key in $staticAwsRemoteKeys) {
        Write-Host "    STATIC AWS REMOTE: $key"
    }

    Write-Host "  static AWS keys in local envs:  $(@($staticAwsLocalKeys).Count)"
    foreach ($key in $staticAwsLocalKeys) {
        Write-Host "    STATIC AWS LOCAL: $key"
    }

    $classification = $null

    if (
        @($staticAwsRemoteKeys).Count -gt 0 -or
        @($staticAwsLocalKeys).Count -gt 0
    ) {
        $classification =
            "STATIC_AWS_CREDENTIALS_PRESENT__REMOVE_OR_REPLACE_WITH_OIDC_BEFORE_STAGING"
    }
    elseif ($sharedConflictKeys.Count -gt 0) {
        $classification =
            "PREVIEW_PRODUCTION_SHARED_SCOPE_CONFLICT__SEPARATE_VALUES_BEFORE_STAGING"
    }
    elseif (@($previewKeys).Count -eq 0) {
        $classification =
            "PREVIEW_SCOPE_EMPTY__SYNC_LOCAL_STAGING_ENV_BEFORE_OIDC_STAGING_DEPLOYMENT"
    }
    elseif (@($missingPreviewKeys).Count -gt 0) {
        $classification =
            "PREVIEW_SCOPE_INCOMPLETE__SYNC_MISSING_STAGING_KEYS_BEFORE_OIDC_STAGING_DEPLOYMENT"
    }
    else {
        $classification =
            "PREVIEW_SCOPE_COVERS_LOCAL_STAGING_KEYS__READY_FOR_OIDC_BINDING_PREPARATION"
    }

    $stamp =
        Get-Date `
            -Format `
            "yyyyMMdd-HHmmss"

    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-environment-scope-audit-v1-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $evidence `
        -Force |
        Out-Null

    # IMPORTANT: only sanitized metadata is persisted. No environment values
    # from Vercel or either local .env file are written into this evidence.
    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_VERCEL_ENVIRONMENT_SCOPE_AUDIT_V1"
            source = [ordered]@{
                branch = $branch
                head = $head
                migrations = $migrationCount
            }
            vercel = [ordered]@{
                user = $vercelUser
                teamSlug = $ExpectedTeamSlug
                teamId = $ExpectedTeamId
                projectName = $ExpectedProjectName
                projectId = $ExpectedProjectId
                stagingVercelEnvironment = "preview"
                productionVercelEnvironment = "production"
            }
            counts = [ordered]@{
                localStagingKeys = @($localStagingKeys).Count
                localProductionKeys = @($localProductionKeys).Count
                remoteMetadataEntries = $safeRows.Count
                previewKeys = @($previewKeys).Count
                productionKeys = @($productionKeys).Count
                stagingKeysMissingPreview = @($missingPreviewKeys).Count
                productionKeysMissingProduction = @($missingProductionKeys).Count
                sharedScopeConflicts = $sharedConflictKeys.Count
                staticAwsRemoteKeys = @($staticAwsRemoteKeys).Count
                staticAwsLocalKeys = @($staticAwsLocalKeys).Count
            }
            missingPreviewKeys = @($missingPreviewKeys)
            missingProductionKeys = @($missingProductionKeys)
            sharedScopeConflictKeys = @($sharedConflictKeys)
            staticAwsRemoteKeys = @($staticAwsRemoteKeys)
            staticAwsLocalKeys = @($staticAwsLocalKeys)
            remoteEnvironmentMetadata = @($safeRows)
            classification = $classification
            mutations = [ordered]@{
                vercel = $false
                awsIam = $false
                s3 = $false
                database = $false
                migration = $false
                deployment = $false
                source = $false
            }
        }

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "RESULT_SANITIZED.json"),
        (
            $result |
            ConvertTo-Json -Depth 20
        ),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL PREVIEW/PRODUCTION ENVIRONMENT SCOPE AUDIT V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  project:                        $ExpectedProjectName / VERIFIED"
    Write-Host "  project ID:                     $ExpectedProjectId / VERIFIED"
    Write-Host "  CASA Staging Vercel target:     preview"
    Write-Host "  CASA Production Vercel target:  production"
    Write-Host "  Preview remote keys:            $(@($previewKeys).Count)"
    Write-Host "  missing Staging->Preview keys:  $(@($missingPreviewKeys).Count)"
    Write-Host "  Production remote keys:         $(@($productionKeys).Count)"
    Write-Host "  missing Prod->Production keys:  $(@($missingProductionKeys).Count)"
    Write-Host "  shared-scope conflicts:         $($sharedConflictKeys.Count)"
    Write-Host "  static AWS credential hazards:  $(@($staticAwsRemoteKeys).Count + @($staticAwsLocalKeys).Count)"
    Write-Host "  classification:                 $classification"
    Write-Host "  secret values displayed:        NONE"
    Write-Host "  Vercel mutation:                NONE / READ ONLY"
    Write-Host "  AWS IAM/S3 mutation:            NONE / READ ONLY"
    Write-Host "  DB/migration/deployment:        NONE"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete output. The next guarded installer will either synchronize Staging into Preview safely or, if Preview is already complete, proceed to the exact OIDC/IAM binding preparation." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL PREVIEW/PRODUCTION ENVIRONMENT SCOPE AUDIT V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No Vercel, AWS IAM/S3, DB, migration, deployment, or CASA source mutation was authorized by this audit."
    throw
}
