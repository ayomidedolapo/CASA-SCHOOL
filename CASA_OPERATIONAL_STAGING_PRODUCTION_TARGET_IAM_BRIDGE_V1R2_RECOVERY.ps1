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
$AccountRootArn = "arn:aws:iam::$ExpectedAwsAccount`:root"

$ManagedBy = "CASA-Operational-Staging-Bridge-V1"

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

function Assert-ManagedRole(
    [string]$RoleName,
    [string]$ExpectedManagedBy
) {
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
                $_.Value -eq $ExpectedManagedBy
            }
        ).Count -eq 1

    if (-not $owned) {
        Fail "Role $RoleName exists but is not owned by $ExpectedManagedBy."
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

Write-Host "CASA School - Operational Staging Production-Target IAM Bridge V1R2 Recovery" -ForegroundColor Green
Write-Host "Recovers the exact partial V1 state after the runtime bridge role was created but the liveness role failed on IAM principal propagation."
Write-Host "Uses account-root + aws:PrincipalArn condition for the liveness trust so only the exact bridge runtime role can assume it."
Write-Host "Real Production roles remain untouched and dormant."
Write-Host "This script MUTATES AWS IAM only. No S3/Rekognition data, Vercel, DB, migration, deployment, or source mutation."

try {
    Step "Locking CASA checkpoint and OIDC/environment source authority"

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

    Step "Locking AWS account, Team OIDC provider, and permanent roles"

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
                    "Get Vercel Team OIDC provider"
            ) `
            "Get Vercel Team OIDC provider"

    if (
        [string]$provider.Url -ne $ProviderHostPath -or
        @($provider.ClientIDList) -notcontains $Audience
    ) {
        Fail "Vercel Team OIDC provider is not exact."
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

    Step "Re-proving exact partial V1 bridge state"

    $runtimeState = Get-RoleState $BridgeRuntimeRoleName

    if (-not $runtimeState.exists) {
        Fail "Expected V1 partial state missing: runtime bridge role does not exist."
    }

    Assert-ManagedRole $BridgeRuntimeRoleName $ManagedBy

    $runtimeTrustText =
        $runtimeState.json.Role.AssumeRolePolicyDocument |
        ConvertTo-Json -Depth 20 -Compress

    if (
        $runtimeTrustText -notmatch [regex]::Escape($ProviderArn) -or
        $runtimeTrustText -notmatch [regex]::Escape($Audience) -or
        $runtimeTrustText -notmatch [regex]::Escape($ProductionSubject) -or
        $runtimeTrustText -notmatch "AssumeRoleWithWebIdentity"
    ) {
        Fail "Existing runtime bridge trust policy does not match the exact V1 production-claim/staging-permission design."
    }

    $streamState = Get-RoleState $BridgeStreamRoleName

    Write-Host "  runtime bridge role:            EXISTS / MANAGED / VERIFIED"
    Write-Host "  runtime bridge trust:           environment:production / EXACT"

    if ($streamState.exists) {
        Assert-ManagedRole $BridgeStreamRoleName $ManagedBy
        Write-Host "  liveness bridge role:           ALREADY EXISTS / MANAGED"
    }
    else {
        Write-Host "  liveness bridge role:           ABSENT / EXPECTED PARTIAL STATE"
    }

    Step "Preparing propagation-independent stream trust and exact Staging-only permissions"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $evidence =
        Join-Path `
            $ProjectRoot `
            ".casa-backups\operational-staging-prod-target-iam-bridge-v1r2-recovery-$stamp"

    New-Item -ItemType Directory -Path $evidence -Force | Out-Null

    # AWS documents aws:PrincipalArn as a condition key for constraining a role
    # principal without storing the referenced role's transformed principal ID.
    # Principal remains this account's root; the condition narrows assumption to
    # the exact operational-Staging runtime role only.
    $streamTrust =
        [ordered]@{
            Version = "2012-10-17"
            Statement = @(
                [ordered]@{
                    Sid = "OnlyOperationalStagingRuntimeRole"
                    Effect = "Allow"
                    Principal = [ordered]@{
                        AWS = $AccountRootArn
                    }
                    Action = "sts:AssumeRole"
                    Condition = [ordered]@{
                        ArnEquals = [ordered]@{
                            "aws:PrincipalArn" = $BridgeRuntimeArn
                        }
                    }
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
                    Sid = "AssumeOnlyOperationalStagingLivenessRole"
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

    $streamTrustPath = Join-Path $evidence "BRIDGE_STREAM_TRUST.json"
    $runtimePolicyPath = Join-Path $evidence "BRIDGE_RUNTIME_POLICY.json"
    $streamPolicyPath = Join-Path $evidence "BRIDGE_STREAM_POLICY.json"

    Write-JsonFile $streamTrustPath $streamTrust
    Write-JsonFile $runtimePolicyPath $runtimePolicy
    Write-JsonFile $streamPolicyPath $streamPolicy

    Write-Host "  stream Principal:               $AccountRootArn"
    Write-Host "  stream aws:PrincipalArn:        $BridgeRuntimeArn / EXACT"
    Write-Host "  data boundary:                  STAGING ONLY"
    Write-Host "  evidence:                       $evidence"

    Step "Creating or normalizing temporary liveness stream role"

    if (-not $streamState.exists) {
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
                "Key=ManagedBy,Value=$ManagedBy",
                "--output",
                "json"
            ) `
            "Create operational Staging liveness bridge" |
            Out-Null

        Write-Host "  liveness bridge role:           CREATED"
    }
    else {
        Invoke-Aws `
            @(
                "iam",
                "update-assume-role-policy",
                "--role-name",
                $BridgeStreamRoleName,
                "--policy-document",
                "file://$streamTrustPath"
            ) `
            "Normalize operational Staging liveness bridge trust" |
            Out-Null

        Write-Host "  liveness bridge role:           EXISTING / TRUST NORMALIZED"
    }

    Step "Installing exact bridge policies"

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

    Step "Re-proving liveness trust policy"

    $streamAfter = Get-RoleState $BridgeStreamRoleName

    if (-not $streamAfter.exists) {
        Fail "Liveness bridge role missing after recovery."
    }

    Assert-ManagedRole $BridgeStreamRoleName $ManagedBy

    $streamTrustText =
        $streamAfter.json.Role.AssumeRolePolicyDocument |
        ConvertTo-Json -Depth 20 -Compress

    if (
        $streamTrustText -notmatch [regex]::Escape($AccountRootArn) -or
        $streamTrustText -notmatch [regex]::Escape("aws:PrincipalArn") -or
        $streamTrustText -notmatch [regex]::Escape($BridgeRuntimeArn) -or
        $streamTrustText -notmatch [regex]::Escape("sts:AssumeRole")
    ) {
        Fail "Recovered liveness stream trust policy is not exact."
    }

    Write-Host "  liveness bridge trust:          ROOT + aws:PrincipalArn / EXACT"
    Write-Host "  permitted source role:          BRIDGE RUNTIME ONLY / VERIFIED"

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

    Step "Capturing recovery result"

    $result =
        [ordered]@{
            createdAt = (Get-Date -Format o)
            proof = "CASA_OPERATIONAL_STAGING_PRODUCTION_TARGET_IAM_BRIDGE_V1R2_RECOVERY"
            sourceAuthority = "$branch/$head"
            migrations = $migrationCount
            recoveredPartialState = [ordered]@{
                runtimeBridgeRolePreExisted = $true
                originalFailure = "Invalid principal during immediate liveness role creation"
                recoveryTrustPattern = "account-root plus ArnEquals aws:PrincipalArn"
            }
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
            permanentProductionRolesTouched = $false
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

    Write-JsonFile (Join-Path $evidence "RESULT.json") $result

    Write-Host ""
    Write-Host "CASA OPERATIONAL STAGING PRODUCTION-TARGET IAM BRIDGE V1R2 RECOVERY IS GREEN" -ForegroundColor Green
    Write-Host "  Vercel claim accepted:          environment:production / EXACT"
    Write-Host "  operational environment:        STAGING"
    Write-Host "  runtime bridge role:            $BridgeRuntimeArn"
    Write-Host "  liveness bridge role:           $BridgeStreamArn"
    Write-Host "  liveness trust pattern:         aws:PrincipalArn / EXACT ROLE ONLY"
    Write-Host "  Staging S3 access:              ALLOWED / VERIFIED"
    Write-Host "  Production S3 access:           DENIED / VERIFIED"
    Write-Host "  Staging collection access:      ALLOWED / VERIFIED"
    Write-Host "  Production collection access:   DENIED / VERIFIED"
    Write-Host "  real Production roles:          UNTOUCHED / DORMANT"
    Write-Host "  S3/Rekognition data mutation:   NONE"
    Write-Host "  Vercel/DB/migration/deployment: NONE"
    Write-Host "  AWS IAM mutation:               YES / RECOVERED"
    Write-Host "  evidence:                       $evidence"
    Write-Host ""
    Write-Host "NEXT: return this complete output. If GREEN, only the final Vercel environment binding remains before the Staging deployment can be refreshed with OIDC." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA OPERATIONAL STAGING PRODUCTION-TARGET IAM BRIDGE V1R2 RECOVERY STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Do not manually delete the already-created runtime bridge role. Return the complete output so the exact IAM partial state can be reconciled."
    throw
}
