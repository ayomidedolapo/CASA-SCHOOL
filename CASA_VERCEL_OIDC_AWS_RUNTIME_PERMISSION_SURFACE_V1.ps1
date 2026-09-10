param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$AwsProfile = "casa-dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedMigrationCount = 30
$ExpectedAwsAccount = "938733852185"
$AwsRegion = "eu-west-1"

$ExpectedTeamId = "team_7WKcvFM29KYYE0xpbTILi05i"
$ExpectedProjectId = "prj_zPsDuVHD9lTXz3Z1D4noD4Cbl8Hr"

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-SafeSourceFiles {
    $extensions = @(
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"
    )

    return @(
        Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File |
        Where-Object {
            $extensions -contains $_.Extension.ToLowerInvariant() -and
            $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
            $_.FullName -notmatch '[\\/]\.next[\\/]' -and
            $_.FullName -notmatch '[\\/]\.casa-backups[\\/]' -and
            $_.FullName -notmatch '[\\/]dist[\\/]' -and
            $_.FullName -notmatch '[\\/]build[\\/]'
        }
    )
}

function Find-SourceMatches(
    [System.IO.FileInfo[]]$Files,
    [string]$Pattern
) {
    if (@($Files).Count -eq 0) {
        return @()
    }

    return @(
        Select-String `
            -Path @($Files.FullName) `
            -Pattern $Pattern `
            -AllMatches `
            -ErrorAction SilentlyContinue
    )
}

Write-Host "CASA School - Vercel OIDC + AWS Runtime Permission Surface V1" -ForegroundColor Green
Write-Host "Read-only source/AWS readiness proof before IAM creation."
Write-Host "Enumerates AWS SDK usage and checks whether Vercel OIDC credentials are already wired."
Write-Host "No source write. No Vercel mutation. No AWS IAM/S3 mutation. No DB connection. No migration. No deployment."

try {
    Step "Locking exact CASA source and local Vercel binding"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "CASA repository not found."
    }

    Set-Location $ProjectRoot

    foreach ($command in @("git", "aws")) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            Fail "$command is not available."
        }
    }

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()

    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    $migrationCount = @(
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

    $linkPath = Join-Path $ProjectRoot ".vercel\project.json"

    if (-not (Test-Path -LiteralPath $linkPath -PathType Leaf)) {
        Fail "Local Vercel project binding is missing."
    }

    try {
        $linkJson = Get-Content -LiteralPath $linkPath -Raw | ConvertFrom-Json
    }
    catch {
        Fail ".vercel/project.json is invalid JSON."
    }

    if (
        [string]$linkJson.orgId -ne $ExpectedTeamId -or
        [string]$linkJson.projectId -ne $ExpectedProjectId
    ) {
        Fail "Local Vercel binding drift."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  Vercel team ID:                 $ExpectedTeamId / VERIFIED"
    Write-Host "  Vercel project ID:              $ExpectedProjectId / VERIFIED"

    Step "Locking AWS caller identity read-only"

    $identityText = @(
        & aws sts get-caller-identity `
            --profile $AwsProfile `
            --region $AwsRegion `
            --output json `
            --no-cli-pager
    ) -join "`n"

    if ($LASTEXITCODE -ne 0) {
        Fail "AWS caller identity failed."
    }

    try {
        $identity = $identityText | ConvertFrom-Json
    }
    catch {
        Fail "AWS caller identity returned invalid JSON."
    }

    if ([string]$identity.Account -ne $ExpectedAwsAccount) {
        Fail "AWS account mismatch."
    }

    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  AWS region:                     $AwsRegion"

    Step "Enumerating AWS SDK runtime surface from source"

    $sourceFiles = @(Get-SafeSourceFiles)

    Write-Host "  source files inspected:         $(@($sourceFiles).Count)"

    $awsCommandNames = @(
        "PutObjectCommand",
        "GetObjectCommand",
        "DeleteObjectCommand",
        "HeadObjectCommand",
        "ListObjectsV2Command",
        "CreateMultipartUploadCommand",
        "UploadPartCommand",
        "CompleteMultipartUploadCommand",
        "AbortMultipartUploadCommand",
        "CompareFacesCommand",
        "IndexFacesCommand",
        "SearchFacesByImageCommand",
        "SearchFacesCommand",
        "DeleteFacesCommand",
        "ListFacesCommand",
        "CreateCollectionCommand",
        "DeleteCollectionCommand",
        "DescribeCollectionCommand",
        "StartFaceLivenessSessionCommand",
        "GetFaceLivenessSessionResultsCommand"
    )

    $foundCommands = @()

    foreach ($commandName in $awsCommandNames) {
        $matches = @(
            Find-SourceMatches `
                $sourceFiles `
                ("\b" + [regex]::Escape($commandName) + "\b")
        )

        if (@($matches).Count -gt 0) {
            $foundCommands += $commandName
            Write-Host "  AWS command:                    $commandName"

            foreach ($match in @($matches | Select-Object -First 5)) {
                $relative = $match.Path.Substring($ProjectRoot.Length).TrimStart('\')
                Write-Host "    $relative`:$($match.LineNumber)"
            }
        }
    }

    $foundCommands = @($foundCommands | Sort-Object -Unique)

    $s3ClientMatches = @(
        Find-SourceMatches $sourceFiles '\bS3Client\b'
    )

    $rekognitionClientMatches = @(
        Find-SourceMatches $sourceFiles '\bRekognitionClient\b'
    )

    Write-Host "  S3Client references:            $(@($s3ClientMatches).Count)"
    Write-Host "  RekognitionClient references:   $(@($rekognitionClientMatches).Count)"
    Write-Host "  distinct AWS commands:          $(@($foundCommands).Count)"

    Step "Checking Vercel OIDC source integration"

    $oidcPackageMatches = @(
        Find-SourceMatches `
            $sourceFiles `
            '@vercel/oidc-aws-credentials-provider'
    )

    $oidcProviderMatches = @(
        Find-SourceMatches `
            $sourceFiles `
            '\bawsCredentialsProvider\b'
    )

    $roleArnMatches = @(
        Find-SourceMatches `
            $sourceFiles `
            '\bAWS_ROLE_ARN\b'
    )

    $vercelTokenMatches = @(
        Find-SourceMatches `
            $sourceFiles `
            '\bVERCEL_OIDC_TOKEN\b|\bx-vercel-oidc-token\b'
    )

    $packagePath = Join-Path $ProjectRoot "package.json"
    $packageHasOidcProvider = $false

    if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
        try {
            $packageJson = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
        }
        catch {
            Fail "package.json is invalid JSON."
        }

        foreach ($sectionName in @("dependencies", "devDependencies", "optionalDependencies")) {
            $section = $packageJson.PSObject.Properties[$sectionName]

            if (
                $null -ne $section -and
                $null -ne $section.Value -and
                $null -ne $section.Value.PSObject.Properties[
                    "@vercel/oidc-aws-credentials-provider"
                ]
            ) {
                $packageHasOidcProvider = $true
            }
        }
    }

    Write-Host "  OIDC package in package.json:   $(if ($packageHasOidcProvider) { 'YES' } else { 'NO' })"
    Write-Host "  OIDC package source refs:       $(@($oidcPackageMatches).Count)"
    Write-Host "  awsCredentialsProvider refs:    $(@($oidcProviderMatches).Count)"
    Write-Host "  AWS_ROLE_ARN refs:              $(@($roleArnMatches).Count)"
    Write-Host "  Vercel OIDC token refs:         $(@($vercelTokenMatches).Count)"

    if (@($oidcProviderMatches).Count -gt 0) {
        foreach ($match in @($oidcProviderMatches | Select-Object -First 10)) {
            $relative = $match.Path.Substring($ProjectRoot.Length).TrimStart('\')
            Write-Host "    OIDC provider: $relative`:$($match.LineNumber)"
        }
    }

    $classification = $null

    if (
        @($foundCommands).Count -eq 0 -and
        @($s3ClientMatches).Count -eq 0 -and
        @($rekognitionClientMatches).Count -eq 0
    ) {
        $classification =
            "NO_AWS_RUNTIME_USAGE_FOUND__STOP_BEFORE_IAM_POLICY"
    }
    elseif (
        $packageHasOidcProvider -and
        @($oidcProviderMatches).Count -gt 0 -and
        @($roleArnMatches).Count -gt 0
    ) {
        $classification =
            "AWS_RUNTIME_AND_VERCEL_OIDC_PROVIDER_WIRING_FOUND__READY_TO_DERIVE_LEAST_PRIVILEGE_IAM"
    }
    else {
        $classification =
            "AWS_RUNTIME_FOUND__VERCEL_OIDC_SOURCE_ADAPTER_REQUIRED_BEFORE_LIVE_IAM_USE"
    }

    Write-Host ""
    Write-Host "CASA VERCEL OIDC + AWS RUNTIME PERMISSION SURFACE V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  distinct AWS commands found:    $(@($foundCommands).Count)"
    Write-Host "  OIDC provider package present:  $(if ($packageHasOidcProvider) { 'YES' } else { 'NO' })"
    Write-Host "  classification:                 $classification"
    Write-Host "  source mutation:                NONE / READ ONLY"
    Write-Host "  Vercel mutation:                NONE / READ ONLY"
    Write-Host "  AWS IAM/S3 mutation:            NONE / READ ONLY"
    Write-Host "  DB/migration/deployment:        NONE"
    Write-Host ""
    Write-Host "NEXT: return this complete output. It gives the exact AWS command surface and confirms whether CASA already has the Vercel OIDC credential adapter required before IAM goes live." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL OIDC + AWS RUNTIME PERMISSION SURFACE V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No source, Vercel, AWS IAM/S3, DB, migration, or deployment mutation was authorized by this probe."
    throw
}
