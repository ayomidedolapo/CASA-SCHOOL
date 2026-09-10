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

$ProtectedOtherCasaProjectName = "casa"
$ProtectedOtherCasaProjectId = "prj_ttIrmj3X5fcOzYNBVmiiq2hZc5W9"

$ExpectedAwsAccount = "938733852185"
$AwsRegion = "eu-west-1"
$ExpectedStagingBucket = "casa-school-staging-card-artifacts-$ExpectedAwsAccount-$AwsRegion"
$ExpectedProductionBucket = "casa-school-production-card-artifacts-$ExpectedAwsAccount-$AwsRegion"
$ExpectedStagingPrefix = "casa-school-staging"
$ExpectedProductionPrefix = "casa-school-production"

$TeamIssuer = "https://oidc.vercel.com/$ExpectedTeamSlug"
$DefaultAudience = "https://vercel.com/$ExpectedTeamSlug"
$AwsCustomAudience = "sts.amazonaws.com"

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

function Extract-Deployments([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Array]) {
        return @($Json)
    }

    foreach ($property in @("deployments", "items", "data")) {
        if ($null -ne $Json.PSObject.Properties[$property]) {
            return As-Array $Json.$property
        }
    }

    return @()
}

function Extract-CustomEnvironments([object]$Json) {
    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Array]) {
        return @($Json)
    }

    foreach ($property in @(
        "environments",
        "customEnvironments",
        "items",
        "data"
    )) {
        if ($null -ne $Json.PSObject.Properties[$property]) {
            return As-Array $Json.$property
        }
    }

    return @()
}

Write-Host "CASA School - Vercel Staging Environment + OIDC Readiness V1R2" -ForegroundColor Green
Write-Host "Read-only proof after exact casa-school local binding."
Write-Host "Determines whether hosted Staging is a Vercel custom staging environment or built-in Preview before AWS IAM trust is created."
Write-Host "No Vercel mutation. No AWS IAM/S3 mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking CASA source + environment separation authority"

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

    $stagingEnv = Read-EnvMap (Join-Path $ProjectRoot ".env.staging.local")
    $productionEnv = Read-EnvMap (Join-Path $ProjectRoot ".env.production.local")

    if (
        -not $stagingEnv.ContainsKey("CASA_CARD_STORAGE_BUCKET") -or
        [string]$stagingEnv["CASA_CARD_STORAGE_BUCKET"] -ne $ExpectedStagingBucket -or
        -not $stagingEnv.ContainsKey("CASA_AWS_REKOGNITION_COLLECTION_PREFIX") -or
        [string]$stagingEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne $ExpectedStagingPrefix
    ) {
        Fail "Staging environment separation authority drift."
    }

    if (
        -not $productionEnv.ContainsKey("CASA_CARD_STORAGE_BUCKET") -or
        [string]$productionEnv["CASA_CARD_STORAGE_BUCKET"] -ne $ExpectedProductionBucket -or
        -not $productionEnv.ContainsKey("CASA_AWS_REKOGNITION_COLLECTION_PREFIX") -or
        [string]$productionEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne $ExpectedProductionPrefix
    ) {
        Fail "Production environment separation authority drift."
    }

    Write-Host "  Vercel runner:                  $script:VercelRunnerMode"
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Staging S3/env isolation:       VERIFIED"
    Write-Host "  Production S3/env isolation:    VERIFIED"

    Step "Re-proving exact local Vercel binding"

    $linkPath = Join-Path $ProjectRoot ".vercel\project.json"

    if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) {
        Fail "Exact local Vercel binding is missing."
    }

    try {
        $linkJson = Get-Content -LiteralPath $linkPath -Raw | ConvertFrom-Json
    }
    catch {
        Fail ".vercel/project.json is invalid JSON."
    }

    $linkedOrgId = Get-PropertyString $linkJson @("orgId")
    $linkedProjectId = Get-PropertyString $linkJson @("projectId")

    if (
        $linkedOrgId -ne $ExpectedTeamId -or
        $linkedProjectId -ne $ExpectedProjectId
    ) {
        Fail "Local Vercel binding drift."
    }

    if (
        $linkedProjectId -eq $ProtectedOtherCasaProjectId
    ) {
        Fail "Safety invariant failed: local link targets the older unrelated CASA module."
    }

    Write-Host "  owner/team ID:                  $linkedOrgId / VERIFIED"
    Write-Host "  project ID:                     $linkedProjectId / VERIFIED"
    Write-Host "  protected old casa project:     NOT SELECTED / VERIFIED"

    Step "Locking authenticated Vercel identity and linked project resolution"

    $versionResult = Invoke-Vercel @("--version") "Vercel CLI version"
    $versionText = (@($versionResult.stdout) -join " ").Trim()

    $whoamiResult = Invoke-Vercel @("whoami", "--no-color") "Vercel whoami"
    $vercelUser =
        (
            @($whoamiResult.stdout) |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace([string]$_)
            } |
            Select-Object -Last 1
        )

    $vercelUser = ([string]$vercelUser).Trim()

    if ($vercelUser -ne $ExpectedVercelUser) {
        Fail "Authenticated Vercel identity drift: $vercelUser"
    }

    # Do not parse human-formatted `vercel project inspect` output as a
    # machine identity boundary. Vercel CLI can emit human status text on a
    # different stream. Prove the exact linked project through the authenticated
    # Vercel REST API instead.
    $projectApiPath =
        "/v9/projects/$ExpectedProjectId" +
        "?teamId=$ExpectedTeamId"

    $projectIdentityResult =
        Invoke-Vercel `
            @(
                "api",
                $projectApiPath
            ) `
            "Vercel exact project identity API"

    $projectJson =
        Parse-JsonResult `
            $projectIdentityResult `
            "Vercel exact project identity API"

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
            @(
                "name"
            )

    if (
        $apiProjectId -ne $ExpectedProjectId -or
        $apiProjectName -ne $ExpectedProjectName
    ) {
        Fail "Authenticated Vercel API did not resolve the exact casa-school project identity."
    }

    Write-Host "  Vercel CLI:                     $versionText"
    Write-Host "  authenticated user:             $vercelUser / VERIFIED"
    Write-Host "  API project name:               $apiProjectName / VERIFIED"
    Write-Host "  API project ID:                 $apiProjectId / VERIFIED"
    Write-Host "  linked project resolution:      casa-school / VERIFIED"

    Step "Locking AWS account read-only"

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

    $awsIdentity = Parse-JsonResult $awsIdentityResult "AWS caller identity"

    if ([string]$awsIdentity.Account -ne $ExpectedAwsAccount) {
        Fail "AWS account mismatch."
    }

    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  AWS region:                     $AwsRegion"

    Step "Reading exact Vercel custom-environment configuration through authenticated API"

    # Project identity is already proven above. Query custom environments through
    # their dedicated read-only endpoint rather than assuming the project object
    # embeds them.
    $customEnvironmentsApiPath =
        "/v9/projects/$ExpectedProjectId/custom-environments" +
        "?teamId=$ExpectedTeamId"

    $customEnvironmentsResult =
        Invoke-Vercel `
            @(
                "api",
                $customEnvironmentsApiPath
            ) `
            "Vercel custom environments API" `
            -AllowFailure

    $customEnvironments = @()
    $customEnvironmentApiAvailable = $false

    if ($customEnvironmentsResult.ok) {
        $customEnvironmentsJson =
            Parse-JsonResult `
                $customEnvironmentsResult `
                "Vercel custom environments API"

        $customEnvironments =
            Extract-CustomEnvironments `
                $customEnvironmentsJson

        $customEnvironmentApiAvailable = $true
    }
    else {
        # A project with no custom environments, or an account/plan where the
        # endpoint is unavailable, must not cause a mutation or an inference.
        $customEnvironmentsJson =
            [ordered]@{
                unavailable = $true
                exitCode = $customEnvironmentsResult.exitCode
            }
    }

    Write-Host "  API project name:               $apiProjectName / VERIFIED"
    Write-Host "  API project ID:                 $apiProjectId / VERIFIED"
    Write-Host "  custom env API available:       $(if ($customEnvironmentApiAvailable) { 'YES' } else { 'NO / NOT REQUIRED TO PROVE PREVIEW' })"
    Write-Host "  custom environments reported:   $($customEnvironments.Count)"

    $customRows =
        New-Object `
            System.Collections.Generic.List[object]

    foreach ($environment in $customEnvironments) {
        $environmentId =
            Get-PropertyString `
                $environment `
                @(
                    "id",
                    "uid"
                )

        $environmentSlug =
            Get-PropertyString `
                $environment `
                @(
                    "slug",
                    "name"
                )

        $environmentName =
            Get-PropertyString `
                $environment `
                @(
                    "name",
                    "slug"
                )

        $customRows.Add(
            [pscustomobject]@{
                id = $environmentId
                slug = $environmentSlug
                name = $environmentName
            }
        ) | Out-Null

        Write-Host "    $environmentSlug / $environmentId"
    }

    $stagingCustom =
        @(
            $customRows |
            Where-Object {
                [string]$_.slug -ieq "staging" -or
                [string]$_.name -ieq "staging"
            }
        )

    if ($stagingCustom.Count -gt 1) {
        Fail "Multiple custom environments resolve to staging."
    }

    Step "Reading recent casa-school deployments read-only"

    $deploymentsApiPath =
        "/v6/deployments" +
        "?projectId=$ExpectedProjectId" +
        "&teamId=$ExpectedTeamId" +
        "&limit=25"

    $deploymentsResult =
        Invoke-Vercel `
            @(
                "api",
                $deploymentsApiPath
            ) `
            "Vercel deployments API"

    $deploymentsJson =
        Parse-JsonResult `
            $deploymentsResult `
            "Vercel deployments API"

    $deployments =
        Extract-Deployments `
            $deploymentsJson

    Write-Host "  recent deployments returned:    $($deployments.Count)"

    $deploymentRows =
        New-Object `
            System.Collections.Generic.List[object]

    foreach ($deployment in $deployments) {
        $deploymentId =
            Get-PropertyString `
                $deployment `
                @(
                    "uid",
                    "id"
                )

        $deploymentUrl =
            Get-PropertyString `
                $deployment `
                @(
                    "url"
                )

        $deploymentTarget =
            Get-PropertyString `
                $deployment `
                @(
                    "target",
                    "environment"
                )

        $deploymentState =
            Get-PropertyString `
                $deployment `
                @(
                    "readyState",
                    "state"
                )

        $customEnvironmentId =
            Get-PropertyString `
                $deployment `
                @(
                    "customEnvironmentId",
                    "environmentId"
                )

        $createdRaw =
            Get-PropertyValue `
                $deployment `
                @(
                    "created",
                    "createdAt"
                )

        $createdValue = 0L

        if ($null -ne $createdRaw) {
            [long]::TryParse(
                [string]$createdRaw,
                [ref]$createdValue
            ) | Out-Null
        }

        $deploymentRows.Add(
            [pscustomobject]@{
                id = $deploymentId
                url = $deploymentUrl
                target = $deploymentTarget
                state = $deploymentState
                customEnvironmentId = $customEnvironmentId
                created = $createdValue
            }
        ) | Out-Null
    }

    foreach (
        $row in
        (
            $deploymentRows |
            Sort-Object `
                created `
                -Descending |
            Select-Object `
                -First 10
        )
    ) {
        $displayTarget =
            if (
                [string]::IsNullOrWhiteSpace(
                    [string]$row.target
                )
            ) {
                "<empty>"
            }
            else {
                [string]$row.target
            }

        $displayCustom =
            if (
                [string]::IsNullOrWhiteSpace(
                    [string]$row.customEnvironmentId
                )
            ) {
                "<none>"
            }
            else {
                [string]$row.customEnvironmentId
            }

        Write-Host "    $($row.state) / target=$displayTarget / custom=$displayCustom / $($row.url)"
    }

    $readyRows =
        @(
            $deploymentRows |
            Where-Object {
                [string]$_.state -ieq "READY"
            } |
            Sort-Object `
                created `
                -Descending
        )

    $classification = $null
    $resolvedStagingEnvironment = $null
    $resolvedStagingDeployment = $null
    $stagingSubject = $null

    if ($stagingCustom.Count -eq 1) {
        $stagingEnvironmentId =
            [string]$stagingCustom[0].id

        $stagingEnvironmentSlug =
            if (
                -not [string]::IsNullOrWhiteSpace(
                    [string]$stagingCustom[0].slug
                )
            ) {
                [string]$stagingCustom[0].slug
            }
            else {
                "staging"
            }

        $matching =
            @(
                $readyRows |
                Where-Object {
                    (
                        -not [string]::IsNullOrWhiteSpace(
                            $stagingEnvironmentId
                        ) -and
                        [string]$_.customEnvironmentId -eq
                        $stagingEnvironmentId
                    ) -or
                    [string]$_.target -ieq
                    $stagingEnvironmentSlug -or
                    [string]$_.target -ieq
                    "staging"
                }
            )

        if ($matching.Count -gt 0) {
            $resolvedStagingEnvironment =
                $stagingEnvironmentSlug

            $resolvedStagingDeployment =
                $matching[0]

            $stagingSubject =
                "owner:$ExpectedTeamSlug`:project:$ExpectedProjectName`:environment:$resolvedStagingEnvironment"

            $classification =
                "CUSTOM_STAGING_ENVIRONMENT_AND_READY_DEPLOYMENT_PROVEN"
        }
        else {
            $classification =
                "CUSTOM_STAGING_ENVIRONMENT_EXISTS__NO_READY_STAGING_DEPLOYMENT_PROVEN"
        }
    }
    else {
        $previewReady =
            @(
                $readyRows |
                Where-Object {
                    [string]$_.target -ieq "preview"
                }
            )

        $untargetedReady =
            @(
                $readyRows |
                Where-Object {
                    [string]::IsNullOrWhiteSpace(
                        [string]$_.target
                    ) -and
                    [string]::IsNullOrWhiteSpace(
                        [string]$_.customEnvironmentId
                    )
                }
            )

        $productionReady =
            @(
                $readyRows |
                Where-Object {
                    [string]$_.target -ieq "production"
                }
            )

        if ($previewReady.Count -gt 0) {
            $resolvedStagingEnvironment = "preview"
            $resolvedStagingDeployment = $previewReady[0]
            $stagingSubject =
                "owner:$ExpectedTeamSlug`:project:$ExpectedProjectName`:environment:preview"
            $classification =
                "NO_CUSTOM_STAGING__READY_PREVIEW_DEPLOYMENT_PROVEN"
        }
        elseif ($untargetedReady.Count -gt 0) {
            # Vercel's built-in Preview deployments can be returned by the
            # deployment API with target=null. With no customEnvironmentId and
            # no Production target, this is the built-in Preview environment.
            $resolvedStagingEnvironment = "preview"
            $resolvedStagingDeployment = $untargetedReady[0]
            $stagingSubject =
                "owner:$ExpectedTeamSlug`:project:$ExpectedProjectName`:environment:preview"
            $classification =
                "NO_CUSTOM_STAGING__READY_PREVIEW_DEPLOYMENT_PROVEN"
        }
        elseif ($productionReady.Count -gt 0) {
            $classification =
                "NO_CUSTOM_STAGING__ONLY_PRODUCTION_READY_DEPLOYMENT_PROVEN"
        }
        else {
            $classification =
                "NO_READY_STAGING_OR_PREVIEW_DEPLOYMENT_PROVEN"
        }
    }

    $productionSubject =
        "owner:$ExpectedTeamSlug`:project:$ExpectedProjectName`:environment:production"

    Step "Checking existing AWS Vercel OIDC provider read-only"

    $providersResult =
        Invoke-Native `
            "aws" `
            @(
                "iam",
                "list-open-id-connect-providers",
                "--profile",
                $AwsProfile,
                "--region",
                $AwsRegion,
                "--output",
                "json",
                "--no-cli-pager"
            ) `
            "AWS OIDC provider inventory"

    $providersJson =
        Parse-JsonResult `
            $providersResult `
            "AWS OIDC provider inventory"

    $expectedProviderArn =
        "arn:aws:iam::$ExpectedAwsAccount`:oidc-provider/oidc.vercel.com/$ExpectedTeamSlug"

    $providerArns =
        @(
            $providersJson.OpenIDConnectProviderList |
            ForEach-Object {
                [string]$_.Arn
            }
        )

    $providerExists =
        $providerArns -contains
        $expectedProviderArn

    $stamp =
        Get-Date `
            -Format `
            "yyyyMMdd-HHmmss"

    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-staging-environment-oidc-readiness-v1r2-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $evidence `
        -Force |
        Out-Null

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "VERCEL_PROJECT.json"),
        (
            $projectJson |
            ConvertTo-Json -Depth 30
        ),
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "VERCEL_CUSTOM_ENVIRONMENTS.json"),
        (
            $customEnvironmentsJson |
            ConvertTo-Json -Depth 30
        ),
        $Utf8NoBom
    )

    [System.IO.File]::WriteAllText(
        (Join-Path $evidence "VERCEL_DEPLOYMENTS.json"),
        (
            $deploymentsJson |
            ConvertTo-Json -Depth 30
        ),
        $Utf8NoBom
    )

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_VERCEL_STAGING_ENVIRONMENT_OIDC_READINESS_V1R2"
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
                localBindingExact = $true
                customEnvironmentApiAvailable = $customEnvironmentApiAvailable
                customEnvironmentCount = $customRows.Count
                stagingCustomEnvironmentFound = ($stagingCustom.Count -eq 1)
                resolvedStagingEnvironment = $resolvedStagingEnvironment
                resolvedStagingDeploymentUrl =
                    if ($null -ne $resolvedStagingDeployment) {
                        [string]$resolvedStagingDeployment.url
                    }
                    else {
                        $null
                    }
                issuerCandidate = $TeamIssuer
                defaultAudienceCandidate = $DefaultAudience
                awsCustomAudienceAvailable = $AwsCustomAudience
                stagingSubject = $stagingSubject
                productionSubject = $productionSubject
            }
            aws = [ordered]@{
                account = $ExpectedAwsAccount
                region = $AwsRegion
                expectedOidcProviderArn = $expectedProviderArn
                oidcProviderExists = $providerExists
            }
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
        (Join-Path $evidence "RESULT.json"),
        (
            $result |
            ConvertTo-Json -Depth 20
        ),
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA VERCEL STAGING ENVIRONMENT + OIDC READINESS V1R2 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  linked Vercel project:          $ExpectedProjectName / VERIFIED"
    Write-Host "  linked project ID:              $ExpectedProjectId / VERIFIED"
    Write-Host "  owner/team:                     $ExpectedTeamSlug / VERIFIED"
    Write-Host "  Staging environment resolved:   $(if ($resolvedStagingEnvironment) { $resolvedStagingEnvironment } else { 'NOT YET PROVEN' })"
    Write-Host "  Staging deployment:             $(if ($null -ne $resolvedStagingDeployment) { $resolvedStagingDeployment.url } else { 'NOT YET PROVEN' })"
    Write-Host "  Team issuer candidate:          $TeamIssuer"
    Write-Host "  default audience candidate:     $DefaultAudience"
    Write-Host "  AWS custom audience option:     $AwsCustomAudience"
    Write-Host "  Staging subject:                $(if ($stagingSubject) { $stagingSubject } else { 'NOT AUTHORIZED TO INFER' })"
    Write-Host "  Production subject candidate:   $productionSubject"
    Write-Host "  existing AWS Vercel OIDC IdP:   $(if ($providerExists) { 'YES' } else { 'NO / NOT YET CREATED' })"
    Write-Host "  classification:                 $classification"
    Write-Host "  Vercel mutation:                NONE / READ ONLY"
    Write-Host "  AWS IAM/S3 mutation:            NONE / READ ONLY"
    Write-Host "  DB/migration/deployment:        NONE"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""

    if (
        $classification -eq
        "CUSTOM_STAGING_ENVIRONMENT_AND_READY_DEPLOYMENT_PROVEN" -or
        $classification -eq
        "NO_CUSTOM_STAGING__READY_PREVIEW_DEPLOYMENT_PROVEN"
    ) {
        Write-Host "NEXT: return this complete output. Exact Staging environment identity is proven; the next guarded step can bind AWS OIDC/IAM without guessing the environment claim." -ForegroundColor Yellow
    }
    else {
        Write-Host "NEXT: return this complete output. IAM binding remains intentionally blocked until the hosted Staging environment claim is exact." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL STAGING ENVIRONMENT + OIDC READINESS V1R2 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No Vercel, AWS IAM/S3, DB, migration, deployment, or CASA source mutation was authorized by this probe."
    throw
}
