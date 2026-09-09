param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedStagingHost =
    "ep-ancient-truth-a5s7v83r-pooler.us-east-2.aws.neon.tech"

function Stop-Phase([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Read-DotEnvMap([string]$Path) {
    $Map = @{}

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $Map
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
        $Value = $Line.Substring($Index + 1).Trim()

        if (
            ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
            ($Value.StartsWith("'") -and $Value.EndsWith("'"))
        ) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }

        $Map[$Key] = $Value
    }

    return $Map
}

function Has-KeyValue(
    [hashtable]$Map,
    [string]$Name
) {
    return (
        $Map.ContainsKey($Name) -and
        -not [string]::IsNullOrWhiteSpace(
            [string]$Map[$Name]
        )
    )
}

Write-Host "CASA School - Staging Deployment Readiness Inventory V1" -ForegroundColor Green
Write-Host "READ ONLY. Determines the exact hosting/deployment and environment state before CASA is exposed on a real Staging HTTPS origin."
Write-Host "No source write. No database mutation. No AWS mutation. No deployment. Production is never read or connected."

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Stop-Phase "CASA repository not found: $ProjectRoot"
}

Set-Location $ProjectRoot

Step "Locking exact CASA source checkpoint"

$Branch = (& git branch --show-current).Trim()
$Head = (& git rev-parse --short HEAD).Trim()

if (
    $Branch -ne $ExpectedBranch -or
    $Head -ne $ExpectedHead
) {
    Stop-Phase "Git checkpoint drift: $Branch/$Head"
}

$MigrationCount =
    @(
        Get-ChildItem `
            -LiteralPath (Join-Path $ProjectRoot "drizzle") `
            -Directory |
            Where-Object {
                Test-Path `
                    -LiteralPath (
                        Join-Path $_.FullName "migration.sql"
                    ) `
                    -PathType Leaf
            }
    ).Count

if ($MigrationCount -ne 30) {
    Stop-Phase "Expected 30 local migrations; found $MigrationCount."
}

Write-Host "  branch/head:                   $Branch/$Head"
Write-Host "  local migrations:              30 / VERIFIED"

Step "Inspecting repository deployment linkage"

$RemoteLines =
    @(
        & git remote -v 2>$null
    )

$RemoteNames =
    @(
        & git remote 2>$null
    )

$RemoteSummary =
    if ($RemoteNames.Count -eq 0) {
        "NONE"
    }
    else {
        ($RemoteNames -join ", ")
    }

$VercelDir =
    Join-Path $ProjectRoot ".vercel"

$VercelProjectJson =
    Join-Path $VercelDir "project.json"

$HasVercelProject =
    Test-Path -LiteralPath $VercelProjectJson -PathType Leaf

$VercelCli = $null

try {
    $VercelCli =
        (Get-Command vercel -ErrorAction Stop).Source
}
catch {
    try {
        $VercelCli =
            (Get-Command vercel.cmd -ErrorAction Stop).Source
    }
    catch {
        $VercelCli = $null
    }
}

$Dockerfile =
    Test-Path `
        -LiteralPath (Join-Path $ProjectRoot "Dockerfile") `
        -PathType Leaf

$DockerCompose =
    @(
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml"
    ) |
    Where-Object {
        Test-Path `
            -LiteralPath (Join-Path $ProjectRoot $_) `
            -PathType Leaf
    }

$HostingFiles =
    @(
        "vercel.json",
        "netlify.toml",
        "render.yaml",
        "fly.toml",
        "railway.json",
        "railway.toml",
        "Procfile"
    ) |
    Where-Object {
        Test-Path `
            -LiteralPath (Join-Path $ProjectRoot $_) `
            -PathType Leaf
    }

Write-Host "  git remotes:                    $RemoteSummary"
Write-Host "  .vercel/project.json:           $(if ($HasVercelProject) { 'PRESENT' } else { 'ABSENT' })"
Write-Host "  Vercel CLI:                     $(if ($VercelCli) { 'AVAILABLE' } else { 'NOT FOUND' })"
Write-Host "  Dockerfile:                     $(if ($Dockerfile) { 'PRESENT' } else { 'ABSENT' })"
Write-Host "  hosting config files:           $(if (@($HostingFiles).Count -gt 0) { $HostingFiles -join ', ' } else { 'NONE FOUND' })"

Step "Reading Staging environment keys without displaying values"

$StagingEnvPath =
    Join-Path $ProjectRoot ".env.staging.local"

if (-not (Test-Path -LiteralPath $StagingEnvPath -PathType Leaf)) {
    Stop-Phase ".env.staging.local is missing."
}

$StagingEnv =
    Read-DotEnvMap $StagingEnvPath

if (-not (Has-KeyValue $StagingEnv "DATABASE_URL")) {
    Stop-Phase "Staging DATABASE_URL is missing."
}

try {
    $StagingDbUri =
        [Uri][string]$StagingEnv["DATABASE_URL"]
}
catch {
    Stop-Phase "Staging DATABASE_URL is invalid."
}

if ($StagingDbUri.Host -ne $ExpectedStagingHost) {
    Stop-Phase "Staging DATABASE_URL points to unexpected host '$($StagingDbUri.Host)'."
}

$CriticalKeys =
    @(
        "DATABASE_URL",
        "APP_ORIGIN",
        "CASA_WEBAUTHN_RP_ID",
        "CASA_WEBAUTHN_ORIGINS",
        "CASA_BIOMETRIC_PROVIDER_MODE",
        "CASA_AWS_REKOGNITION_REGION",
        "CASA_AWS_LIVENESS_STREAM_ROLE_ARN",
        "CASA_BIOMETRIC_FACE_MIN_CONFIDENCE_BPS",
        "CASA_BIOMETRIC_LIVENESS_MIN_CONFIDENCE_BPS",
        "CASA_BIOMETRIC_ASSERTION_HMAC_SECRET",
        "AWS_REGION",
        "AWS_DEFAULT_REGION"
    )

$CriticalPresence = [ordered]@{}

foreach ($Key in $CriticalKeys) {
    $CriticalPresence[$Key] =
        Has-KeyValue $StagingEnv $Key
}

foreach ($Key in $CriticalKeys) {
    Write-Host (
        "  {0,-42} {1}" -f
        ($Key + ":"),
        $(if ($CriticalPresence[$Key]) { "SET" } else { "MISSING" })
    )
}

$AwsProfileSet =
    Has-KeyValue $StagingEnv "AWS_PROFILE"

$AwsAccessKeySet =
    Has-KeyValue $StagingEnv "AWS_ACCESS_KEY_ID"

$AwsSecretKeySet =
    Has-KeyValue $StagingEnv "AWS_SECRET_ACCESS_KEY"

$AwsSessionTokenSet =
    Has-KeyValue $StagingEnv "AWS_SESSION_TOKEN"

Write-Host "  AWS_PROFILE:                    $(if ($AwsProfileSet) { 'SET / LOCAL-PROFILE MODEL' } else { 'NOT SET' })"
Write-Host "  static AWS access key pair:     $(if ($AwsAccessKeySet -and $AwsSecretKeySet) { 'SET' } else { 'NOT SET' })"
Write-Host "  AWS session token:              $(if ($AwsSessionTokenSet) { 'SET' } else { 'NOT SET' })"

Step "Checking Staging HTTPS/WebAuthn shape"

$AppOrigin = if (Has-KeyValue $StagingEnv "APP_ORIGIN") {
    [string]$StagingEnv["APP_ORIGIN"]
}
else {
    ""
}

$RpId = if (Has-KeyValue $StagingEnv "CASA_WEBAUTHN_RP_ID") {
    [string]$StagingEnv["CASA_WEBAUTHN_RP_ID"]
}
else {
    ""
}

$Origins = if (Has-KeyValue $StagingEnv "CASA_WEBAUTHN_ORIGINS") {
    [string]$StagingEnv["CASA_WEBAUTHN_ORIGINS"]
}
else {
    ""
}

$OriginHttps = $false
$OriginHost = ""

if (-not [string]::IsNullOrWhiteSpace($AppOrigin)) {
    try {
        $OriginUri = [Uri]$AppOrigin
        $OriginHttps =
            $OriginUri.Scheme -eq "https"
        $OriginHost =
            $OriginUri.Host
    }
    catch {
        $OriginHttps = $false
    }
}

$WebAuthnCoherent =
    (
        $OriginHttps -and
        -not [string]::IsNullOrWhiteSpace($OriginHost) -and
        $RpId -eq $OriginHost -and
        (
            $Origins.Split(",") |
            ForEach-Object { $_.Trim().TrimEnd("/") }
        ) -contains $AppOrigin.TrimEnd("/")
    )

Write-Host "  APP_ORIGIN HTTPS:               $(if ($OriginHttps) { 'YES' } else { 'NO / NOT CONFIGURED' })"
Write-Host "  WebAuthn RP matches host:       $(if ($OriginHost -and $RpId -eq $OriginHost) { 'YES' } else { 'NO / NOT CONFIGURED' })"
Write-Host "  WebAuthn origin includes app:   $(if ($AppOrigin -and (($Origins.Split(',') | ForEach-Object { $_.Trim().TrimEnd('/') }) -contains $AppOrigin.TrimEnd('/'))) { 'YES' } else { 'NO / NOT CONFIGURED' })"
Write-Host "  WebAuthn staging coherence:     $(if ($WebAuthnCoherent) { 'READY' } else { 'NOT READY' })"

Step "Discovering environment variables referenced by CASA source"

$SourceFiles =
    @(
        Get-ChildItem `
            -LiteralPath (Join-Path $ProjectRoot "src") `
            -Recurse `
            -File `
            -Include *.ts,*.tsx,*.js,*.mjs
    )

$EnvNames =
    New-Object System.Collections.Generic.HashSet[string]

$Patterns =
    @(
        'process\.env\.([A-Z][A-Z0-9_]*)',
        'process\.env\[\s*["'']([A-Z][A-Z0-9_]*)["'']\s*\]'
    )

foreach ($File in $SourceFiles) {
    $Text =
        Get-Content `
            -LiteralPath $File.FullName `
            -Raw

    foreach ($Pattern in $Patterns) {
        foreach ($Match in [regex]::Matches($Text, $Pattern)) {
            [void]$EnvNames.Add(
                [string]$Match.Groups[1].Value
            )
        }
    }
}

$SortedEnvNames =
    @($EnvNames) |
    Sort-Object

$MissingReferenced =
    @()

foreach ($Name in $SortedEnvNames) {
    if (-not (Has-KeyValue $StagingEnv $Name)) {
        $MissingReferenced += $Name
    }
}

Write-Host "  source-referenced env names:    $($SortedEnvNames.Count)"
Write-Host "  present in Staging env:         $($SortedEnvNames.Count - $MissingReferenced.Count)"
Write-Host "  missing from Staging env:       $($MissingReferenced.Count)"

if ($MissingReferenced.Count -gt 0) {
    Write-Host "  missing names (values never shown):"
    foreach ($Name in $MissingReferenced) {
        Write-Host "    - $Name"
    }
}

Step "Classifying deployability"

$AwsHostedReady =
    (
        (
            $AwsAccessKeySet -and
            $AwsSecretKeySet
        ) -or
        (
            -not $AwsProfileSet -and
            (
                Has-KeyValue $StagingEnv "AWS_ROLE_ARN"
            )
        )
    )

$HostingLinked =
    (
        $HasVercelProject -or
        @($HostingFiles).Count -gt 0 -or
        $Dockerfile
    )

$Classification =
    if (
        -not $WebAuthnCoherent -and
        -not $AwsHostedReady -and
        -not $HostingLinked
    ) {
        "BLOCKED_ON_HOSTING_LINK_WEBAUTHN_AND_HOSTED_AWS_CREDENTIALS"
    }
    elseif (
        -not $HostingLinked
    ) {
        "BLOCKED_ON_HOSTING_PROVIDER_LINKAGE"
    }
    elseif (
        -not $WebAuthnCoherent
    ) {
        "BLOCKED_ON_STAGING_PUBLIC_ORIGIN_AND_WEBAUTHN"
    }
    elseif (
        -not $AwsHostedReady
    ) {
        "BLOCKED_ON_HOSTED_STAGING_AWS_CREDENTIAL_STRATEGY"
    }
    else {
        "READY_FOR_GUARDED_STAGING_DEPLOYMENT"
    }

$Stamp =
    Get-Date -Format "yyyyMMdd-HHmmss"

$Evidence =
    Join-Path `
        $ProjectRoot `
        ".casa-backups\staging-deployment-readiness-inventory-v1-$Stamp"

New-Item `
    -ItemType Directory `
    -Path $Evidence `
    -Force |
    Out-Null

$Result =
    [ordered]@{
        createdAt =
            (Get-Date -Format o)
        proof =
            "CASA_STAGING_DEPLOYMENT_READINESS_INVENTORY_V1"
        classification =
            $Classification
        branch =
            $Branch
        head =
            $Head
        migrations =
            30
        stagingDatabaseHost =
            $ExpectedStagingHost
        gitRemoteNames =
            @($RemoteNames)
        vercelLinked =
            $HasVercelProject
        vercelCliAvailable =
            [bool]$VercelCli
        dockerfile =
            $Dockerfile
        hostingConfigFiles =
            @($HostingFiles)
        appOriginConfigured =
            -not [string]::IsNullOrWhiteSpace($AppOrigin)
        appOriginHttps =
            $OriginHttps
        webauthnCoherent =
            $WebAuthnCoherent
        awsProfileConfigured =
            $AwsProfileSet
        staticAwsCredentialsConfigured =
            ($AwsAccessKeySet -and $AwsSecretKeySet)
        awsRoleArnConfigured =
            (Has-KeyValue $StagingEnv "AWS_ROLE_ARN")
        hostedAwsCredentialStrategyReady =
            $AwsHostedReady
        sourceReferencedEnvNames =
            $SortedEnvNames
        missingReferencedEnvNames =
            $MissingReferenced
        sourceMutation =
            $false
        databaseMutation =
            $false
        awsMutation =
            $false
        deploymentMutation =
            $false
        productionRead =
            $false
        productionConnected =
            $false
    }

$Result |
    ConvertTo-Json -Depth 20 |
    Set-Content `
        -LiteralPath (
            Join-Path $Evidence "RESULT.json"
        ) `
        -Encoding UTF8

Write-Host ""
Write-Host "CASA STAGING DEPLOYMENT READINESS INVENTORY V1 IS GREEN" -ForegroundColor Green
Write-Host "  source authority:               $Branch/$Head"
Write-Host "  migrations:                     30"
Write-Host "  Staging DB:                     VERIFIED"
Write-Host "  hosting linkage detected:       $(if ($HostingLinked) { 'YES' } else { 'NO' })"
Write-Host "  Staging HTTPS/WebAuthn:         $(if ($WebAuthnCoherent) { 'READY' } else { 'NOT READY' })"
Write-Host "  hosted AWS credential strategy: $(if ($AwsHostedReady) { 'READY' } else { 'NOT READY' })"
Write-Host "  classification:                 $Classification"
Write-Host "  source/DB/AWS/deployment mutation: NONE"
Write-Host "  Production:                     NOT READ / NOT CONNECTED"
Write-Host "  evidence:                       $Evidence"
Write-Host ""
Write-Host "NEXT: return this complete output. We will use the exact classification to configure and deploy the fresh CASA Staging runtime safely." -ForegroundColor Yellow
