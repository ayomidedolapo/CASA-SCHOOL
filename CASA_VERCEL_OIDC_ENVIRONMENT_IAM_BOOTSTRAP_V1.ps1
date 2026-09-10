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

$TeamSlug = "ayomidedolapos-projects"
$ProjectName = "casa-school"
$IssuerUrl = "https://oidc.vercel.com/$TeamSlug"
$ProviderHostPath = "oidc.vercel.com/$TeamSlug"
$ProviderArn = "arn:aws:iam::$ExpectedAwsAccount`:oidc-provider/$ProviderHostPath"
$Audience = "sts.amazonaws.com"

$StagingSubject = "owner:$TeamSlug`:project:$ProjectName`:environment:preview"
$ProductionSubject = "owner:$TeamSlug`:project:$ProjectName`:environment:production"

$StagingBucket = "casa-school-staging-card-artifacts-938733852185-eu-west-1"
$ProductionBucket = "casa-school-production-card-artifacts-938733852185-eu-west-1"

$StagingCollectionPrefix = "casa-school-staging"
$ProductionCollectionPrefix = "casa-school-production"

$StagingRuntimeRoleName = "CASA-School-Vercel-Staging-Runtime"
$ProductionRuntimeRoleName = "CASA-School-Vercel-Production-Runtime"
$StagingStreamRoleName = "CASA-School-Staging-Liveness-Stream"
$ProductionStreamRoleName = "CASA-School-Production-Liveness-Stream"

$StagingRuntimePolicyName = "CASA-School-Staging-Runtime-Access"
$ProductionRuntimePolicyName = "CASA-School-Production-Runtime-Access"
$StagingStreamPolicyName = "CASA-School-Staging-Liveness-Stream-Access"
$ProductionStreamPolicyName = "CASA-School-Production-Liveness-Stream-Access"

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

        $map[$name] = $value
    }

    return $map
}

function Invoke-Aws(
    [string[]]$Arguments,
    [string]$Label,
    [switch]$AllowFailure
) {
    $stderr = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $stdout = @(
            & aws @Arguments `
                --profile $AwsProfile `
                --region $AwsRegion `
                --no-cli-pager `
                2> $stderr
        )
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $errorText =
        if (Test-Path -LiteralPath $stderr) {
            (
                Get-Content `
                    -LiteralPath $stderr `
                    -Raw `
                    -ErrorAction SilentlyContinue
            )
        }
        else {
            ""
        }

    Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue

    $errorText =
        if ($null -eq $errorText) {
            ""
        }
        else {
            ([string]$errorText).Trim()
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

function Parse-Json(
    [object]$Result,
    [string]$Label
) {
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

function Get-RoleState([string]$RoleName) {
    $result =
        Invoke-Aws `
            @(
                "iam",
                "get-role",
                "--role-name",
                $RoleName,
                "--output",
                "json"
            ) `
            "Get IAM role $RoleName" `
            -AllowFailure

    if ($result.ok) {
        return [pscustomobject]@{
            exists = $true
            json = (Parse-Json $result "Get IAM role $RoleName")
        }
    }

    if ($result.stderr -match "NoSuchEntity") {
        return [pscustomobject]@{
            exists = $false
            json = $null
        }
    }

    Fail "Unable to determine role state for $RoleName. $($result.stderr)"
}

function Write-JsonFile(
    [string]$Path,
    [object]$Value
) {
    [System.IO.File]::WriteAllText(
        $Path,
        ($Value | ConvertTo-Json -Depth 30),
        $Utf8NoBom
    )
}

function Assert-SimulationDecision(
    [string]$PolicySourceArn,
    [string]$Action,
    [string]$ResourceArn,
    [string]$Expected,
    [string]$Label
) {
    $result =
        Invoke-Aws `
            @(
                "iam",
                "simulate-principal-policy",
                "--policy-source-arn",
                $PolicySourceArn,
                "--action-names",
                $Action,
                "--resource-arns",
                $ResourceArn,
                "--output",
                "json"
            ) `
            "IAM simulation $Label"

    $json = Parse-Json $result "IAM simulation $Label"

    $decision =
        [string]$json.EvaluationResults[0].EvalDecision

    if ($decision -ne $Expected) {
        Fail "$Label expected $Expected but IAM simulator returned $decision."
    }

    Write-Host "  $Label`: $decision / VERIFIED"
}

Write-Host "CASA School - Vercel OIDC + Environment IAM Bootstrap V1" -ForegroundColor Green
Write-Host "Creates the Team-scoped Vercel OIDC provider plus isolated Staging/Production runtime and Face Liveness stream roles."
Write-Host "Staging trust = Vercel Preview. Production trust = Vercel Production."
Write-Host "This script MUTATES AWS IAM only. It does not mutate S3/Rekognition data, Vercel, DB, migrations, deployment, or CASA source."

try {
    Step "Locking CASA source/OIDC/environment authority before AWS mutation"

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

    $helperPath =
        Join-Path `
            $ProjectRoot `
            "src\server\aws\vercel-oidc-credentials.ts"

    $rekognitionPath =
        Join-Path `
            $ProjectRoot `
            "src\server\biometrics\aws-rekognition.ts"

    $storagePath =
        Join-Path `
            $ProjectRoot `
            "src\server\card-production\storage.ts"

    foreach ($path in @($helperPath, $rekognitionPath, $storagePath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Fail "Required source file missing: $path"
        }
    }

    $helper = [System.IO.File]::ReadAllText($helperPath)
    $rekognition = [System.IO.File]::ReadAllText($rekognitionPath)
    $storage = [System.IO.File]::ReadAllText($storagePath)

    if (
        $helper -notmatch "@vercel/oidc-aws-credentials-provider" -or
        $helper -notmatch "AWS_ROLE_ARN" -or
        $helper -notmatch [regex]::Escape('"sts.amazonaws.com"')
    ) {
        Fail "Vercel OIDC helper is not at the proven custom-audience state."
    }

    if (
        $storage -notmatch "getVercelOidcAwsCredentials" -or
        $rekognition -notmatch "getVercelOidcAwsCredentials" -or
        $rekognition -notmatch "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
    ) {
        Fail "AWS client/OIDC/Rekognition namespace source wiring is incomplete."
    }

    $stagingEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.staging.local")

    $productionEnv =
        Read-EnvMap `
            (Join-Path $ProjectRoot ".env.production.local")

    if (
        [string]$stagingEnv["CASA_CARD_STORAGE_BUCKET"] -ne $StagingBucket -or
        [string]$productionEnv["CASA_CARD_STORAGE_BUCKET"] -ne $ProductionBucket
    ) {
        Fail "Local S3 environment authority drift."
    }

    if (
        [string]$stagingEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne
            $StagingCollectionPrefix -or
        [string]$productionEnv["CASA_AWS_REKOGNITION_COLLECTION_PREFIX"] -ne
            $ProductionCollectionPrefix
    ) {
        Fail "Local Rekognition namespace authority drift."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  OIDC source audience:           $Audience / VERIFIED"
    Write-Host "  Staging bucket/prefix:          VERIFIED"
    Write-Host "  Production bucket/prefix:       VERIFIED"

    Step "Locking AWS account and infrastructure identity"

    $identity =
        Parse-Json `
            (
                Invoke-Aws `
                    @(
                        "sts",
                        "get-caller-identity",
                        "--output",
                        "json"
                    ) `
                    "AWS caller identity"
            ) `
            "AWS caller identity"

    if ([string]$identity.Account -ne $ExpectedAwsAccount) {
        Fail "AWS account mismatch."
    }

    foreach ($bucket in @($StagingBucket, $ProductionBucket)) {
        $headBucket =
            Invoke-Aws `
                @(
                    "s3api",
                    "head-bucket",
                    "--bucket",
                    $bucket
                ) `
                "S3 bucket proof $bucket" `
                -AllowFailure

        if (-not $headBucket.ok) {
            Fail "Required bucket is not accessible: $bucket. $($headBucket.stderr)"
        }
    }

    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  AWS region:                     $AwsRegion"
    Write-Host "  Staging S3 bucket:              EXISTS / VERIFIED"
    Write-Host "  Production S3 bucket:           EXISTS / VERIFIED"

    Step "Proving Vercel Team OIDC discovery endpoint"

    try {
        $discovery =
            Invoke-RestMethod `
                -Uri "$IssuerUrl/.well-known/openid-configuration" `
                -Method Get
    }
    catch {
        Fail "Unable to read Vercel Team OIDC discovery endpoint: $($_.Exception.Message)"
    }

    if ([string]$discovery.issuer -ne $IssuerUrl) {
        Fail "Vercel Team OIDC discovery issuer mismatch: $($discovery.issuer)"
    }

    if ([string]::IsNullOrWhiteSpace([string]$discovery.jwks_uri)) {
        Fail "Vercel Team OIDC discovery did not return jwks_uri."
    }

    Write-Host "  issuer:                         $IssuerUrl / VERIFIED"
    Write-Host "  JWKS discovery:                 VERIFIED"
    Write-Host "  requested AWS audience:         $Audience"
    Write-Host "  Staging subject:                $StagingSubject"
    Write-Host "  Production subject:             $ProductionSubject"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\vercel-oidc-environment-iam-bootstrap-v1-$stamp"

    New-Item -ItemType Directory -Path $evidence -Force | Out-Null

    Step "Preparing exact IAM trust and permission documents"

    $oidcConditionPrefix = $ProviderHostPath

    function New-RuntimeTrust([string]$Subject) {
        return [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "VercelOidcExactEnvironment"
                    Effect = "Allow"
                    Principal = [ordered]@{
                        Federated = $ProviderArn
                    }
                    Action = "sts:AssumeRoleWithWebIdentity"
                    Condition = [ordered]@{
                        StringEquals = [ordered]@{
                            "$oidcConditionPrefix`:aud" = $Audience
                            "$oidcConditionPrefix`:sub" = $Subject
                        }
                    }
                }
            )
        }
    }

    $stagingRuntimeArn =
        "arn:aws:iam::$ExpectedAwsAccount`:role/$StagingRuntimeRoleName"

    $productionRuntimeArn =
        "arn:aws:iam::$ExpectedAwsAccount`:role/$ProductionRuntimeRoleName"

    $stagingStreamArn =
        "arn:aws:iam::$ExpectedAwsAccount`:role/$StagingStreamRoleName"

    $productionStreamArn =
        "arn:aws:iam::$ExpectedAwsAccount`:role/$ProductionStreamRoleName"

    function New-StreamTrust([string]$RuntimeArn) {
        return [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "OnlyCasaRuntimeRole"
                    Effect = "Allow"
                    Principal = [ordered]@{
                        AWS = $RuntimeArn
                    }
                    Action = "sts:AssumeRole"
                }
            )
        }
    }

    function New-RuntimePolicy(
        [string]$Bucket,
        [string]$CollectionPrefix,
        [string]$StreamRoleArn
    ) {
        $collectionArn =
            "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$CollectionPrefix-*"

        return [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "CardArtifactsObjects"
                    Effect = "Allow"
                    Action = @(
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject"
                    )
                    Resource = "arn:aws:s3:::$Bucket/*"
                },
                [ordered]@{
                    Sid = "FaceCollectionOperations"
                    Effect = "Allow"
                    Action = @(
                        "rekognition:IndexFaces",
                        "rekognition:SearchFacesByImage",
                        "rekognition:DeleteFaces"
                    )
                    Resource = $collectionArn
                },
                [ordered]@{
                    Sid = "CreateFaceCollectionsAndBackendLiveness"
                    Effect = "Allow"
                    Action = @(
                        "rekognition:CreateCollection",
                        "rekognition:CreateFaceLivenessSession",
                        "rekognition:GetFaceLivenessSessionResults"
                    )
                    Resource = "*"
                },
                [ordered]@{
                    Sid = "AssumeEnvironmentLivenessStreamRole"
                    Effect = "Allow"
                    Action = "sts:AssumeRole"
                    Resource = $StreamRoleArn
                }
            )
        }
    }

    function New-StreamPolicy() {
        return [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "StartFaceLivenessOnly"
                    Effect = "Allow"
                    Action = "rekognition:StartFaceLivenessSession"
                    Resource = "*"
                }
            )
        }
    }

    $stagingRuntimeTrust = New-RuntimeTrust $StagingSubject
    $productionRuntimeTrust = New-RuntimeTrust $ProductionSubject
    $stagingStreamTrust = New-StreamTrust $stagingRuntimeArn
    $productionStreamTrust = New-StreamTrust $productionRuntimeArn
    $stagingRuntimePolicy =
        New-RuntimePolicy `
            $StagingBucket `
            $StagingCollectionPrefix `
            $stagingStreamArn
    $productionRuntimePolicy =
        New-RuntimePolicy `
            $ProductionBucket `
            $ProductionCollectionPrefix `
            $productionStreamArn
    $streamPolicy = New-StreamPolicy

    $stagingRuntimeTrustPath =
        Join-Path $evidence "STAGING_RUNTIME_TRUST.json"
    $productionRuntimeTrustPath =
        Join-Path $evidence "PRODUCTION_RUNTIME_TRUST.json"
    $stagingStreamTrustPath =
        Join-Path $evidence "STAGING_STREAM_TRUST.json"
    $productionStreamTrustPath =
        Join-Path $evidence "PRODUCTION_STREAM_TRUST.json"
    $stagingRuntimePolicyPath =
        Join-Path $evidence "STAGING_RUNTIME_POLICY.json"
    $productionRuntimePolicyPath =
        Join-Path $evidence "PRODUCTION_RUNTIME_POLICY.json"
    $streamPolicyPath =
        Join-Path $evidence "LIVENESS_STREAM_POLICY.json"

    Write-JsonFile $stagingRuntimeTrustPath $stagingRuntimeTrust
    Write-JsonFile $productionRuntimeTrustPath $productionRuntimeTrust
    Write-JsonFile $stagingStreamTrustPath $stagingStreamTrust
    Write-JsonFile $productionStreamTrustPath $productionStreamTrust
    Write-JsonFile $stagingRuntimePolicyPath $stagingRuntimePolicy
    Write-JsonFile $productionRuntimePolicyPath $productionRuntimePolicy
    Write-JsonFile $streamPolicyPath $streamPolicy

    Write-Host "  IAM documents:                  WRITTEN TO EVIDENCE"
    Write-Host "  evidence:                       $evidence"

    Step "Creating or verifying exact Vercel Team OIDC provider"

    $providerResult =
        Invoke-Aws `
            @(
                "iam",
                "get-open-id-connect-provider",
                "--open-id-connect-provider-arn",
                $ProviderArn,
                "--output",
                "json"
            ) `
            "Get Vercel OIDC provider" `
            -AllowFailure

    $providerCreated = $false

    if ($providerResult.ok) {
        $providerJson =
            Parse-Json `
                $providerResult `
                "Get Vercel OIDC provider"

        if ([string]$providerJson.Url -ne $ProviderHostPath) {
            Fail "Existing OIDC provider URL is not the expected Team issuer host/path."
        }

        if (@($providerJson.ClientIDList) -notcontains $Audience) {
            Fail "Existing Team OIDC provider does not include required custom audience $Audience. Refusing silent modification."
        }

        Write-Host "  OIDC provider:                  EXISTING / EXACT"
    }
    elseif ($providerResult.stderr -match "NoSuchEntity") {
        $createProvider =
            Invoke-Aws `
                @(
                    "iam",
                    "create-open-id-connect-provider",
                    "--url",
                    $IssuerUrl,
                    "--client-id-list",
                    $Audience,
                    "--tags",
                    "Key=Application,Value=CASA-School",
                    "Key=ManagedBy,Value=CASA-Vercel-OIDC-Bootstrap-V1",
                    "--output",
                    "json"
                ) `
                "Create Vercel Team OIDC provider"

        $createdProvider =
            Parse-Json `
                $createProvider `
                "Create Vercel Team OIDC provider"

        if ([string]$createdProvider.OpenIDConnectProviderArn -ne $ProviderArn) {
            Fail "AWS created an unexpected OIDC provider ARN."
        }

        $providerCreated = $true
        Write-Host "  OIDC provider:                  CREATED / VERIFIED"
    }
    else {
        Fail "Unable to determine existing OIDC provider state. $($providerResult.stderr)"
    }

    Step "Creating exact environment runtime roles"

    $createdRoles =
        New-Object System.Collections.Generic.List[string]

    foreach ($spec in @(
        @{
            Name = $StagingRuntimeRoleName
            Trust = $stagingRuntimeTrustPath
            Environment = "staging"
        },
        @{
            Name = $ProductionRuntimeRoleName
            Trust = $productionRuntimeTrustPath
            Environment = "production"
        }
    )) {
        $state = Get-RoleState $spec.Name

        if ($state.exists) {
            $managedTagResult =
                Invoke-Aws `
                    @(
                        "iam",
                        "list-role-tags",
                        "--role-name",
                        $spec.Name,
                        "--output",
                        "json"
                    ) `
                    "List tags $($spec.Name)"

            $managedTags =
                (Parse-Json $managedTagResult "List tags $($spec.Name)").Tags

            $managed =
                @(
                    $managedTags |
                    Where-Object {
                        $_.Key -eq "ManagedBy" -and
                        $_.Value -eq "CASA-Vercel-OIDC-Bootstrap-V1"
                    }
                ).Count -eq 1

            if (-not $managed) {
                Fail "Role $($spec.Name) already exists but is not owned by this CASA bootstrap."
            }

            Write-Host "  $($spec.Name): EXISTING / MANAGED"
        }
        else {
            Invoke-Aws `
                @(
                    "iam",
                    "create-role",
                    "--role-name",
                    $spec.Name,
                    "--assume-role-policy-document",
                    "file://$($spec.Trust)",
                    "--description",
                    "CASA School Vercel $($spec.Environment) runtime role",
                    "--tags",
                    "Key=Application,Value=CASA-School",
                    "Key=Environment,Value=$($spec.Environment)",
                    "Key=ManagedBy,Value=CASA-Vercel-OIDC-Bootstrap-V1",
                    "--output",
                    "json"
                ) `
                "Create runtime role $($spec.Name)" |
                Out-Null

            [void]$createdRoles.Add($spec.Name)
            Write-Host "  $($spec.Name): CREATED"
        }
    }

    Step "Creating exact environment Face Liveness stream roles"

    foreach ($spec in @(
        @{
            Name = $StagingStreamRoleName
            Trust = $stagingStreamTrustPath
            Environment = "staging"
        },
        @{
            Name = $ProductionStreamRoleName
            Trust = $productionStreamTrustPath
            Environment = "production"
        }
    )) {
        $state = Get-RoleState $spec.Name

        if ($state.exists) {
            $managedTagResult =
                Invoke-Aws `
                    @(
                        "iam",
                        "list-role-tags",
                        "--role-name",
                        $spec.Name,
                        "--output",
                        "json"
                    ) `
                    "List tags $($spec.Name)"

            $managedTags =
                (Parse-Json $managedTagResult "List tags $($spec.Name)").Tags

            $managed =
                @(
                    $managedTags |
                    Where-Object {
                        $_.Key -eq "ManagedBy" -and
                        $_.Value -eq "CASA-Vercel-OIDC-Bootstrap-V1"
                    }
                ).Count -eq 1

            if (-not $managed) {
                Fail "Role $($spec.Name) already exists but is not owned by this CASA bootstrap."
            }

            Write-Host "  $($spec.Name): EXISTING / MANAGED"
        }
        else {
            Invoke-Aws `
                @(
                    "iam",
                    "create-role",
                    "--role-name",
                    $spec.Name,
                    "--assume-role-policy-document",
                    "file://$($spec.Trust)",
                    "--description",
                    "CASA School $($spec.Environment) Face Liveness browser stream role",
                    "--max-session-duration",
                    "3600",
                    "--tags",
                    "Key=Application,Value=CASA-School",
                    "Key=Environment,Value=$($spec.Environment)",
                    "Key=ManagedBy,Value=CASA-Vercel-OIDC-Bootstrap-V1",
                    "--output",
                    "json"
                ) `
                "Create stream role $($spec.Name)" |
                Out-Null

            [void]$createdRoles.Add($spec.Name)
            Write-Host "  $($spec.Name): CREATED"
        }
    }

    Step "Installing exact inline policies"

    foreach ($spec in @(
        @{
            Role = $StagingRuntimeRoleName
            PolicyName = $StagingRuntimePolicyName
            PolicyPath = $stagingRuntimePolicyPath
        },
        @{
            Role = $ProductionRuntimeRoleName
            PolicyName = $ProductionRuntimePolicyName
            PolicyPath = $productionRuntimePolicyPath
        },
        @{
            Role = $StagingStreamRoleName
            PolicyName = $StagingStreamPolicyName
            PolicyPath = $streamPolicyPath
        },
        @{
            Role = $ProductionStreamRoleName
            PolicyName = $ProductionStreamPolicyName
            PolicyPath = $streamPolicyPath
        }
    )) {
        Invoke-Aws `
            @(
                "iam",
                "put-role-policy",
                "--role-name",
                $spec.Role,
                "--policy-name",
                $spec.PolicyName,
                "--policy-document",
                "file://$($spec.PolicyPath)"
            ) `
            "Put inline policy $($spec.PolicyName)" |
            Out-Null

        Write-Host "  $($spec.Role): policy INSTALLED"
    }

    Step "Re-proving role trust and policy presence"

    foreach ($roleName in @(
        $StagingRuntimeRoleName,
        $ProductionRuntimeRoleName,
        $StagingStreamRoleName,
        $ProductionStreamRoleName
    )) {
        $roleState = Get-RoleState $roleName

        if (-not $roleState.exists) {
            Fail "Expected IAM role missing after bootstrap: $roleName"
        }

        Write-Host "  $roleName`: EXISTS / VERIFIED"
    }

    Step "Running IAM policy-simulator isolation checks"

    $stagingObject =
        "arn:aws:s3:::$StagingBucket/casa-iam-simulation-object"

    $productionObject =
        "arn:aws:s3:::$ProductionBucket/casa-iam-simulation-object"

    $stagingCollection =
        "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$StagingCollectionPrefix-simulation"

    $productionCollection =
        "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$ProductionCollectionPrefix-simulation"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "s3:GetObject" `
        $stagingObject `
        "allowed" `
        "Staging runtime -> Staging S3"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "s3:GetObject" `
        $productionObject `
        "implicitDeny" `
        "Staging runtime -> Production S3"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "s3:GetObject" `
        $productionObject `
        "allowed" `
        "Production runtime -> Production S3"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "s3:GetObject" `
        $stagingObject `
        "implicitDeny" `
        "Production runtime -> Staging S3"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "rekognition:IndexFaces" `
        $stagingCollection `
        "allowed" `
        "Staging runtime -> Staging collection"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "rekognition:IndexFaces" `
        $productionCollection `
        "implicitDeny" `
        "Staging runtime -> Production collection"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "rekognition:IndexFaces" `
        $productionCollection `
        "allowed" `
        "Production runtime -> Production collection"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "rekognition:IndexFaces" `
        $stagingCollection `
        "implicitDeny" `
        "Production runtime -> Staging collection"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "sts:AssumeRole" `
        $stagingStreamArn `
        "allowed" `
        "Staging runtime -> Staging stream role"

    Assert-SimulationDecision `
        $stagingRuntimeArn `
        "sts:AssumeRole" `
        $productionStreamArn `
        "implicitDeny" `
        "Staging runtime -> Production stream role"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "sts:AssumeRole" `
        $productionStreamArn `
        "allowed" `
        "Production runtime -> Production stream role"

    Assert-SimulationDecision `
        $productionRuntimeArn `
        "sts:AssumeRole" `
        $stagingStreamArn `
        "implicitDeny" `
        "Production runtime -> Staging stream role"

    Assert-SimulationDecision `
        $stagingStreamArn `
        "rekognition:StartFaceLivenessSession" `
        "*" `
        "allowed" `
        "Staging stream role -> StartFaceLivenessSession"

    Assert-SimulationDecision `
        $productionStreamArn `
        "rekognition:StartFaceLivenessSession" `
        "*" `
        "allowed" `
        "Production stream role -> StartFaceLivenessSession"

    Step "Capturing final IAM bootstrap evidence"

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_VERCEL_OIDC_ENVIRONMENT_IAM_BOOTSTRAP_V1"
            sourceAuthority = "$branch/$head"
            migrations = $migrationCount
            aws = [ordered]@{
                account = $ExpectedAwsAccount
                region = $AwsRegion
                oidcProviderArn = $ProviderArn
                oidcAudience = $Audience
                stagingRuntimeRoleArn = $stagingRuntimeArn
                productionRuntimeRoleArn = $productionRuntimeArn
                stagingLivenessStreamRoleArn = $stagingStreamArn
                productionLivenessStreamRoleArn = $productionStreamArn
            }
            vercelTrust = [ordered]@{
                issuer = $IssuerUrl
                stagingSubject = $StagingSubject
                productionSubject = $ProductionSubject
            }
            isolation = [ordered]@{
                stagingBucket = $StagingBucket
                productionBucket = $ProductionBucket
                stagingCollectionPrefix = $StagingCollectionPrefix
                productionCollectionPrefix = $ProductionCollectionPrefix
            }
            created = [ordered]@{
                oidcProvider = $providerCreated
                roles = @($createdRoles)
            }
            nextEnvironmentValues = [ordered]@{
                preview_AWS_ROLE_ARN = $stagingRuntimeArn
                preview_CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $stagingStreamArn
                production_AWS_ROLE_ARN = $productionRuntimeArn
                production_CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $productionStreamArn
            }
            mutations = [ordered]@{
                awsIam = $true
                s3Data = $false
                rekognitionData = $false
                vercel = $false
                database = $false
                migration = $false
                deployment = $false
                source = $false
            }
        }

    Write-JsonFile `
        (Join-Path $evidence "RESULT.json") `
        $result

    Write-Host ""
    Write-Host "CASA VERCEL OIDC + ENVIRONMENT IAM BOOTSTRAP V1 IS GREEN" -ForegroundColor Green
    Write-Host "  OIDC provider:                  $ProviderArn"
    Write-Host "  OIDC audience:                  $Audience"
    Write-Host "  Staging trust subject:          preview / EXACT"
    Write-Host "  Production trust subject:       production / EXACT"
    Write-Host "  Staging runtime role:           $stagingRuntimeArn"
    Write-Host "  Staging liveness stream role:   $stagingStreamArn"
    Write-Host "  Production runtime role:        $productionRuntimeArn"
    Write-Host "  Production liveness stream role:$productionStreamArn"
    Write-Host "  cross-environment S3 access:    DENIED / VERIFIED"
    Write-Host "  cross-environment collection:   DENIED / VERIFIED"
    Write-Host "  cross-environment stream role:  DENIED / VERIFIED"
    Write-Host "  S3/Rekognition data mutation:   NONE"
    Write-Host "  Vercel/DB/migration/deployment: NONE"
    Write-Host "  AWS IAM mutation:               YES / COMPLETED"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete output. Then we will bind AWS_ROLE_ARN and CASA_AWS_LIVENESS_STREAM_ROLE_ARN into separate Vercel Preview/Production scopes without exposing either environment to the other's AWS resources." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA VERCEL OIDC + ENVIRONMENT IAM BOOTSTRAP V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This installer is state-aware. Do not manually delete any resource it may already have created; return the complete output so the exact partial state can be reconciled safely."
    throw
}
