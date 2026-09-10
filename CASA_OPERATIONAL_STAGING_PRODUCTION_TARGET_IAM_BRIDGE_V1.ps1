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
$ProviderHostPath = "oidc.vercel.com/$TeamSlug"
$ProviderArn = "arn:aws:iam::$ExpectedAwsAccount`:oidc-provider/$ProviderHostPath"
$Audience = "sts.amazonaws.com"
$ProductionSubject = "owner:$TeamSlug`:project:$ProjectName`:environment:production"

$StagingBucket = "casa-school-staging-card-artifacts-938733852185-eu-west-1"
$ProductionBucket = "casa-school-production-card-artifacts-938733852185-eu-west-1"

$StagingCollectionPrefix = "casa-school-staging"
$ProductionCollectionPrefix = "casa-school-production"

$BridgeRuntimeRoleName = "CASA-School-Vercel-Operational-Staging-ProdTarget-Runtime"
$BridgeStreamRoleName = "CASA-School-Operational-Staging-ProdTarget-Liveness-Stream"

$BridgeRuntimePolicyName = "CASA-School-Operational-Staging-ProdTarget-Runtime-Access"
$BridgeStreamPolicyName = "CASA-School-Operational-Staging-ProdTarget-Liveness-Access"

$BridgeRuntimeArn = "arn:aws:iam::$ExpectedAwsAccount`:role/$BridgeRuntimeRoleName"
$BridgeStreamArn = "arn:aws:iam::$ExpectedAwsAccount`:role/$BridgeStreamRoleName"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
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
            Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        }
        else {
            ""
        }

    Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue

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

function Assert-ManagedRole([string]$RoleName) {
    $tagsResult =
        Invoke-Aws `
            @(
                "iam",
                "list-role-tags",
                "--role-name",
                $RoleName,
                "--output",
                "json"
            ) `
            "List tags $RoleName"

    $tags =
        (Parse-Json $tagsResult "List tags $RoleName").Tags

    $owned =
        @(
            $tags |
            Where-Object {
                $_.Key -eq "ManagedBy" -and
                $_.Value -eq "CASA-Operational-Staging-Bridge-V1"
            }
        ).Count -eq 1

    if (-not $owned) {
        Fail "Role $RoleName already exists but is not owned by CASA Operational Staging Bridge V1."
    }
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
    $decision = [string]$json.EvaluationResults[0].EvalDecision

    if ($decision -ne $Expected) {
        Fail "$Label expected $Expected but IAM simulator returned $decision."
    }

    Write-Host "  $Label`: $decision / VERIFIED"
}

Write-Host "CASA School - Operational Staging on Vercel Production Target IAM Bridge V1" -ForegroundColor Green
Write-Host "Creates TEMPORARY roles for the current Production-labelled deployment to remain operationally Staging."
Write-Host "Trust claim = Vercel environment:production; permissions = STAGING resources only."
Write-Host "Real Production runtime/liveness roles remain untouched and dormant."
Write-Host "This script MUTATES AWS IAM only. No S3/Rekognition data, Vercel, DB, migration, deployment, or source mutation."

try {
    Step "Locking CASA checkpoint and source-side OIDC/isolation state"

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
        Join-Path $ProjectRoot "src\server\aws\vercel-oidc-credentials.ts"
    $storagePath =
        Join-Path $ProjectRoot "src\server\card-production\storage.ts"
    $rekognitionPath =
        Join-Path $ProjectRoot "src\server\biometrics\aws-rekognition.ts"

    foreach ($path in @($helperPath, $storagePath, $rekognitionPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Fail "Required source file missing: $path"
        }
    }

    $helper = [System.IO.File]::ReadAllText($helperPath)
    $storage = [System.IO.File]::ReadAllText($storagePath)
    $rekognition = [System.IO.File]::ReadAllText($rekognitionPath)

    if (
        $helper -notmatch "AWS_ROLE_ARN" -or
        $helper -notmatch [regex]::Escape('"sts.amazonaws.com"') -or
        $storage -notmatch "getVercelOidcAwsCredentials" -or
        $rekognition -notmatch "getVercelOidcAwsCredentials" -or
        $rekognition -notmatch "CASA_AWS_REKOGNITION_COLLECTION_PREFIX"
    ) {
        Fail "Expected OIDC/environment-isolation source wiring is incomplete."
    }

    Write-Host "  source authority:               $branch/$head"
    Write-Host "  migrations:                     $migrationCount / VERIFIED"
    Write-Host "  OIDC source wiring:             VERIFIED"
    Write-Host "  Rekognition namespace wiring:   VERIFIED"

    Step "Locking AWS account, Team OIDC provider, and existing permanent roles"

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

    $provider =
        Parse-Json `
            (
                Invoke-Aws `
                    @(
                        "iam",
                        "get-open-id-connect-provider",
                        "--open-id-connect-provider-arn",
                        $ProviderArn,
                        "--output",
                        "json"
                    ) `
                    "Get Team OIDC provider"
            ) `
            "Get Team OIDC provider"

    if (
        [string]$provider.Url -ne $ProviderHostPath -or
        @($provider.ClientIDList) -notcontains $Audience
    ) {
        Fail "Existing Vercel Team OIDC provider is not exact."
    }

    foreach ($role in @(
        "CASA-School-Vercel-Staging-Runtime",
        "CASA-School-Staging-Liveness-Stream",
        "CASA-School-Vercel-Production-Runtime",
        "CASA-School-Production-Liveness-Stream"
    )) {
        $state = Get-RoleState $role
        if (-not $state.exists) {
            Fail "Permanent role missing: $role"
        }
    }

    Write-Host "  AWS account:                    $ExpectedAwsAccount / VERIFIED"
    Write-Host "  Vercel Team OIDC provider:      EXACT / VERIFIED"
    Write-Host "  permanent Staging roles:        PRESENT / UNCHANGED"
    Write-Host "  permanent Production roles:     PRESENT / UNCHANGED"

    Step "Preparing exact temporary bridge trust and permission documents"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\operational-staging-prod-target-iam-bridge-v1-$stamp"

    New-Item -ItemType Directory -Path $evidence -Force | Out-Null

    $runtimeTrust =
        [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "VercelProductionClaimOperationalStagingOnly"
                    Effect = "Allow"
                    Principal = [ordered]@{
                        Federated = $ProviderArn
                    }
                    Action = "sts:AssumeRoleWithWebIdentity"
                    Condition = [ordered]@{
                        StringEquals = [ordered]@{
                            "$ProviderHostPath`:aud" = $Audience
                            "$ProviderHostPath`:sub" = $ProductionSubject
                        }
                    }
                }
            )
        }

    $streamTrust =
        [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "OnlyOperationalStagingRuntime"
                    Effect = "Allow"
                    Principal = [ordered]@{
                        AWS = $BridgeRuntimeArn
                    }
                    Action = "sts:AssumeRole"
                }
            )
        }

    $stagingCollectionArn =
        "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$StagingCollectionPrefix-*"

    $runtimePolicy =
        [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "StagingCardArtifactsOnly"
                    Effect = "Allow"
                    Action = @(
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject"
                    )
                    Resource = "arn:aws:s3:::$StagingBucket/*"
                },
                [ordered]@{
                    Sid = "StagingFaceCollectionsOnly"
                    Effect = "Allow"
                    Action = @(
                        "rekognition:IndexFaces",
                        "rekognition:SearchFacesByImage",
                        "rekognition:DeleteFaces"
                    )
                    Resource = $stagingCollectionArn
                },
                [ordered]@{
                    Sid = "CreateCollectionsAndBackendLiveness"
                    Effect = "Allow"
                    Action = @(
                        "rekognition:CreateCollection",
                        "rekognition:CreateFaceLivenessSession",
                        "rekognition:GetFaceLivenessSessionResults"
                    )
                    Resource = "*"
                },
                [ordered]@{
                    Sid = "AssumeOnlyBridgeLivenessStreamRole"
                    Effect = "Allow"
                    Action = "sts:AssumeRole"
                    Resource = $BridgeStreamArn
                }
            )
        }

    $streamPolicy =
        [ordered]@{
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

    $runtimeTrustPath = Join-Path $evidence "BRIDGE_RUNTIME_TRUST.json"
    $streamTrustPath = Join-Path $evidence "BRIDGE_STREAM_TRUST.json"
    $runtimePolicyPath = Join-Path $evidence "BRIDGE_RUNTIME_POLICY.json"
    $streamPolicyPath = Join-Path $evidence "BRIDGE_STREAM_POLICY.json"

    Write-JsonFile $runtimeTrustPath $runtimeTrust
    Write-JsonFile $streamTrustPath $streamTrust
    Write-JsonFile $runtimePolicyPath $runtimePolicy
    Write-JsonFile $streamPolicyPath $streamPolicy

    Write-Host "  bridge trust subject:           $ProductionSubject"
    Write-Host "  bridge data boundary:           STAGING ONLY"
    Write-Host "  evidence:                       $evidence"

    Step "Creating or verifying temporary operational-Staging runtime role"

    $runtimeState = Get-RoleState $BridgeRuntimeRoleName

    if ($runtimeState.exists) {
        Assert-ManagedRole $BridgeRuntimeRoleName
        Write-Host "  runtime bridge role:            EXISTING / MANAGED"
    }
    else {
        Invoke-Aws `
            @(
                "iam",
                "create-role",
                "--role-name",
                $BridgeRuntimeRoleName,
                "--assume-role-policy-document",
                "file://$runtimeTrustPath",
                "--description",
                "Temporary CASA operational Staging role for a Vercel Production-target deployment",
                "--tags",
                "Key=Application,Value=CASA-School",
                "Key=Environment,Value=operational-staging",
                "Key=VercelTarget,Value=production",
                "Key=Temporary,Value=true",
                "Key=ManagedBy,Value=CASA-Operational-Staging-Bridge-V1",
                "--output",
                "json"
            ) `
            "Create operational Staging runtime bridge" |
            Out-Null

        Write-Host "  runtime bridge role:            CREATED"
    }

    Step "Creating or verifying temporary operational-Staging liveness stream role"

    $streamState = Get-RoleState $BridgeStreamRoleName

    if ($streamState.exists) {
        Assert-ManagedRole $BridgeStreamRoleName
        Write-Host "  liveness bridge role:           EXISTING / MANAGED"
    }
    else {
        Invoke-Aws `
            @(
                "iam",
                "create-role",
                "--role-name",
                $BridgeStreamRoleName,
                "--assume-role-policy-document",
                "file://$streamTrustPath",
                "--description",
                "Temporary CASA operational Staging Face Liveness role for Vercel Production target",
                "--max-session-duration",
                "3600",
                "--tags",
                "Key=Application,Value=CASA-School",
                "Key=Environment,Value=operational-staging",
                "Key=VercelTarget,Value=production",
                "Key=Temporary,Value=true",
                "Key=ManagedBy,Value=CASA-Operational-Staging-Bridge-V1",
                "--output",
                "json"
            ) `
            "Create operational Staging liveness bridge" |
            Out-Null

        Write-Host "  liveness bridge role:           CREATED"
    }

    Step "Installing exact temporary bridge inline policies"

    Invoke-Aws `
        @(
            "iam",
            "put-role-policy",
            "--role-name",
            $BridgeRuntimeRoleName,
            "--policy-name",
            $BridgeRuntimePolicyName,
            "--policy-document",
            "file://$runtimePolicyPath"
        ) `
        "Install operational Staging runtime bridge policy" |
        Out-Null

    Invoke-Aws `
        @(
            "iam",
            "put-role-policy",
            "--role-name",
            $BridgeStreamRoleName,
            "--policy-name",
            $BridgeStreamPolicyName,
            "--policy-document",
            "file://$streamPolicyPath"
        ) `
        "Install operational Staging liveness bridge policy" |
        Out-Null

    Write-Host "  runtime bridge policy:          INSTALLED"
    Write-Host "  liveness bridge policy:         INSTALLED"

    Step "Proving temporary role isolation with IAM simulator"

    $stagingObject =
        "arn:aws:s3:::$StagingBucket/casa-iam-simulation-object"

    $productionObject =
        "arn:aws:s3:::$ProductionBucket/casa-iam-simulation-object"

    $stagingCollection =
        "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$StagingCollectionPrefix-simulation"

    $productionCollection =
        "arn:aws:rekognition:$AwsRegion`:$ExpectedAwsAccount`:collection/$ProductionCollectionPrefix-simulation"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "s3:GetObject" `
        $stagingObject `
        "allowed" `
        "Bridge runtime -> Staging S3"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "s3:GetObject" `
        $productionObject `
        "implicitDeny" `
        "Bridge runtime -> Production S3"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "rekognition:IndexFaces" `
        $stagingCollection `
        "allowed" `
        "Bridge runtime -> Staging collection"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "rekognition:IndexFaces" `
        $productionCollection `
        "implicitDeny" `
        "Bridge runtime -> Production collection"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "sts:AssumeRole" `
        $BridgeStreamArn `
        "allowed" `
        "Bridge runtime -> Bridge liveness role"

    $realProductionStreamArn =
        "arn:aws:iam::$ExpectedAwsAccount`:role/CASA-School-Production-Liveness-Stream"

    Assert-SimulationDecision `
        $BridgeRuntimeArn `
        "sts:AssumeRole" `
        $realProductionStreamArn `
        "implicitDeny" `
        "Bridge runtime -> Real Production liveness role"

    Assert-SimulationDecision `
        $BridgeStreamArn `
        "rekognition:StartFaceLivenessSession" `
        "*" `
        "allowed" `
        "Bridge liveness role -> StartFaceLivenessSession"

    Step "Capturing bridge evidence"

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_OPERATIONAL_STAGING_PRODUCTION_TARGET_IAM_BRIDGE_V1"
            sourceAuthority = "$branch/$head"
            migrations = $migrationCount
            purpose = "Current Vercel Production-target deployment remains operationally Staging"
            oidc = [ordered]@{
                providerArn = $ProviderArn
                audience = $Audience
                subject = $ProductionSubject
            }
            roles = [ordered]@{
                runtimeArn = $BridgeRuntimeArn
                livenessStreamArn = $BridgeStreamArn
            }
            permissions = [ordered]@{
                stagingBucket = $StagingBucket
                stagingCollectionPrefix = $StagingCollectionPrefix
                productionBucketAccess = "DENIED"
                productionCollectionAccess = "DENIED"
                realProductionLivenessRoleAccess = "DENIED"
            }
            finalProductionRolesTouched = $false
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
    Write-Host "CASA OPERATIONAL STAGING ON VERCEL PRODUCTION TARGET IAM BRIDGE V1 IS GREEN" -ForegroundColor Green
    Write-Host "  Vercel claim accepted:          environment:production / EXACT"
    Write-Host "  operational environment:        STAGING"
    Write-Host "  runtime bridge role:            $BridgeRuntimeArn"
    Write-Host "  liveness bridge role:           $BridgeStreamArn"
    Write-Host "  Staging S3 access:              ALLOWED / VERIFIED"
    Write-Host "  Production S3 access:           DENIED / VERIFIED"
    Write-Host "  Staging collection access:      ALLOWED / VERIFIED"
    Write-Host "  Production collection access:   DENIED / VERIFIED"
    Write-Host "  real Production roles:          UNTOUCHED / DORMANT"
    Write-Host "  S3/Rekognition data mutation:   NONE"
    Write-Host "  Vercel/DB/migration/deployment: NONE"
    Write-Host "  AWS IAM mutation:               YES / COMPLETED"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: bind Vercel Preview to the permanent Staging roles and bind the current Production target to these temporary operational-Staging bridge roles. Final Production roles remain unbound until go-live." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA OPERATIONAL STAGING IAM BRIDGE V1 STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Do not manually delete any resource it may already have created. Return the complete output so the exact partial state can be reconciled."
    throw
}
