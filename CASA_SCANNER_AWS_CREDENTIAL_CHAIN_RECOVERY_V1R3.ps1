param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$AttemptId = "c3609f74-7abe-4e33-9f50-ce0a33664e16"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedMigrationCount = 30
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedScannerHash = "91acc931ed3e2acd8bd73c3b2430b4da5605a95ed27926b5c05dffe33e9fc167"
$ExpectedAwsLivenessHash = "a1bd8db909b88ba9f0c4f3e03199ad24521acb161e84b49bb9ca0f54cc451a2f"
$ExpectedPackageHash = "01524eb5aff5c76ede00fe8fa14bd67271264ee903b041d9fcc6cef6a06b665a"
$ExpectedMigration29Hash = "cb8d914ea1f6d54922778f7a08b7183c643cbebcc8f148b7b141daa021cf4b11"
$ExpectedMigration30Hash = "6ca8172dacde212cb808f126a6c30449d2395a9da292da1df69b15b255793ed0"

$ExpectedAccount = "938733852185"
$ExpectedLoginCallerArn = "arn:aws:iam::938733852185:user/casa-admin"
$ExpectedBackendRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Biometric-Backend"
$ExpectedBackendPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/"
$ExpectedStreamRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming"
$ExpectedRegion = "eu-west-1"
$LoginProfile = "casa-dev"
$BridgeProfile = "casa-login-process"
$BackendProfile = "casa-biometric-dev"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$EvidenceRoot = $null
$ConfigPath = $null
$ConfigBackup = $null
$ConfigMutated = $false
$ConfigCommitted = $false
$BrowserLoginRefreshed = $false
$DbProbePath = $null
$SdkProbePath = $null
$StreamProbePath = $null

$OriginalPath = $env:PATH
$OriginalNodeOptions = $env:NODE_OPTIONS
$OriginalAwsProfile = $env:AWS_PROFILE
$OriginalAwsRegion = $env:AWS_REGION
$OriginalAwsDefaultRegion = $env:AWS_DEFAULT_REGION
$OriginalAwsSdkLoadConfig = $env:AWS_SDK_LOAD_CONFIG
$OriginalAwsAccessKeyId = $env:AWS_ACCESS_KEY_ID
$OriginalAwsSecretAccessKey = $env:AWS_SECRET_ACCESS_KEY
$OriginalAwsSessionToken = $env:AWS_SESSION_TOKEN
$OriginalDiagAttempt = $env:CASA_DIAG_ATTEMPT_ID
$OriginalCasaAwsRegion = $env:CASA_AWS_REKOGNITION_REGION
$OriginalCasaStreamRole = $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN
$OriginalCasaQualityFilter = $env:CASA_AWS_REKOGNITION_QUALITY_FILTER

function Stop-Recovery([string]$Message) {
    throw "ABORTED: $Message"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Recovery "Required file missing: $Path"
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DotEnvValue([string]$Path, [string]$Name, [bool]$Required = $false) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Required) { Stop-Recovery "Environment file missing: $Path" }
        return $null
    }

    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
    $line = @(
        Get-Content -LiteralPath $Path -ErrorAction Stop |
            Where-Object { $_ -match $pattern }
    ) | Select-Object -Last 1

    if ([string]::IsNullOrWhiteSpace([string]$line)) {
        if ($Required) { Stop-Recovery "$Name is missing from $Path" }
        return $null
    }

    $value = ([string]$line -replace $pattern, '').Trim()
    if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        if ($Required) { Stop-Recovery "$Name is empty in $Path" }
        return $null
    }

    return $value
}

function Find-AwsExe {
    $candidates = New-Object System.Collections.Generic.List[string]

    try {
        $cmd = Get-Command aws.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd -and -not [string]::IsNullOrWhiteSpace([string]$cmd.Source)) {
            [void]$candidates.Add([string]$cmd.Source)
        }
    }
    catch {}

    foreach ($candidate in @(
        $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "Amazon\AWSCLIV2\aws.exe" } else { $null }),
        $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Amazon\AWSCLIV2\aws.exe" } else { $null }),
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe" } else { $null }),
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Amazon\AWSCLIV2\aws.exe" } else { $null })
    )) {
        if (-not [string]::IsNullOrWhiteSpace([string]$candidate)) {
            [void]$candidates.Add([string]$candidate)
        }
    }

    foreach ($regPath in @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\aws.exe",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\aws.exe"
    )) {
        try {
            $item = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue
            if ($item -and -not [string]::IsNullOrWhiteSpace([string]$item.'(default)')) {
                [void]$candidates.Add([string]$item.'(default)')
            }
        }
        catch {}
    }

    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (
            -not [string]::IsNullOrWhiteSpace([string]$candidate) -and
            (Test-Path -LiteralPath $candidate -PathType Leaf)
        ) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return $null
}

function Invoke-AwsCapture([string]$AwsExe, [string[]]$Arguments) {
    $stderrPath = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference
    $stdout = @()
    $exitCode = $null

    try {
        $ErrorActionPreference = "Continue"
        $stdout = @(& $AwsExe @Arguments 2> $stderrPath)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    $stderr = @()
    try {
        if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
            $stderr = @(Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ })
        }
    }
    finally {
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
        ExitCode = [int]$exitCode
        Stdout = @($stdout | ForEach-Object { [string]$_ })
        Stderr = $stderr
    }
}

function Aws-Summary($Result) {
    $text = ((@($Result.Stderr) + @($Result.Stdout)) -join " ").Trim()
    $text = $text -replace '(?i)(ASIA|AKIA)[A-Z0-9]{12,}', '[REDACTED_AWS_ACCESS_KEY]'
    $text = $text -replace '(?i)(secretAccessKey|sessionToken|accessKeyId)(["''\s:=]+)[^,\s}]+', '$1$2[REDACTED]'
    if ($text.Length -gt 600) { $text = $text.Substring(0, 600) + "..." }
    return $text
}

function Aws-ConfigGet([string]$AwsExe, [string]$Name, [string]$Profile) {
    $r = Invoke-AwsCapture $AwsExe @("configure","get",$Name,"--profile",$Profile)
    if ($r.ExitCode -ne 0) { return $null }
    return (($r.Stdout -join "`n").Trim())
}

function Run-DbProbe([string]$ProjectRoot, [string]$ProbePath, [string]$AttemptId) {
    $env:CASA_DIAG_ATTEMPT_ID = $AttemptId
    $output = @(& node --env-file=.env.local $ProbePath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $output | ForEach-Object { Write-Host $_ }
        Stop-Recovery "Read-only Development attempt probe failed."
    }
    $lines = @($output | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -eq 0) { Stop-Recovery "Development attempt probe returned no output." }
    return ($lines[-1] | ConvertFrom-Json)
}

try {
    Write-Host "CASA School - Scanner AWS Credential Chain Recovery V1R3" -ForegroundColor Green
    Write-Host "Repairs only the local AWS credential_process bridge proven to block the Scanner liveness start path."
    Write-Host "No CASA source/schema/database/attendance mutation. No IAM policy/role mutation."
    Write-Host "May refresh the existing casa-dev browser login only if expired."
    Write-Host "Does NOT create an AWS Face Liveness session and does NOT rescan the student."
    Write-Host "No Staging/Production connection."
    Write-Host "V1R3 also supplies CASA's required Rekognition region and streaming-role environment to the exact helper proof."
    Write-Host "Attempt: $AttemptId"

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Recovery "CASA repository not found: $ProjectRoot"
    }
    Set-Location $ProjectRoot

    Step "Re-proving exact current CASA Development authority"

    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short HEAD).Trim()
    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Stop-Recovery "Git checkpoint drift: $branch/$head"
    }

    $migrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse)
    if ($migrationFiles.Count -ne $ExpectedMigrationCount) {
        Stop-Recovery "Expected $ExpectedMigrationCount local migrations; found $($migrationFiles.Count)."
    }

    $m29 = Join-Path $ProjectRoot "drizzle\20260909020000_pass-a-enum-expansion\migration.sql"
    $m30 = Join-Path $ProjectRoot "drizzle\20260909020500_pass-a-handover-attendance-state\migration.sql"
    if ((Sha $m29) -ne $ExpectedMigration29Hash) { Stop-Recovery "Migration 29 checksum drift." }
    if ((Sha $m30) -ne $ExpectedMigration30Hash) { Stop-Recovery "Migration 30 checksum drift." }

    $scannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $awsLivenessPath = Join-Path $ProjectRoot "src\server\biometrics\aws-liveness.ts"
    $packagePath = Join-Path $ProjectRoot "package.json"
    if ((Sha $scannerPath) -ne $ExpectedScannerHash) { Stop-Recovery "Simplified Scanner source drift." }
    if ((Sha $awsLivenessPath) -ne $ExpectedAwsLivenessHash) { Stop-Recovery "AWS liveness source drift." }
    if ((Sha $packagePath) -ne $ExpectedPackageHash) { Stop-Recovery "package.json drift." }

    $envPath = Join-Path $ProjectRoot ".env.local"
    $databaseUrl = Get-DotEnvValue $envPath "DATABASE_URL" $true
    $dbUri = [Uri]$databaseUrl
    if ($dbUri.Host -ne $ExpectedDevelopmentHost) {
        Stop-Recovery ".env.local is not authorized Development; found $($dbUri.Host)."
    }
    if ((Get-DotEnvValue $envPath "AWS_PROFILE" $true) -ne $BackendProfile) { Stop-Recovery ".env.local AWS_PROFILE drift." }
    if ((Get-DotEnvValue $envPath "AWS_REGION" $true) -ne $ExpectedRegion) { Stop-Recovery ".env.local AWS_REGION drift." }
    if ((Get-DotEnvValue $envPath "CASA_AWS_REKOGNITION_REGION" $true) -ne $ExpectedRegion) { Stop-Recovery ".env.local CASA AWS region drift." }
    if ((Get-DotEnvValue $envPath "CASA_AWS_LIVENESS_STREAM_ROLE_ARN" $true) -ne $ExpectedStreamRoleArn) { Stop-Recovery ".env.local stream-role drift." }

    Write-Host "  branch/head:                $branch/$head"
    Write-Host "  migrations:                 30 / VERIFIED"
    Write-Host "  Scanner permanent-card UI:  LOCKED / VERIFIED"
    Write-Host "  AWS liveness source:        LOCKED / VERIFIED"
    Write-Host "  Development host:           VERIFIED"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $ProjectRoot ".casa-backups\scanner-aws-credential-chain-recovery-v1r2-$stamp"
    New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

    Step "Locating and verifying the installed AWS CLI v2 executable"

    $AwsExe = Find-AwsExe
    if ([string]::IsNullOrWhiteSpace([string]$AwsExe)) {
        Stop-Recovery "AWS CLI is not discoverable in PATH or known installation locations."
    }

    $versionResult = Invoke-AwsCapture $AwsExe @("--version")
    $versionText = ((@($versionResult.Stdout) + @($versionResult.Stderr)) -join " ").Trim()
    if ($versionResult.ExitCode -ne 0 -or $versionText -notmatch '^aws-cli/2\.') {
        Stop-Recovery "Discovered AWS executable is not a working AWS CLI v2: $versionText"
    }

    $awsDirectory = Split-Path -Parent $AwsExe
    $pathParts = @($env:PATH -split ';' | Where-Object { $_ })
    if ($pathParts -notcontains $awsDirectory) {
        $env:PATH = "$awsDirectory;$env:PATH"
    }

    Write-Host "  AWS CLI v2:                 VERIFIED"
    Write-Host "  executable:                 $AwsExe"
    Write-Host "  exposed to this process:    YES"

    Step "Backing up and validating the local CASA AWS profile topology"

    $ConfigPath = Join-Path $HOME ".aws\config"
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        Stop-Recovery "AWS config is missing: $ConfigPath"
    }

    $ConfigBackup = Join-Path $EvidenceRoot "aws-config.before"
    Copy-Item -LiteralPath $ConfigPath -Destination $ConfigBackup -Force
    $configBeforeHash = Sha $ConfigPath

    $loginSession = Aws-ConfigGet $AwsExe "login_session" $LoginProfile
    $currentProcess = Aws-ConfigGet $AwsExe "credential_process" $BridgeProfile
    $backendRole = Aws-ConfigGet $AwsExe "role_arn" $BackendProfile
    $backendSource = Aws-ConfigGet $AwsExe "source_profile" $BackendProfile
    $backendSession = Aws-ConfigGet $AwsExe "role_session_name" $BackendProfile
    $backendDuration = Aws-ConfigGet $AwsExe "duration_seconds" $BackendProfile
    $backendRegion = Aws-ConfigGet $AwsExe "region" $BackendProfile

    if ([string]::IsNullOrWhiteSpace($loginSession)) { Stop-Recovery "casa-dev login_session is missing." }
    if ([string]::IsNullOrWhiteSpace($currentProcess)) { Stop-Recovery "casa-login-process credential_process is missing." }
    if ($backendRole -ne $ExpectedBackendRoleArn) { Stop-Recovery "casa-biometric-dev role_arn drift." }
    if ($backendSource -ne $BridgeProfile) { Stop-Recovery "casa-biometric-dev source_profile drift." }
    if ($backendSession -ne "casa-local-biometric-dev") { Stop-Recovery "casa-biometric-dev role_session_name drift." }
    if ($backendDuration -ne "3600") { Stop-Recovery "casa-biometric-dev duration_seconds drift." }
    if ($backendRegion -ne $ExpectedRegion) { Stop-Recovery "casa-biometric-dev region drift." }
    if ($currentProcess -notmatch '(?i)configure\s+export-credentials' -or $currentProcess -notmatch '(?i)(?:--profile\s+|--profile=)casa-dev(?:\s|$)' -or $currentProcess -notmatch '(?i)(?:--format\s+|--format=)process(?:\s|$)') {
        Stop-Recovery "Existing casa-login-process credential_process is not recognizably the CASA browser-login export bridge."
    }

    Write-Host "  login profile:               CONFIGURED"
    Write-Host "  bridge profile:              PRESENT"
    Write-Host "  backend role/source/session: VERIFIED"

    Step "Repairing credential_process to use the absolute AWS CLI executable"

    $desiredProcess = '"' + $AwsExe + '" configure export-credentials --profile ' + $LoginProfile + ' --format process --region ' + $ExpectedRegion

    if ($currentProcess -ne $desiredProcess) {
        $setResult = Invoke-AwsCapture $AwsExe @("configure","set","credential_process",$desiredProcess,"--profile",$BridgeProfile)
        if ($setResult.ExitCode -ne 0) {
            Stop-Recovery "Unable to update casa-login-process credential_process: $(Aws-Summary $setResult)"
        }
        $ConfigMutated = $true
        Write-Host "  credential_process:          REPAIRED TO ABSOLUTE aws.exe PATH"
    }
    else {
        Write-Host "  credential_process:          ALREADY ABSOLUTE / NO WRITE NEEDED"
    }

    $afterProcess = Aws-ConfigGet $AwsExe "credential_process" $BridgeProfile
    if ([string]::IsNullOrWhiteSpace([string]$afterProcess)) {
        Stop-Recovery "credential_process disappeared after the repair write."
    }

    # AWS CLI may normalize quoting when it serializes credential_process back to ~/.aws/config.
    # Validate the executable and arguments semantically, then prove the bridge by actually
    # invoking the profile below. This avoids treating harmless quote normalization as drift.
    $processText = ([string]$afterProcess).Trim()
    $processExe = $null
    $processArgs = $null

    if ($processText -match '^\s*"(?<exe>[^"]+)"(?<args>[\s\S]*)$') {
        $processExe = [string]$Matches['exe']
        $processArgs = [string]$Matches['args']
    }
    elseif ($processText -match '^\s*(?<exe>\S+)(?<args>[\s\S]*)$') {
        $processExe = [string]$Matches['exe']
        $processArgs = [string]$Matches['args']
    }

    if ([string]::IsNullOrWhiteSpace($processExe)) {
        Stop-Recovery "credential_process could not be parsed after the repair write."
    }

    $resolvedProcessExe = $null
    try {
        if (Test-Path -LiteralPath $processExe -PathType Leaf) {
            $resolvedProcessExe = (Resolve-Path -LiteralPath $processExe).Path
        }
    }
    catch {}

    if ([string]::IsNullOrWhiteSpace($resolvedProcessExe) -or -not $resolvedProcessExe.Equals($AwsExe, [System.StringComparison]::OrdinalIgnoreCase)) {
        Stop-Recovery "credential_process does not resolve to the discovered absolute AWS CLI executable."
    }

    $argsText = ([string]$processArgs).Trim()
    foreach ($requiredPattern in @(
        '^configure\s+export-credentials(?:\s|$)',
        '(?:^|\s)--profile(?:\s+|=)casa-dev(?:\s|$)',
        '(?:^|\s)--format(?:\s+|=)process(?:\s|$)',
        '(?:^|\s)--region(?:\s+|=)eu-west-1(?:\s|$)'
    )) {
        if ($argsText -notmatch $requiredPattern) {
            Stop-Recovery "credential_process lost a required CASA browser-login bridge argument after serialization."
        }
    }

    Write-Host "  persisted bridge semantics:   ABSOLUTE aws.exe + CASA EXPORT ARGS / VERIFIED"

    $configAfterRepairHash = Sha $ConfigPath
    @(
        "config_before_sha256=$configBeforeHash"
        "config_after_repair_sha256=$configAfterRepairHash"
        "aws_executable=$AwsExe"
        "credential_process_contains_absolute_aws_path=$($afterProcess.Contains($AwsExe))"
    ) | Set-Content -LiteralPath (Join-Path $EvidenceRoot "LOCAL_AWS_CONFIG_REPAIR_EVIDENCE.txt") -Encoding UTF8

    Step "Checking the existing casa-dev browser login"

    $loginIdentity = Invoke-AwsCapture $AwsExe @("sts","get-caller-identity","--profile",$LoginProfile,"--region",$ExpectedRegion,"--output","json","--no-cli-pager")
    if ($loginIdentity.ExitCode -ne 0) {
        $loginError = Aws-Summary $loginIdentity
        Write-Host "  current browser login:       UNAVAILABLE / REFRESH REQUIRED" -ForegroundColor Yellow
        Write-Host "  AWS message:                 $loginError"
        Write-Host "  opening AWS browser login once as casa-admin..." -ForegroundColor Yellow

        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            & $AwsExe login --profile $LoginProfile --region $ExpectedRegion --no-cli-pager
            $loginExit = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previous
        }

        if ($loginExit -ne 0) {
            Stop-Recovery "AWS browser login did not complete successfully."
        }

        $loginIdentity = Invoke-AwsCapture $AwsExe @("sts","get-caller-identity","--profile",$LoginProfile,"--region",$ExpectedRegion,"--output","json","--no-cli-pager")
        if ($loginIdentity.ExitCode -ne 0) {
            Stop-Recovery "casa-dev identity still fails after browser login: $(Aws-Summary $loginIdentity)"
        }
        $BrowserLoginRefreshed = $true
        Write-Host "  browser login refresh:       COMPLETED"
    }
    else {
        Write-Host "  browser login:               CURRENT / NO REFRESH NEEDED"
    }

    $loginJson = ($loginIdentity.Stdout -join "`n") | ConvertFrom-Json
    if ([string]$loginJson.Account -ne $ExpectedAccount -or [string]$loginJson.Arn -ne $ExpectedLoginCallerArn) {
        Stop-Recovery "casa-dev resolved to unexpected AWS caller: $($loginJson.Arn)"
    }
    Write-Host "  casa-dev caller:             VERIFIED casa-admin / account $ExpectedAccount"

    Step "Proving the repaired bridge and backend role with AWS control-plane reads"

    $bridgeIdentity = Invoke-AwsCapture $AwsExe @("sts","get-caller-identity","--profile",$BridgeProfile,"--region",$ExpectedRegion,"--output","json","--no-cli-pager")
    if ($bridgeIdentity.ExitCode -ne 0) {
        Stop-Recovery "Repaired casa-login-process bridge still fails: $(Aws-Summary $bridgeIdentity)"
    }
    $bridgeJson = ($bridgeIdentity.Stdout -join "`n") | ConvertFrom-Json
    if ([string]$bridgeJson.Account -ne $ExpectedAccount -or [string]$bridgeJson.Arn -ne $ExpectedLoginCallerArn) {
        Stop-Recovery "Credential bridge resolved to unexpected caller: $($bridgeJson.Arn)"
    }
    Write-Host "  credential_process bridge:  VERIFIED"

    $backendIdentity = Invoke-AwsCapture $AwsExe @("sts","get-caller-identity","--profile",$BackendProfile,"--region",$ExpectedRegion,"--output","json","--no-cli-pager")
    if ($backendIdentity.ExitCode -ne 0) {
        Stop-Recovery "Backend profile cannot assume CASA biometric role: $(Aws-Summary $backendIdentity)"
    }
    $backendJson = ($backendIdentity.Stdout -join "`n") | ConvertFrom-Json
    if ([string]$backendJson.Account -ne $ExpectedAccount -or -not ([string]$backendJson.Arn).StartsWith($ExpectedBackendPrefix)) {
        Stop-Recovery "Backend profile resolved to wrong account/role: $($backendJson.Arn)"
    }
    Write-Host "  backend assumed role:        VERIFIED"

    $rekognition = Invoke-AwsCapture $AwsExe @("rekognition","list-collections","--max-results","1","--profile",$BackendProfile,"--region",$ExpectedRegion,"--query","length(CollectionIds)","--output","text","--no-cli-pager")
    if ($rekognition.ExitCode -ne 0) {
        Stop-Recovery "Backend role cannot access Rekognition control plane: $(Aws-Summary $rekognition)"
    }
    Write-Host "  Rekognition control plane:   VERIFIED"

    Write-Host "  streaming-role CLI proof:    SKIPPED / WINDOWS INLINE-JSON QUOTING AVOIDED"

    Step "Proving CASA's actual Node AWS SDK runtime chain"

    $SdkProbePath = Join-Path $EvidenceRoot "node-aws-sdk-runtime-proof.mjs"
    $sdkSource = @'
import { ListCollectionsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

const region = "eu-west-1";
const expectedPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/";
const streamRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming";
const sts = new STSClient({ region });
const identity = await sts.send(new GetCallerIdentityCommand({}));
if (identity.Account !== "938733852185" || !identity.Arn?.startsWith(expectedPrefix)) {
  throw new Error(`Unexpected CASA AWS SDK caller: ${identity.Arn ?? "missing"}`);
}
const rekognition = new RekognitionClient({ region });
await rekognition.send(new ListCollectionsCommand({ MaxResults: 1 }));
const stream = await sts.send(new AssumeRoleCommand({
  RoleArn: streamRoleArn,
  RoleSessionName: `casa-credential-recovery-${Date.now()}`,
  DurationSeconds: 900,
  Policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["rekognition:StartFaceLivenessSession"],
        Resource: "*",
      },
    ],
  }),
}));
if (
  !stream.Credentials?.AccessKeyId ||
  !stream.Credentials.SecretAccessKey ||
  !stream.Credentials.SessionToken ||
  !stream.Credentials.Expiration
) {
  throw new Error("Streaming-role AssumeRole returned incomplete temporary credentials.");
}
console.log(JSON.stringify({
  callerVerified: true,
  rekognitionVerified: true,
  streamingRoleVerified: true,
}));
'@
    [IO.File]::WriteAllText($SdkProbePath, $sdkSource, $Utf8NoBom)

    $env:AWS_PROFILE = $BackendProfile
    $env:AWS_REGION = $ExpectedRegion
    $env:AWS_DEFAULT_REGION = $ExpectedRegion
    $env:AWS_SDK_LOAD_CONFIG = "1"
    Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
    Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue

    $requiredNodeOptions = "--dns-result-order=ipv4first --no-network-family-autoselection"
    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
        $env:NODE_OPTIONS = $requiredNodeOptions
    }
    elseif ($env:NODE_OPTIONS -notmatch 'dns-result-order=ipv4first') {
        $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) $requiredNodeOptions"
    }

    $sdkOutput = @(& node $SdkProbePath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $sdkOutput | ForEach-Object { Write-Host $_ }
        Stop-Recovery "CASA-equivalent Node AWS SDK credential chain still fails after repair."
    }
    Write-Host "  Node SDK backend identity:   VERIFIED"
    Write-Host "  Node SDK Rekognition read:   VERIFIED"
    Write-Host "  Node SDK streaming-role STS: VERIFIED / TEMPORARY ONLY"

    Step "Proving CASA's exact temporary streaming-credential issuance function"

    # The real CASA adapter deliberately reads these values from process.env.
    # The preceding raw SDK boundary proof hard-codes them, so make the exact
    # adapter probe use the same authoritative Development runtime configuration.
    $env:CASA_AWS_REKOGNITION_REGION = $ExpectedRegion
    $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $ExpectedStreamRoleArn
    $env:CASA_AWS_REKOGNITION_QUALITY_FILTER = "AUTO"

    $StreamProbePath = Join-Path $ProjectRoot (".casa-stream-credential-proof-" + [Guid]::NewGuid().ToString("N") + ".ts")
    $streamSource = @'
import { issueAwsLivenessStreamingCredentials } from "./src/server/biometrics/aws-rekognition";

async function main(): Promise<void> {
  const result = await issueAwsLivenessStreamingCredentials(
    "00000000-0000-4000-8000-000000000001",
  );
  if (
    !result.accessKeyId ||
    !result.secretAccessKey ||
    !result.sessionToken ||
    !result.expiration ||
    result.region !== "eu-west-1"
  ) {
    throw new Error("CASA streaming-role issuance returned incomplete temporary credentials.");
  }
  console.log("CASA exact streaming-role issuance passed; credential values were not printed.");
}

void main();
'@
    [IO.File]::WriteAllText($StreamProbePath, $streamSource, $Utf8NoBom)

    $streamOutput = @(& npx.cmd tsx $StreamProbePath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $streamOutput | ForEach-Object { Write-Host $_ }
        Stop-Recovery "CASA exact liveness streaming-credential issuance path failed after credential repair."
    }
    Write-Host "  CASA stream credential path: VERIFIED / VALUES HIDDEN"

    Step "Re-proving the exact pending Scanner attempt remained untouched"

    $DbProbePath = Join-Path $EvidenceRoot "attempt-state-readonly.mjs"
    $dbSource = @'
import { neon } from "@neondatabase/serverless";
const raw = process.env.DATABASE_URL;
const attemptId = process.env.CASA_DIAG_ATTEMPT_ID;
if (!raw || !attemptId) throw new Error("Diagnostic environment incomplete.");
const parsed = new URL(raw);
if (parsed.hostname !== "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech") {
  throw new Error(`Refusing non-Development host: ${parsed.hostname}`);
}
const sql = neon(raw);
const migrations = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
const attempt = await sql`
  select id, operation::text as operation, card_result::text as card_result,
         face_result::text as face_result, liveness_result::text as liveness_result,
         outcome::text as outcome, reason_code, occurred_at, completed_at, created_at
  from attendance_verification_attempts
  where id=${attemptId}::uuid
`;
const live = await sql`
  select count(*)::int as count
  from biometric_liveness_sessions
  where attempt_id=${attemptId}::uuid
`;
const counts = await sql`
  select
    (select count(*)::int from student_attendance_records where source_attempt_id=${attemptId}::uuid) as attendance,
    (select count(*)::int from student_presence_events where attempt_id=${attemptId}::uuid) as presence,
    (select count(*)::int from biometric_verification_evidence where attempt_id=${attemptId}::uuid) as evidence
`;
console.log(JSON.stringify({ migrations: Number(migrations[0]?.count ?? -1), attempt: attempt[0] ?? null, livenessSessions: Number(live[0]?.count ?? -1), protectedCounts: counts[0] ?? null }));
'@
    [IO.File]::WriteAllText($DbProbePath, $dbSource, $Utf8NoBom)

    $state = Run-DbProbe $ProjectRoot $DbProbePath $AttemptId
    if ([int]$state.migrations -ne 30) { Stop-Recovery "Development migration count drifted." }
    if ($null -eq $state.attempt) { Stop-Recovery "Exact pending Scanner attempt no longer exists." }
    if ([string]$state.attempt.operation -ne "CHECK_IN" -or [string]$state.attempt.card_result -ne "MATCHED" -or [string]$state.attempt.face_result -ne "NOT_RUN" -or [string]$state.attempt.liveness_result -ne "NOT_RUN" -or [string]$state.attempt.outcome -ne "PENDING") {
        Stop-Recovery "Exact Scanner attempt state changed unexpectedly."
    }
    if ([int]$state.livenessSessions -ne 0 -or [int]$state.protectedCounts.attendance -ne 0 -or [int]$state.protectedCounts.presence -ne 0 -or [int]$state.protectedCounts.evidence -ne 0) {
        Stop-Recovery "Protected Scanner/attendance state changed unexpectedly."
    }

    Write-Host "  attempt:                     MATCHED / NOT_RUN / NOT_RUN / PENDING"
    Write-Host "  bound liveness sessions:     0"
    Write-Host "  attendance/presence/evidence: 0/0/0"

    $ConfigCommitted = $true
    $configFinalHash = Sha $ConfigPath

    $result = [ordered]@{
        createdAt = (Get-Date -Format o)
        proof = "CASA_SCANNER_AWS_CREDENTIAL_CHAIN_RECOVERY_V1R3"
        classificationBefore = "AWS_BACKEND_CREDENTIAL_CHAIN_FAILURE"
        credentialProcessRepaired = $ConfigMutated
        awsExecutable = $AwsExe
        browserLoginRefreshed = $BrowserLoginRefreshed
        backendRoleVerified = $true
        rekognitionVerified = $true
        streamingRoleVerified = $true
        nodeSdkRuntimeVerified = $true
        casaStreamingCredentialFunctionVerified = $true
        faceLivenessSessionCreated = $false
        attemptId = $AttemptId
        attemptOutcome = [string]$state.attempt.outcome
        livenessSessionCount = [int]$state.livenessSessions
        attendanceRows = [int]$state.protectedCounts.attendance
        presenceRows = [int]$state.protectedCounts.presence
        evidenceRows = [int]$state.protectedCounts.evidence
        casaSourceMutation = $false
        databaseMutation = $false
        attendanceMutation = $false
        awsIamMutation = $false
        stagingConnected = $false
        productionConnected = $false
        configBeforeSha256 = $configBeforeHash
        configFinalSha256 = $configFinalHash
    }
    [IO.File]::WriteAllText((Join-Path $EvidenceRoot "RESULT.json"), ($result | ConvertTo-Json -Depth 8), $Utf8NoBom)

    Write-Host ""
    Write-Host "CASA SCANNER AWS CREDENTIAL CHAIN RECOVERY V1R3 IS GREEN" -ForegroundColor Green
    Write-Host "  original blocker:            AWS_BACKEND_CREDENTIAL_CHAIN_FAILURE"
    Write-Host "  credential_process:          ABSOLUTE aws.exe / VERIFIED"
    Write-Host "  casa-dev login:              VERIFIED"
    Write-Host "  backend assumed role:        VERIFIED"
    Write-Host "  Rekognition control plane:   VERIFIED"
    Write-Host "  streaming-role AssumeRole:   VERIFIED VIA NODE AWS SDK"
    Write-Host "  Node AWS SDK runtime:        VERIFIED"
    Write-Host "  CASA stream issuance path:   VERIFIED"
    Write-Host "  Face Liveness session created: NO"
    Write-Host "  pending attempt:             UNTOUCHED"
    Write-Host "  DB/attendance mutation:      NO"
    Write-Host "  AWS IAM/resource mutation:   NO"
    Write-Host "  Staging/Production:          NOT TOUCHED"
    Write-Host "  evidence:                    $EvidenceRoot"
    Write-Host ""
    Write-Host "NEXT: return this complete GREEN output. Do NOT rescan yet; the next guarded step will perform one same-attempt face/liveness retry only." -ForegroundColor Yellow
}
catch {
    if ($ConfigMutated -and -not $ConfigCommitted -and $ConfigBackup -and $ConfigPath) {
        try {
            Copy-Item -LiteralPath $ConfigBackup -Destination $ConfigPath -Force
            Write-Host ""
            Write-Host "ROLLBACK: restored the original ~/.aws/config because full credential-chain verification did not complete." -ForegroundColor Yellow
        }
        catch {
            Write-Host "WARNING: automatic ~/.aws/config rollback failed; original backup remains at $ConfigBackup" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "CASA SCANNER AWS CREDENTIAL CHAIN RECOVERY STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    if ($EvidenceRoot) { Write-Host "Evidence: $EvidenceRoot" }
    throw
}
finally {
    $env:PATH = $OriginalPath

    if ($null -ne $OriginalNodeOptions) { $env:NODE_OPTIONS = $OriginalNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsProfile) { $env:AWS_PROFILE = $OriginalAwsProfile } else { Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsRegion) { $env:AWS_REGION = $OriginalAwsRegion } else { Remove-Item Env:AWS_REGION -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsDefaultRegion) { $env:AWS_DEFAULT_REGION = $OriginalAwsDefaultRegion } else { Remove-Item Env:AWS_DEFAULT_REGION -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsSdkLoadConfig) { $env:AWS_SDK_LOAD_CONFIG = $OriginalAwsSdkLoadConfig } else { Remove-Item Env:AWS_SDK_LOAD_CONFIG -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsAccessKeyId) { $env:AWS_ACCESS_KEY_ID = $OriginalAwsAccessKeyId } else { Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsSecretAccessKey) { $env:AWS_SECRET_ACCESS_KEY = $OriginalAwsSecretAccessKey } else { Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsSessionToken) { $env:AWS_SESSION_TOKEN = $OriginalAwsSessionToken } else { Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalDiagAttempt) { $env:CASA_DIAG_ATTEMPT_ID = $OriginalDiagAttempt } else { Remove-Item Env:CASA_DIAG_ATTEMPT_ID -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalCasaAwsRegion) { $env:CASA_AWS_REKOGNITION_REGION = $OriginalCasaAwsRegion } else { Remove-Item Env:CASA_AWS_REKOGNITION_REGION -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalCasaStreamRole) { $env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN = $OriginalCasaStreamRole } else { Remove-Item Env:CASA_AWS_LIVENESS_STREAM_ROLE_ARN -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalCasaQualityFilter) { $env:CASA_AWS_REKOGNITION_QUALITY_FILTER = $OriginalCasaQualityFilter } else { Remove-Item Env:CASA_AWS_REKOGNITION_QUALITY_FILTER -ErrorAction SilentlyContinue }
    if ($StreamProbePath -and (Test-Path -LiteralPath $StreamProbePath -PathType Leaf)) {
        Remove-Item -LiteralPath $StreamProbePath -Force -ErrorAction SilentlyContinue
    }
}
