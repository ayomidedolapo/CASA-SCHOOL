param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$LoginProfile = "casa-dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "1710b4f"
$ExpectedAccountId = "938733852185"
$AwsRegion = "eu-west-1"

$StagingBucket =
    "casa-school-staging-card-artifacts-$ExpectedAccountId-$AwsRegion"
$ProductionBucket =
    "casa-school-production-card-artifacts-$ExpectedAccountId-$AwsRegion"

$StagingEnvPath =
    Join-Path $ProjectRoot ".env.staging.local"
$ProductionEnvPath =
    Join-Path $ProjectRoot ".env.production.local"

$Utf8NoBom =
    New-Object System.Text.UTF8Encoding($false)

$Evidence = $null
$StagingEnvBackup = $null
$ProductionEnvBackup = $null
$ProductionEnvExisted = $false
$EnvWriteStarted = $false

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-AwsRaw(
    [string[]]$Arguments,
    [string]$Label
) {
    $stderr =
        [IO.Path]::GetTempFileName()

    $previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        $output =
            @(
                & aws @Arguments 2> $stderr
            )

        $exitCode =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $previous
    }

    $errorText =
        if (
            Test-Path -LiteralPath $stderr
        ) {
            (
                Get-Content `
                    -LiteralPath $stderr `
                    -Raw
            ).Trim()
        }
        else {
            ""
        }

    Remove-Item `
        -LiteralPath $stderr `
        -Force `
        -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
        Fail "$Label failed. $errorText"
    }

    return @($output)
}

function Invoke-AwsJson(
    [string[]]$Arguments,
    [string]$Label
) {
    $all =
        @($Arguments) + @(
            "--output",
            "json",
            "--no-cli-pager"
        )

    $lines =
        Invoke-AwsRaw $all $Label

    $text =
        ($lines -join "`n").Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $text
        )
    ) {
        return $null
    }

    try {
        return (
            $text |
                ConvertFrom-Json
        )
    }
    catch {
        Fail "$Label returned invalid JSON."
    }
}

function Set-EnvValue(
    [string]$Path,
    [string]$Name,
    [string]$Value
) {
    $lines =
        if (
            Test-Path -LiteralPath $Path -PathType Leaf
        ) {
            @(
                [System.IO.File]::ReadAllLines(
                    $Path
                )
            )
        }
        else {
            @()
        }

    $pattern =
        "^\s*" +
        [regex]::Escape($Name) +
        "\s*="

    $matches =
        @(
            for (
                $i = 0;
                $i -lt $lines.Count;
                $i++
            ) {
                if (
                    $lines[$i] -match
                        $pattern
                ) {
                    $i
                }
            }
        )

    if ($matches.Count -gt 1) {
        Fail "Environment file has duplicate $Name entries: $Path"
    }

    $replacement =
        "$Name=$Value"

    if ($matches.Count -eq 1) {
        $lines[$matches[0]] =
            $replacement
    }
    else {
        $lines +=
            $replacement
    }

    [System.IO.File]::WriteAllLines(
        $Path,
        [string[]]$lines,
        $Utf8NoBom
    )
}

function Remove-EnvValue(
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
        return
    }

    $lines =
        @(
            [System.IO.File]::ReadAllLines(
                $Path
            )
        )

    $pattern =
        "^\s*" +
        [regex]::Escape($Name) +
        "\s*="

    $filtered =
        @(
            $lines |
                Where-Object {
                    $_ -notmatch
                        $pattern
                }
        )

    [System.IO.File]::WriteAllLines(
        $Path,
        [string[]]$filtered,
        $Utf8NoBom
    )
}

function Read-EnvMap(
    [string]$Path
) {
    $map =
        @{}

    if (
        -not (
            Test-Path `
                -LiteralPath $Path `
                -PathType Leaf
        )
    ) {
        return $map
    }

    foreach (
        $raw in
        [System.IO.File]::ReadAllLines(
            $Path
        )
    ) {
        $line =
            ([string]$raw).Trim()

        if (
            [string]::IsNullOrWhiteSpace(
                $line
            ) -or
            $line.StartsWith("#")
        ) {
            continue
        }

        $index =
            $line.IndexOf("=")

        if ($index -le 0) {
            continue
        }

        $name =
            $line.Substring(
                0,
                $index
            ).Trim()

        $value =
            $line.Substring(
                $index + 1
            ).Trim()

        if (
            (
                $value.StartsWith('"') -and
                $value.EndsWith('"')
            ) -or
            (
                $value.StartsWith("'") -and
                $value.EndsWith("'")
            )
        ) {
            $value =
                $value.Substring(
                    1,
                    $value.Length - 2
                )
        }

        $map[$name] =
            $value
    }

    return $map
}

function Assert-Ignored(
    [string]$Relative
) {
    $previous =
        $ErrorActionPreference

    try {
        $ErrorActionPreference =
            "Continue"

        & git check-ignore `
            -q `
            --no-index `
            -- `
            $Relative

        $exitCode =
            $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference =
            $previous
    }

    if ($exitCode -ne 0) {
        Fail "$Relative is not protected by .gitignore."
    }
}

function Configure-PrivateBucket(
    [string]$Bucket,
    [string]$EnvironmentName,
    [string[]]$OwnedBuckets
) {
    Step "Provisioning $EnvironmentName private CASA S3 bucket"

    $owned =
        $OwnedBuckets -contains
        $Bucket

    if (-not $owned) {
        Invoke-AwsRaw `
            @(
                "s3api",
                "create-bucket",
                "--bucket",
                $Bucket,
                "--region",
                $AwsRegion,
                "--create-bucket-configuration",
                "LocationConstraint=$AwsRegion",
                "--profile",
                $LoginProfile,
                "--no-cli-pager"
            ) `
            "create $EnvironmentName bucket" |
            Out-Null

        Write-Host "  bucket:                         CREATED"
    }
    else {
        Write-Host "  bucket:                         ALREADY OWNED / REUSED"
    }

    $PublicAccessPath =
        Join-Path `
            $Evidence `
            (
                $EnvironmentName.ToLowerInvariant() +
                "-public-access-block.json"
            )

    @'
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": true,
  "RestrictPublicBuckets": true
}
'@ |
        Set-Content `
            -LiteralPath $PublicAccessPath `
            -Encoding UTF8

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-public-access-block",
            "--bucket",
            $Bucket,
            "--public-access-block-configuration",
            ("file://" + $PublicAccessPath),
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "enforce $EnvironmentName public access block" |
        Out-Null

    $EncryptionPath =
        Join-Path `
            $Evidence `
            (
                $EnvironmentName.ToLowerInvariant() +
                "-bucket-encryption.json"
            )

    @'
{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": false
    }
  ]
}
'@ |
        Set-Content `
            -LiteralPath $EncryptionPath `
            -Encoding UTF8

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-bucket-encryption",
            "--bucket",
            $Bucket,
            "--server-side-encryption-configuration",
            ("file://" + $EncryptionPath),
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "configure $EnvironmentName encryption" |
        Out-Null

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-bucket-versioning",
            "--bucket",
            $Bucket,
            "--versioning-configuration",
            "Status=Enabled",
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "enable $EnvironmentName versioning" |
        Out-Null

    $OwnershipPath =
        Join-Path `
            $Evidence `
            (
                $EnvironmentName.ToLowerInvariant() +
                "-ownership.json"
            )

    @'
{
  "Rules": [
    {
      "ObjectOwnership": "BucketOwnerEnforced"
    }
  ]
}
'@ |
        Set-Content `
            -LiteralPath $OwnershipPath `
            -Encoding UTF8

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-bucket-ownership-controls",
            "--bucket",
            $Bucket,
            "--ownership-controls",
            ("file://" + $OwnershipPath),
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "enforce $EnvironmentName bucket ownership" |
        Out-Null

    $TagsPath =
        Join-Path `
            $Evidence `
            (
                $EnvironmentName.ToLowerInvariant() +
                "-tags.json"
            )

    @"
{
  "TagSet": [
    {
      "Key": "Project",
      "Value": "CASA-School"
    },
    {
      "Key": "Environment",
      "Value": "$EnvironmentName"
    },
    {
      "Key": "Purpose",
      "Value": "Private-Card-Artifacts"
    }
  ]
}
"@ |
        Set-Content `
            -LiteralPath $TagsPath `
            -Encoding UTF8

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-bucket-tagging",
            "--bucket",
            $Bucket,
            "--tagging",
            ("file://" + $TagsPath),
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "tag $EnvironmentName bucket" |
        Out-Null

    $PolicyPath =
        Join-Path `
            $Evidence `
            (
                $EnvironmentName.ToLowerInvariant() +
                "-tls-policy.json"
            )

    @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::$Bucket",
        "arn:aws:s3:::$Bucket/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
"@ |
        Set-Content `
            -LiteralPath $PolicyPath `
            -Encoding UTF8

    Invoke-AwsRaw `
        @(
            "s3api",
            "put-bucket-policy",
            "--bucket",
            $Bucket,
            "--policy",
            ("file://" + $PolicyPath),
            "--profile",
            $LoginProfile,
            "--region",
            $AwsRegion,
            "--no-cli-pager"
        ) `
        "enforce $EnvironmentName TLS-only policy" |
        Out-Null

    $location =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-bucket-location",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "verify $EnvironmentName bucket region"

    if (
        [string]$location.LocationConstraint -ne
        $AwsRegion
    ) {
        Fail "$EnvironmentName bucket region mismatch."
    }

    $public =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-public-access-block",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "verify $EnvironmentName public access block"

    $pc =
        $public.PublicAccessBlockConfiguration

    if (
        -not $pc.BlockPublicAcls -or
        -not $pc.IgnorePublicAcls -or
        -not $pc.BlockPublicPolicy -or
        -not $pc.RestrictPublicBuckets
    ) {
        Fail "$EnvironmentName bucket Public Access Block is incomplete."
    }

    $version =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-bucket-versioning",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "verify $EnvironmentName versioning"

    if (
        [string]$version.Status -ne
        "Enabled"
    ) {
        Fail "$EnvironmentName bucket versioning is not enabled."
    }

    $encryption =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-bucket-encryption",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "verify $EnvironmentName encryption"

    $algorithm =
        [string](
            $encryption
                .ServerSideEncryptionConfiguration
                .Rules[0]
                .ApplyServerSideEncryptionByDefault
                .SSEAlgorithm
        )

    if ($algorithm -ne "AES256") {
        Fail "$EnvironmentName bucket encryption is not AES256."
    }

    $ownership =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-bucket-ownership-controls",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "verify $EnvironmentName ownership controls"

    if (
        [string]$ownership.OwnershipControls.Rules[0].ObjectOwnership -ne
        "BucketOwnerEnforced"
    ) {
        Fail "$EnvironmentName bucket ownership is not BucketOwnerEnforced."
    }

    Write-Host "  region:                         $AwsRegion"
    Write-Host "  Block Public Access:            ENFORCED"
    Write-Host "  default encryption:             AES256"
    Write-Host "  versioning:                     ENABLED"
    Write-Host "  Object Ownership:               BUCKET OWNER ENFORCED"
    Write-Host "  transport:                      TLS ONLY"
}

function Configure-EnvironmentFile(
    [string]$Path,
    [string]$Bucket,
    [string]$CollectionPrefix,
    [string]$Label
) {
    Set-EnvValue `
        $Path `
        "CASA_BIOMETRIC_PROVIDER_MODE" `
        "AWS_REKOGNITION"

    Set-EnvValue `
        $Path `
        "CASA_AWS_REKOGNITION_REGION" `
        $AwsRegion

    Set-EnvValue `
        $Path `
        "CASA_AWS_REKOGNITION_COLLECTION_PREFIX" `
        $CollectionPrefix

    Set-EnvValue `
        $Path `
        "CASA_AWS_REKOGNITION_QUALITY_FILTER" `
        "AUTO"

    Set-EnvValue `
        $Path `
        "CASA_CARD_STORAGE_BUCKET" `
        $Bucket

    Set-EnvValue `
        $Path `
        "CASA_CARD_STORAGE_REGION" `
        $AwsRegion

    Set-EnvValue `
        $Path `
        "AWS_REGION" `
        $AwsRegion

    Set-EnvValue `
        $Path `
        "AWS_DEFAULT_REGION" `
        $AwsRegion

    Remove-EnvValue `
        $Path `
        "CASA_CARD_STORAGE_ENDPOINT"

    Remove-EnvValue `
        $Path `
        "CASA_CARD_STORAGE_FORCE_PATH_STYLE"

    $map =
        Read-EnvMap $Path

    $expected =
        [ordered]@{
            CASA_BIOMETRIC_PROVIDER_MODE =
                "AWS_REKOGNITION"
            CASA_AWS_REKOGNITION_REGION =
                $AwsRegion
            CASA_AWS_REKOGNITION_COLLECTION_PREFIX =
                $CollectionPrefix
            CASA_AWS_REKOGNITION_QUALITY_FILTER =
                "AUTO"
            CASA_CARD_STORAGE_BUCKET =
                $Bucket
            CASA_CARD_STORAGE_REGION =
                $AwsRegion
            AWS_REGION =
                $AwsRegion
            AWS_DEFAULT_REGION =
                $AwsRegion
        }

    foreach ($name in $expected.Keys) {
        if (
            -not $map.ContainsKey($name) -or
            [string]$map[$name] -ne
            [string]$expected[$name]
        ) {
            Fail "$Label environment postcondition failed for $name."
        }
    }

    if (
        $map.ContainsKey(
            "CASA_CARD_STORAGE_ENDPOINT"
        ) -or
        $map.ContainsKey(
            "CASA_CARD_STORAGE_FORCE_PATH_STYLE"
        )
    ) {
        Fail "$Label environment still contains non-AWS S3 endpoint overrides."
    }

    Write-Host "  $Label card bucket:              CONFIGURED"
    Write-Host "  $Label card region:              $AwsRegion"
    Write-Host "  $Label Rekognition prefix:       $CollectionPrefix"
    Write-Host "  $Label provider mode:            AWS_REKOGNITION"
}

Write-Host "CASA School - Staging + Production Private S3 and AWS Environment Scaffold V1R1" -ForegroundColor Green
Write-Host "Creates isolated private S3 buckets for Staging and Production and writes only non-secret AWS storage/namespace configuration to ignored environment files."
Write-Host "No database connection. No migration. No card/face/attendance operation. No Vercel deployment. No Production application runtime activation."
Write-Host "The Vercel OIDC runtime role and liveness streaming role remain intentionally unbound until the exact Vercel team/project identity exists; this does not block S3 creation."

try {
    Step "Locking CASA source checkpoint"

    if (
        -not (
            Test-Path `
                -LiteralPath $ProjectRoot `
                -PathType Container
        )
    ) {
        Fail "CASA repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    foreach ($command in @(
        "git",
        "aws"
    )) {
        if (
            -not (
                Get-Command `
                    $command `
                    -ErrorAction SilentlyContinue
            )
        ) {
            Fail "$command is not available."
        }
    }

    $branch =
        (& git branch --show-current).Trim()
    $head =
        (& git rev-parse --short=7 HEAD).Trim()

    if (
        $branch -ne $ExpectedBranch -or
        $head -ne $ExpectedHead
    ) {
        Fail "Git checkpoint drift: $branch/$head"
    }

    # S3/env provisioning is intentionally independent of the hosted OIDC
    # source package. OIDC roles are bound after the exact Vercel project exists.
    Assert-Ignored ".env.staging.local"
    Assert-Ignored ".env.production.local"

    if (
        -not (
            Test-Path `
                -LiteralPath $StagingEnvPath `
                -PathType Leaf
        )
    ) {
        Fail ".env.staging.local is missing."
    }

    $migrationFiles =
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
        )

    if ($migrationFiles.Count -ne 30) {
        Fail "Expected exactly 30 migrations; found $($migrationFiles.Count)."
    }

    Write-Host "  branch/head:                    $branch/$head"
    Write-Host "  migrations:                     30 / VERIFIED"
    Write-Host "  Staging env ignore:             VERIFIED"
    Write-Host "  Production env ignore:          VERIFIED"
    Write-Host "  hosted OIDC binding:            DEFERRED / NOT REQUIRED FOR S3 CREATION"

    Step "Locking AWS account identity"

    $profiles =
        @(
            & aws configure list-profiles
        )

    if (
        $profiles -notcontains
        $LoginProfile
    ) {
        Fail "AWS profile '$LoginProfile' is not configured."
    }

    $identity =
        Invoke-AwsJson `
            @(
                "sts",
                "get-caller-identity",
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "AWS caller identity"

    if (
        [string]$identity.Account -ne
        $ExpectedAccountId
    ) {
        Fail "AWS profile resolved to account $($identity.Account), expected $ExpectedAccountId."
    }

    Write-Host "  AWS account:                    $ExpectedAccountId / VERIFIED"
    Write-Host "  region:                         $AwsRegion"
    Write-Host "  administrative profile:         $LoginProfile"

    Step "Creating rollback evidence for local environment files"

    $stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\staging-production-s3-env-v1r1-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    $StagingEnvBackup =
        Join-Path `
            $Evidence `
            "env.staging.local.before"

    Copy-Item `
        -LiteralPath $StagingEnvPath `
        -Destination $StagingEnvBackup `
        -Force

    $ProductionEnvExisted =
        Test-Path `
            -LiteralPath $ProductionEnvPath `
            -PathType Leaf

    if ($ProductionEnvExisted) {
        $ProductionEnvBackup =
            Join-Path `
                $Evidence `
                "env.production.local.before"

        Copy-Item `
            -LiteralPath $ProductionEnvPath `
            -Destination $ProductionEnvBackup `
            -Force
    }

    Write-Host "  evidence:                       $Evidence"

    Step "Reading currently owned S3 buckets"

    $ownedJson =
        Invoke-AwsJson `
            @(
                "s3api",
                "list-buckets",
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "list owned S3 buckets"

    $ownedBuckets =
        @(
            $ownedJson.Buckets |
                ForEach-Object {
                    [string]$_.Name
                }
        )

    Configure-PrivateBucket `
        $StagingBucket `
        "Staging" `
        $ownedBuckets

    # Refresh after potential creation so Production check is authoritative.
    $ownedJson =
        Invoke-AwsJson `
            @(
                "s3api",
                "list-buckets",
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "refresh owned S3 buckets"

    $ownedBuckets =
        @(
            $ownedJson.Buckets |
                ForEach-Object {
                    [string]$_.Name
                }
        )

    Configure-PrivateBucket `
        $ProductionBucket `
        "Production" `
        $ownedBuckets

    Step "Writing isolated Staging and Production AWS environment scaffold"

    $EnvWriteStarted =
        $true

    Configure-EnvironmentFile `
        $StagingEnvPath `
        $StagingBucket `
        "casa-school-staging" `
        "Staging"

    if (
        -not $ProductionEnvExisted
    ) {
        [System.IO.File]::WriteAllText(
            $ProductionEnvPath,
            "",
            $Utf8NoBom
        )
    }

    Configure-EnvironmentFile `
        $ProductionEnvPath `
        $ProductionBucket `
        "casa-school-production" `
        "Production"

    Step "Proving environment separation and Git safety"

    $staging =
        Read-EnvMap $StagingEnvPath

    $production =
        Read-EnvMap $ProductionEnvPath

    if (
        [string]$staging[
            "CASA_CARD_STORAGE_BUCKET"
        ] -eq
        [string]$production[
            "CASA_CARD_STORAGE_BUCKET"
        ]
    ) {
        Fail "Staging and Production S3 buckets are not isolated."
    }

    if (
        [string]$staging[
            "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
        ] -eq
        [string]$production[
            "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
        ]
    ) {
        Fail "Staging and Production Rekognition namespaces are not isolated."
    }

    & git check-ignore `
        -q `
        --no-index `
        -- `
        ".env.staging.local"

    if ($LASTEXITCODE -ne 0) {
        Fail ".env.staging.local lost Git-ignore protection."
    }

    & git check-ignore `
        -q `
        --no-index `
        -- `
        ".env.production.local"

    if ($LASTEXITCODE -ne 0) {
        Fail ".env.production.local lost Git-ignore protection."
    }

    $result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_STAGING_PRODUCTION_PRIVATE_S3_ENV_V1R1"
            branch =
                $branch
            head =
                $head
            awsAccount =
                $ExpectedAccountId
            region =
                $AwsRegion
            staging = [ordered]@{
                bucket =
                    $StagingBucket
                collectionPrefix =
                    "casa-school-staging"
                envFile =
                    ".env.staging.local"
                private =
                    $true
                blockPublicAccess =
                    $true
                encryption =
                    "AES256"
                versioning =
                    "Enabled"
                objectOwnership =
                    "BucketOwnerEnforced"
            }
            production = [ordered]@{
                bucket =
                    $ProductionBucket
                collectionPrefix =
                    "casa-school-production"
                envFile =
                    ".env.production.local"
                private =
                    $true
                blockPublicAccess =
                    $true
                encryption =
                    "AES256"
                versioning =
                    "Enabled"
                objectOwnership =
                    "BucketOwnerEnforced"
            }
            vercelOidcRuntimeRole =
                "PENDING_EXACT_VERCEL_TEAM_PROJECT_BINDING"
            livenessStreamingRoles =
                "PENDING_EXACT_ENVIRONMENT_BINDING"
            databaseConnection =
                $false
            migrationMutation =
                $false
            productionRuntimeActivation =
                $false
        }

    $result |
        ConvertTo-Json -Depth 12 |
        Set-Content `
            -LiteralPath (
                Join-Path $Evidence "RESULT.json"
            ) `
            -Encoding UTF8

    Write-Host ""
    Write-Host "CASA STAGING + PRODUCTION PRIVATE S3 AND AWS ENVIRONMENT SCAFFOLD V1R1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  AWS account/region:             $ExpectedAccountId / $AwsRegion"
    Write-Host "  Staging private S3:             CREATED OR VERIFIED / CONFIGURED IN .env.staging.local"
    Write-Host "  Production private S3:          CREATED OR VERIFIED / CONFIGURED IN .env.production.local"
    Write-Host "  Block Public Access:            BOTH ENFORCED"
    Write-Host "  encryption:                     BOTH AES256"
    Write-Host "  versioning:                     BOTH ENABLED"
    Write-Host "  Object Ownership:               BOTH BUCKET OWNER ENFORCED"
    Write-Host "  Staging Rekognition namespace:  casa-school-staging-*"
    Write-Host "  Production Rekognition namespace:casa-school-production-*"
    Write-Host "  Vercel OIDC runtime roles:      PENDING EXACT PROJECT BINDING"
    Write-Host "  liveness streaming roles:       PENDING EXACT ENVIRONMENT BINDING"
    Write-Host "  DB/migration mutation:          NONE"
    Write-Host "  Production runtime activation:  NO"
    Write-Host "  evidence:                       $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete GREEN output. At that point both Staging and Production S3 are genuinely created and present in their local environment files; then we bind the exact Vercel OIDC/IAM roles." -ForegroundColor Yellow
}
catch {
    if ($EnvWriteStarted) {
        Write-Host ""
        Write-Host "==> Restoring local environment files after failed post-write validation" -ForegroundColor Yellow

        if (
            $StagingEnvBackup -and
            (
                Test-Path `
                    -LiteralPath $StagingEnvBackup `
                    -PathType Leaf
            )
        ) {
            Copy-Item `
                -LiteralPath $StagingEnvBackup `
                -Destination $StagingEnvPath `
                -Force
            Write-Host "  .env.staging.local: RESTORED"
        }

        if ($ProductionEnvExisted) {
            if (
                $ProductionEnvBackup -and
                (
                    Test-Path `
                        -LiteralPath $ProductionEnvBackup `
                        -PathType Leaf
                )
            ) {
                Copy-Item `
                    -LiteralPath $ProductionEnvBackup `
                    -Destination $ProductionEnvPath `
                    -Force
                Write-Host "  .env.production.local: RESTORED"
            }
        }
        else {
            Remove-Item `
                -LiteralPath $ProductionEnvPath `
                -Force `
                -ErrorAction SilentlyContinue
            Write-Host "  new .env.production.local: REMOVED"
        }
    }

    Write-Host ""
    Write-Host "CASA STAGING + PRODUCTION PRIVATE S3 AND AWS ENVIRONMENT SCAFFOLD V1R1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    Write-Host "NOTE: S3 operations are idempotent. If this stopped after bucket creation, the created private bucket may remain safely in AWS and a corrected rerun will verify/reuse it."

    throw
}