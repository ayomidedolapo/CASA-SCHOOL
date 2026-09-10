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
$StagingBackup = $null
$ProductionBackup = $null
$ProductionExisted = $false
$EnvMutationStarted = $false
$Validated = $false

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
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $output = @(& aws @Arguments 2> $stderr)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $rawError =
        if (Test-Path -LiteralPath $stderr) {
            Get-Content `
                -LiteralPath $stderr `
                -Raw `
                -ErrorAction SilentlyContinue
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
    $lines =
        Invoke-AwsRaw `
            (@($Arguments) + @(
                "--output",
                "json",
                "--no-cli-pager"
            )) `
            $Label

    $text =
        ($lines -join "`n").Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $text
        )
    ) {
        Fail "$Label returned no JSON."
    }

    try {
        return ($text | ConvertFrom-Json)
    }
    catch {
        Fail "$Label returned invalid JSON."
    }
}

function Assert-Ignored([string]$Relative) {
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & git check-ignore -q --no-index -- $Relative
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    if ($exitCode -ne 0) {
        Fail "$Relative is not Git-ignored."
    }
}

function Load-Lines([string]$Path) {
    $list =
        New-Object "System.Collections.Generic.List[string]"

    if (
        Test-Path `
            -LiteralPath $Path `
            -PathType Leaf
    ) {
        foreach (
            $line in
            [System.IO.File]::ReadAllLines(
                $Path
            )
        ) {
            [void]$list.Add(
                [string]$line
            )
        }
    }

    # Prevent PowerShell from enumerating the List[string] into scalar output
    # when the env file contains only one line.
    Write-Output `
        -NoEnumerate `
        $list
}

function Save-Lines(
    [string]$Path,
    [System.Collections.Generic.List[string]]$Lines
) {
    [System.IO.File]::WriteAllLines(
        $Path,
        [string[]]$Lines.ToArray(),
        $Utf8NoBom
    )
}

function Set-EnvValue(
    [string]$Path,
    [string]$Name,
    [string]$Value
) {
    $lines =
        Load-Lines $Path

    if (
        $null -eq $lines -or
        -not (
            $lines -is
            [System.Collections.Generic.List[string]]
        )
    ) {
        Fail "Environment line loader did not return List[string] for $Path."
    }

    $pattern =
        "^\s*" +
        [regex]::Escape($Name) +
        "\s*="

    $matches =
        New-Object "System.Collections.Generic.List[int]"

    for (
        $i = 0;
        $i -lt $lines.Count;
        $i++
    ) {
        if (
            [string]$lines[$i] -match
            $pattern
        ) {
            [void]$matches.Add($i)
        }
    }

    if ($matches.Count -gt 1) {
        Fail "Duplicate $Name entries found in $Path."
    }

    $replacement =
        "$Name=$Value"

    if ($matches.Count -eq 1) {
        $lines[$matches[0]] =
            $replacement
    }
    else {
        [void]$lines.Add(
            $replacement
        )
    }

    Save-Lines $Path $lines
}

function Remove-EnvValue(
    [string]$Path,
    [string]$Name
) {
    $source =
        Load-Lines $Path

    if (
        $null -eq $source -or
        -not (
            $source -is
            [System.Collections.Generic.List[string]]
        )
    ) {
        Fail "Environment line loader did not return List[string] for $Path."
    }

    $pattern =
        "^\s*" +
        [regex]::Escape($Name) +
        "\s*="

    $filtered =
        New-Object "System.Collections.Generic.List[string]"

    foreach ($line in $source) {
        if (
            [string]$line -notmatch
            $pattern
        ) {
            [void]$filtered.Add(
                [string]$line
            )
        }
    }

    Save-Lines $Path $filtered
}

function Read-EnvMap([string]$Path) {
    $map = @{}

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
            $map.ContainsKey($name)
        ) {
            Fail "Duplicate environment key $name found in $Path."
        }

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

        $map[$name] = $value
    }

    return $map
}

function Verify-Bucket(
    [string]$Bucket,
    [string]$EnvironmentName
) {
    Step "Read-only verification of $EnvironmentName S3"

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
            "$EnvironmentName bucket location"

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
            "$EnvironmentName public access block"

    $pc =
        $public.PublicAccessBlockConfiguration

    if (
        -not $pc.BlockPublicAcls -or
        -not $pc.IgnorePublicAcls -or
        -not $pc.BlockPublicPolicy -or
        -not $pc.RestrictPublicBuckets
    ) {
        Fail "$EnvironmentName Block Public Access is incomplete."
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
            "$EnvironmentName versioning"

    if (
        [string]$version.Status -ne
        "Enabled"
    ) {
        Fail "$EnvironmentName versioning is not enabled."
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
            "$EnvironmentName encryption"

    $algorithm =
        [string]$encryption.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm

    if ($algorithm -ne "AES256") {
        Fail "$EnvironmentName encryption is not AES256."
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
            "$EnvironmentName ownership controls"

    if (
        [string]$ownership.OwnershipControls.Rules[0].ObjectOwnership -ne
        "BucketOwnerEnforced"
    ) {
        Fail "$EnvironmentName Object Ownership is not BucketOwnerEnforced."
    }

    $tags =
        Invoke-AwsJson `
            @(
                "s3api",
                "get-bucket-tagging",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion
            ) `
            "$EnvironmentName bucket tags"

    $tagMap = @{}

    foreach ($tag in @($tags.TagSet)) {
        $tagMap[[string]$tag.Key] =
            [string]$tag.Value
    }

    if (
        [string]$tagMap["Project"] -ne "CASA-School" -or
        [string]$tagMap["Environment"] -ne $EnvironmentName -or
        [string]$tagMap["Purpose"] -ne "Private-Card-Artifacts"
    ) {
        Fail "$EnvironmentName bucket tags are not the expected CASA environment tags."
    }

    $policy =
        Invoke-AwsRaw `
            @(
                "s3api",
                "get-bucket-policy",
                "--bucket",
                $Bucket,
                "--profile",
                $LoginProfile,
                "--region",
                $AwsRegion,
                "--query",
                "Policy",
                "--output",
                "text",
                "--no-cli-pager"
            ) `
            "$EnvironmentName TLS policy"

    $policyText =
        ($policy -join "`n")

    if (
        -not $policyText.Contains(
            "DenyInsecureTransport"
        ) -or
        -not $policyText.Contains(
            "aws:SecureTransport"
        )
    ) {
        Fail "$EnvironmentName TLS-only bucket policy is missing."
    }

    Write-Host "  bucket:                         EXISTS / OWNED"
    Write-Host "  region:                         $AwsRegion"
    Write-Host "  Block Public Access:            ENFORCED"
    Write-Host "  default encryption:             AES256"
    Write-Host "  versioning:                     ENABLED"
    Write-Host "  Object Ownership:               BUCKET OWNER ENFORCED"
    Write-Host "  transport:                      TLS ONLY"
    Write-Host "  CASA environment tags:          VERIFIED"
}

function Configure-Env(
    [string]$Path,
    [string]$Bucket,
    [string]$Prefix,
    [string]$EnvironmentName
) {
    Step "Writing $EnvironmentName AWS environment configuration"

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
        $Prefix

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
                $Prefix
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
            Fail "$EnvironmentName env verification failed for $name."
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
        Fail "$EnvironmentName env contains forbidden custom S3 endpoint/path-style overrides."
    }

    Write-Host "  card storage bucket:            CONFIGURED"
    Write-Host "  card storage region:            $AwsRegion"
    Write-Host "  Rekognition region:             $AwsRegion"
    Write-Host "  Rekognition collection prefix:  $Prefix"
    Write-Host "  biometric provider:             AWS_REKOGNITION"
}

function Restore-EnvFiles {
    if (
        -not $EnvMutationStarted -or
        $Validated
    ) {
        return
    }

    Write-Host ""
    Write-Host "==> Rolling back local env writes" -ForegroundColor Yellow

    if (
        $StagingBackup -and
        (
            Test-Path `
                -LiteralPath $StagingBackup `
                -PathType Leaf
        )
    ) {
        Copy-Item `
            -LiteralPath $StagingBackup `
            -Destination $StagingEnvPath `
            -Force

        Write-Host "  .env.staging.local: RESTORED"
    }

    if ($ProductionExisted) {
        if (
            $ProductionBackup -and
            (
                Test-Path `
                    -LiteralPath $ProductionBackup `
                    -PathType Leaf
            )
        ) {
            Copy-Item `
                -LiteralPath $ProductionBackup `
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

Write-Host "CASA School - Staging + Production S3 Environment Finalization V1R1" -ForegroundColor Green
Write-Host "Read-only AWS verification of the already-created Staging and Production buckets, followed by guarded local environment-file configuration."
Write-Host "No S3 mutation. No IAM mutation. No DB connection. No migration. No deployment. No Production runtime activation."

try {
    Step "Locking CASA source and local env authority"

    if (
        -not (
            Test-Path `
                -LiteralPath $ProjectRoot `
                -PathType Container
        )
    ) {
        Fail "CASA repository not found."
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
            Fail "$command is unavailable."
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

    $migrationCount =
        @(
            Get-ChildItem `
                -LiteralPath (
                    Join-Path $ProjectRoot "drizzle"
                ) `
                -Recurse `
                -File `
                -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
            }
        ).Count

    if ($migrationCount -ne 30) {
        Fail "Expected 30 migrations; found $migrationCount."
    }

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

    Write-Host "  branch/head:                    $branch/$head"
    Write-Host "  migrations:                     30 / VERIFIED"
    Write-Host "  Staging env ignore:             VERIFIED"
    Write-Host "  Production env ignore:          VERIFIED"

    Step "Locking AWS account identity"

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
        Fail "AWS account mismatch."
    }

    Write-Host "  AWS account:                    $ExpectedAccountId / VERIFIED"
    Write-Host "  region:                         $AwsRegion"
    Write-Host "  administrative profile:         $LoginProfile"

    Verify-Bucket `
        $StagingBucket `
        "Staging"

    Verify-Bucket `
        $ProductionBucket `
        "Production"

    Step "Creating local env rollback evidence"

    $stamp =
        Get-Date -Format "yyyyMMdd-HHmmss"

    $Evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\staging-production-s3-env-finalize-v1r1-$stamp"

    New-Item `
        -ItemType Directory `
        -Path $Evidence `
        -Force |
        Out-Null

    $StagingBackup =
        Join-Path `
            $Evidence `
            "env.staging.local.before"

    Copy-Item `
        -LiteralPath $StagingEnvPath `
        -Destination $StagingBackup `
        -Force

    $ProductionExisted =
        Test-Path `
            -LiteralPath $ProductionEnvPath `
            -PathType Leaf

    if ($ProductionExisted) {
        $ProductionBackup =
            Join-Path `
                $Evidence `
                "env.production.local.before"

        Copy-Item `
            -LiteralPath $ProductionEnvPath `
            -Destination $ProductionBackup `
            -Force
    }
    else {
        [System.IO.File]::WriteAllText(
            $ProductionEnvPath,
            "",
            $Utf8NoBom
        )
    }

    $EnvMutationStarted = $true

    Configure-Env `
        $StagingEnvPath `
        $StagingBucket `
        "casa-school-staging" `
        "Staging"

    Configure-Env `
        $ProductionEnvPath `
        $ProductionBucket `
        "casa-school-production" `
        "Production"

    Step "Final environment isolation proof"

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
        Fail "Staging and Production bucket env values are identical."
    }

    if (
        [string]$staging[
            "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
        ] -eq
        [string]$production[
            "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
        ]
    ) {
        Fail "Staging and Production Rekognition prefixes are identical."
    }

    if (
        $staging.ContainsKey(
            "DATABASE_URL"
        )
    ) {
        Write-Host "  Staging DATABASE_URL:           PRESERVED / VALUE HIDDEN"
    }
    else {
        Write-Host "  Staging DATABASE_URL:           NOT PRESENT"
    }

    if (
        $production.ContainsKey(
            "DATABASE_URL"
        )
    ) {
        Write-Host "  Production DATABASE_URL:        PRESENT / VALUE HIDDEN"
    }
    else {
        Write-Host "  Production DATABASE_URL:        NOT YET CONFIGURED"
    }

    $result =
        [ordered]@{
            createdAt =
                (Get-Date -Format o)
            proof =
                "CASA_STAGING_PRODUCTION_S3_ENV_FINALIZATION_V1R1"
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
                bucketVerified =
                    $true
                envConfigured =
                    $true
                collectionPrefix =
                    "casa-school-staging"
            }
            production = [ordered]@{
                bucket =
                    $ProductionBucket
                bucketVerified =
                    $true
                envConfigured =
                    $true
                collectionPrefix =
                    "casa-school-production"
            }
            awsMutation =
                $false
            localEnvMutation =
                $true
            databaseConnection =
                $false
            migrationMutation =
                $false
            deploymentMutation =
                $false
            productionRuntimeActivation =
                $false
        }

    $json =
        $result |
            ConvertTo-Json -Depth 12

    [System.IO.File]::WriteAllText(
        (Join-Path $Evidence "RESULT.json"),
        $json,
        $Utf8NoBom
    )

    $Validated = $true

    Write-Host ""
    Write-Host "CASA STAGING + PRODUCTION S3 ENVIRONMENT FINALIZATION V1R1 IS GREEN" -ForegroundColor Green
    Write-Host "  source authority:               $branch/$head"
    Write-Host "  Staging S3:                     EXISTS / PRIVATE / HARDENED / VERIFIED"
    Write-Host "  Production S3:                  EXISTS / PRIVATE / HARDENED / VERIFIED"
    Write-Host "  .env.staging.local:             S3 + REKOGNITION ENV CONFIGURED"
    Write-Host "  .env.production.local:          S3 + REKOGNITION ENV CONFIGURED"
    Write-Host "  Staging collection namespace:   casa-school-staging-*"
    Write-Host "  Production collection namespace:casa-school-production-*"
    Write-Host "  AWS mutation during this run:   NONE / READ ONLY"
    Write-Host "  DB/migration mutation:          NONE"
    Write-Host "  deployment mutation:            NONE"
    Write-Host "  Production runtime activation:  NO"
    Write-Host "  evidence:                       $Evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete GREEN output. Then Staging and Production S3/environment setup is CLOSED and we proceed to Vercel OIDC/IAM binding." -ForegroundColor Yellow
}
catch {
    Restore-EnvFiles

    Write-Host ""
    Write-Host "CASA STAGING + PRODUCTION S3 ENVIRONMENT FINALIZATION V1R1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red

    if ($Evidence) {
        Write-Host "Evidence: $Evidence"
    }

    Write-Host "AWS mutation during this finalizer: NONE."

    throw
}
