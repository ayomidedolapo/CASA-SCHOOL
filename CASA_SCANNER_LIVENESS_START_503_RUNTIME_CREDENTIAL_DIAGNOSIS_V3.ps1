param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school",
    [string]$AttemptId = "c3609f74-7abe-4e33-9f50-ce0a33664e16"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$ExpectedDevelopmentHost = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech"
$ExpectedMigrationCount = 30
$ExpectedScannerHash = "91acc931ed3e2acd8bd73c3b2430b4da5605a95ed27926b5c05dffe33e9fc167"
$ExpectedAwsLivenessHash = "a1bd8db909b88ba9f0c4f3e03199ad24521acb161e84b49bb9ca0f54cc451a2f"
$ExpectedAccount = "938733852185"
$ExpectedBackendPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/"
$ExpectedRegion = "eu-west-1"
$BackendProfile = "casa-biometric-dev"
$LoginProcessProfile = "casa-login-process"
$LoginProfile = "casa-dev"
$ExpectedBackendRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Biometric-Backend"
$ExpectedStreamingRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Stop-Diagnosis([string]$Message) {
    throw "ABORTED: $Message"
}

function Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Diagnosis "Required file missing: $Path"
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DotEnvValue([string]$Path, [string]$Name, [bool]$Required = $false) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Required) { Stop-Diagnosis "Environment file missing: $Path" }
        return $null
    }

    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
    $line = @(
        Get-Content -LiteralPath $Path -ErrorAction Stop |
            Where-Object { $_ -match $pattern }
    ) | Select-Object -Last 1

    if ([string]::IsNullOrWhiteSpace([string]$line)) {
        if ($Required) { Stop-Diagnosis "$Name is missing from $Path" }
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
        if ($Required) { Stop-Diagnosis "$Name is empty in $Path" }
        return $null
    }

    return $value
}

function Get-AwsConfigSection([string]$Path, [string]$Profile) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @()
    }

    $headerA = "[profile $Profile]"
    $headerB = "[$Profile]"
    $capturing = $false
    $lines = New-Object System.Collections.Generic.List[string]

    foreach ($raw in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        $line = [string]$raw
        $trim = $line.Trim()
        if ($trim.StartsWith('[') -and $trim.EndsWith(']')) {
            if ($capturing) { break }
            if ($trim -eq $headerA -or $trim -eq $headerB) {
                $capturing = $true
            }
            continue
        }
        if ($capturing) { $lines.Add($line) }
    }

    return @($lines)
}

function Get-AwsConfigSetting([string[]]$Section, [string]$Name) {
    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
    $line = @($Section | Where-Object { $_ -match $pattern }) | Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace([string]$line)) { return $null }
    return (([string]$line -replace $pattern, '').Trim())
}

function Safe-Text([string]$Text) {
    $safe = [string]$Text
    $safe = $safe -replace '(?i)(accessKeyId|secretAccessKey|sessionToken|authorization|cookie|set-cookie)(["''\s:=]+)[^,\s}]+', '$1$2[REDACTED]'
    $safe = $safe -replace '(?i)(ASIA|AKIA)[A-Z0-9]{12,}', '[REDACTED_AWS_ACCESS_KEY]'
    $safe = $safe -replace '(?i)(SessionId|providerSessionId)(["''\s:=]+)[A-Za-z0-9-]+', '$1$2[REDACTED_PROVIDER_SESSION]'
    if ($safe.Length -gt 1400) { return $safe.Substring(0, 1400) + "..." }
    return $safe
}

Write-Host "CASA School - Scanner Liveness Start 503 Runtime Credential Diagnosis V3" -ForegroundColor Cyan
Write-Host "READ ONLY against the exact pending Development Scanner attempt."
Write-Host "Uses CASA's Node AWS SDK runtime chain; does NOT require the AWS CLI to be globally installed."
Write-Host "No new scan. No CreateFaceLivenessSession call. No DB write. No attendance write. No persistent AWS mutation."
Write-Host "No Staging/Production connection."
Write-Host "Attempt: $AttemptId"
Write-Host ""

$OriginalNodeOptions = $env:NODE_OPTIONS
$OriginalDiagAttempt = $env:CASA_DIAG_ATTEMPT_ID
$OriginalAwsProfile = $env:AWS_PROFILE
$OriginalAwsRegion = $env:AWS_REGION
$OriginalAwsDefaultRegion = $env:AWS_DEFAULT_REGION
$EvidenceRoot = $null
$DbProbe = $null
$AwsProbe = $null

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Diagnosis "CASA project root not found: $ProjectRoot"
    }
    Set-Location $ProjectRoot

    Write-Host "==> Re-proving current permanent-card Development source boundary" -ForegroundColor Cyan
    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()
    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Stop-Diagnosis "Git checkpoint drift: $branch/$head"
    }

    $ScannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $AwsPath = Join-Path $ProjectRoot "src\server\biometrics\aws-liveness.ts"
    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Stop-Diagnosis "Current simplified Scanner hash drift."
    }
    if ((Sha $AwsPath) -ne $ExpectedAwsLivenessHash) {
        Stop-Diagnosis "AWS liveness authority drift."
    }

    $migrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse -ErrorAction Stop)
    if ($migrationFiles.Count -ne $ExpectedMigrationCount) {
        Stop-Diagnosis "Expected 30 local migrations; found $($migrationFiles.Count)."
    }

    Write-Host "  branch/head:              $branch/$head"
    Write-Host "  local migrations:         30 / VERIFIED"
    Write-Host "  simplified Scanner:       LOCKED / VERIFIED"
    Write-Host "  AWS liveness source:      BYTE-FOR-BYTE LOCKED"

    $DevEnvPath = Join-Path $ProjectRoot ".env.local"
    $DatabaseUrl = Get-DotEnvValue $DevEnvPath "DATABASE_URL" $true
    $dbUri = [Uri]$DatabaseUrl
    if ($dbUri.Host -ne $ExpectedDevelopmentHost) {
        Stop-Diagnosis ".env.local is not authorized Development; found $($dbUri.Host)."
    }

    $ProviderMode = Get-DotEnvValue $DevEnvPath "CASA_BIOMETRIC_PROVIDER_MODE" $false
    $EnvAwsProfile = Get-DotEnvValue $DevEnvPath "AWS_PROFILE" $false
    $EnvAwsRegion = Get-DotEnvValue $DevEnvPath "AWS_REGION" $false
    $EnvCasaRegion = Get-DotEnvValue $DevEnvPath "CASA_AWS_REKOGNITION_REGION" $false
    $EnvStreamRole = Get-DotEnvValue $DevEnvPath "CASA_AWS_LIVENESS_STREAM_ROLE_ARN" $false

    if ($ProviderMode -ne "AWS_REKOGNITION") { Stop-Diagnosis "Development biometric provider is not AWS_REKOGNITION." }
    if ($EnvAwsProfile -ne $BackendProfile) { Stop-Diagnosis "Development AWS_PROFILE is not $BackendProfile." }
    if ($EnvCasaRegion -ne $ExpectedRegion -and $EnvAwsRegion -ne $ExpectedRegion) { Stop-Diagnosis "Development AWS region is not $ExpectedRegion." }
    if ($EnvStreamRole -ne $ExpectedStreamingRoleArn) { Stop-Diagnosis "Development streaming role ARN drift." }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $ProjectRoot ".casa-backups\scanner-liveness-start-503-runtime-credential-v3-$stamp"
    New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

    Write-Host ""
    Write-Host "==> Reading authoritative Development state for the failed attempt" -ForegroundColor Cyan

    $DbProbe = Join-Path $EvidenceRoot "attempt-state-readonly.mjs"
    $dbSource = @'
import { neon } from "@neondatabase/serverless";
const EXPECTED_HOST = "ep-ancient-breeze-a52zp9gs-pooler.us-east-2.aws.neon.tech";
const raw = process.env.DATABASE_URL;
const attemptId = process.env.CASA_DIAG_ATTEMPT_ID;
if (!raw || !attemptId) throw new Error("Diagnostic environment is incomplete.");
const parsed = new URL(raw);
if (parsed.hostname !== EXPECTED_HOST) throw new Error(`Refusing non-Development host: ${parsed.hostname}`);
const sql = neon(raw);
const migrations = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
const attempt = await sql`
  select id, operation::text as operation, card_result::text as card_result,
         time_result::text as time_result, face_result::text as face_result,
         liveness_result::text as liveness_result, outcome::text as outcome,
         reason_code, completed_at, created_at
  from attendance_verification_attempts
  where id=${attemptId}::uuid
`;
const live = await sql`
  select id, purpose::text as purpose, status::text as status, provider,
         provider_session_id is not null as provider_session_present,
         failure_code, created_at, completed_at
  from biometric_liveness_sessions
  where attempt_id=${attemptId}::uuid
  order by created_at, id
`;
const protectedCounts = await sql`
  select
    (select count(*)::int from student_attendance_records where source_attempt_id=${attemptId}::uuid) as attendance,
    (select count(*)::int from student_presence_events where attempt_id=${attemptId}::uuid) as presence,
    (select count(*)::int from biometric_verification_evidence where attempt_id=${attemptId}::uuid) as evidence
`;
console.log(JSON.stringify({
  host: parsed.hostname,
  migrations: Number(migrations[0]?.count ?? -1),
  attempt: attempt[0] ?? null,
  livenessSessions: live,
  protectedCounts: protectedCounts[0] ?? null,
}));
'@
    [IO.File]::WriteAllText($DbProbe, $dbSource, $Utf8NoBom)

    $env:CASA_DIAG_ATTEMPT_ID = $AttemptId
    $requiredNode = "--dns-result-order=ipv4first --no-network-family-autoselection"
    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) { $env:NODE_OPTIONS = $requiredNode }
    elseif ($env:NODE_OPTIONS -notmatch 'dns-result-order=ipv4first') { $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) $requiredNode" }

    $dbOutput = @(& node --env-file=.env.local $DbProbe 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $dbOutput | ForEach-Object { Write-Host $_ }
        Stop-Diagnosis "Read-only Development attempt probe failed."
    }
    $dbLines = @($dbOutput | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $DbState = $dbLines[-1] | ConvertFrom-Json
    if ([int]$DbState.migrations -ne 30) { Stop-Diagnosis "Development DB is not at migration 30." }
    if ($null -eq $DbState.attempt) { Stop-Diagnosis "Exact Scanner attempt does not exist in Development." }

    Write-Host "  Development migrations:   30 / VERIFIED"
    Write-Host "  attempt operation:        $($DbState.attempt.operation)"
    Write-Host "  card result:              $($DbState.attempt.card_result)"
    Write-Host "  face result:              $($DbState.attempt.face_result)"
    Write-Host "  liveness result:          $($DbState.attempt.liveness_result)"
    Write-Host "  outcome:                  $($DbState.attempt.outcome)"
    Write-Host "  bound liveness sessions:  $(@($DbState.livenessSessions).Count)"
    Write-Host "  attendance/presence/evidence: $($DbState.protectedCounts.attendance)/$($DbState.protectedCounts.presence)/$($DbState.protectedCounts.evidence)"

    if ([string]$DbState.attempt.outcome -ne "PENDING" -or [string]$DbState.attempt.card_result -ne "MATCHED") {
        Stop-Diagnosis "Pending Scanner attempt is no longer in the expected safe card-matched state."
    }
    if (@($DbState.livenessSessions).Count -ne 0 -or [int]$DbState.protectedCounts.attendance -ne 0 -or [int]$DbState.protectedCounts.presence -ne 0 -or [int]$DbState.protectedCounts.evidence -ne 0) {
        Stop-Diagnosis "Protected attempt state changed; refusing AWS diagnosis."
    }

    Write-Host ""
    Write-Host "==> Inspecting the non-secret AWS profile bridge used by CASA" -ForegroundColor Cyan

    $AwsConfigPath = Join-Path $HOME ".aws\config"
    $backendSection = Get-AwsConfigSection $AwsConfigPath $BackendProfile
    $processSection = Get-AwsConfigSection $AwsConfigPath $LoginProcessProfile
    $loginSection = Get-AwsConfigSection $AwsConfigPath $LoginProfile

    $cfgRoleArn = Get-AwsConfigSetting $backendSection "role_arn"
    $cfgSourceProfile = Get-AwsConfigSetting $backendSection "source_profile"
    $cfgCredentialProcess = Get-AwsConfigSetting $processSection "credential_process"
    $cfgLoginSession = Get-AwsConfigSetting $loginSection "login_session"

    $roleOk = ($cfgRoleArn -eq $ExpectedBackendRoleArn)
    $sourceOk = ($cfgSourceProfile -eq $LoginProcessProfile)
    $bridgeUsesAws = (-not [string]::IsNullOrWhiteSpace($cfgCredentialProcess) -and $cfgCredentialProcess -match '(?i)^\s*aws(?:\.exe)?\s+login\s+export-credentials')

    Write-Host "  ~/.aws/config:             $($(if (Test-Path -LiteralPath $AwsConfigPath) {'PRESENT'} else {'MISSING'}))"
    Write-Host "  backend role ARN:          $($(if ($roleOk) {'VERIFIED'} else {'DRIFT/MISSING'}))"
    Write-Host "  backend source profile:    $($(if ($sourceOk) {'VERIFIED'} else {'DRIFT/MISSING'}))"
    Write-Host "  credential_process bridge: $($(if ($bridgeUsesAws) {'AWS LOGIN EXPORT-CREDENTIALS / VERIFIED'} elseif ($cfgCredentialProcess) {'PRESENT / DIFFERENT'} else {'MISSING'}))"
    Write-Host "  casa-dev login session:    $($(if ($cfgLoginSession) {'CONFIGURED'} else {'MISSING'}))"

    $awsOnPath = Get-Command aws -CommandType Application -ErrorAction SilentlyContinue
    $awsCandidates = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in @(
        "C:\Program Files\Amazon\AWSCLIV2\aws.exe",
        "C:\Program Files (x86)\Amazon\AWSCLIV2\aws.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\Amazon\AWSCLIV2\aws.exe"),
        (Join-Path $env:LOCALAPPDATA "Amazon\AWSCLIV2\aws.exe")
    )) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            if (-not $awsCandidates.Contains($candidate)) { $awsCandidates.Add($candidate) }
        }
    }

    Write-Host "  aws executable on PATH:    $($(if ($awsOnPath) {'YES'} else {'NO'}))"
    Write-Host "  AWS CLI common-path find:  $($(if ($awsCandidates.Count -gt 0) {'YES'} else {'NO'}))"
    if (-not $awsOnPath -and $awsCandidates.Count -gt 0) {
        Write-Host "  implication:               AWS CLI appears installed but is unavailable to CASA's credential_process PATH" -ForegroundColor Yellow
    }
    elseif (-not $awsOnPath -and $bridgeUsesAws) {
        Write-Host "  implication:               CASA credential_process requires 'aws', but the runtime cannot resolve it" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "==> Running CASA-equivalent Node AWS SDK credential/control-plane probe" -ForegroundColor Cyan
    Write-Host "    (GetCallerIdentity + ListCollections + temporary streaming-role AssumeRole only; NO Face Liveness session creation)"

    $AwsProbe = Join-Path $EvidenceRoot "aws-runtime-readonly.mjs"
    $awsSource = @'
import { GetCallerIdentityCommand, AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { ListCollectionsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";

const expectedRegion = "eu-west-1";
const expectedAccount = "938733852185";
const expectedPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/";
const streamRole = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming";

function cleanError(error) {
  const e = error instanceof Error ? error : new Error(String(error));
  const cause = e.cause instanceof Error ? e.cause : null;
  return {
    name: e.name || "Error",
    message: String(e.message || "").replace(/(ASIA|AKIA)[A-Z0-9]{12,}/g, "[REDACTED_AWS_ACCESS_KEY]"),
    causeName: cause?.name || null,
    causeMessage: cause?.message ? String(cause.message).replace(/(ASIA|AKIA)[A-Z0-9]{12,}/g, "[REDACTED_AWS_ACCESS_KEY]") : null,
  };
}

const result = {
  profile: process.env.AWS_PROFILE || null,
  region: process.env.CASA_AWS_REKOGNITION_REGION || process.env.AWS_REGION || null,
  envStaticCredentialVariablesPresent: Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SESSION_TOKEN),
  stage: "INIT",
  identity: null,
  rekognitionListCollections: false,
  streamingRoleAssume: false,
  error: null,
};

try {
  const region = process.env.CASA_AWS_REKOGNITION_REGION || process.env.AWS_REGION || expectedRegion;
  result.stage = "STS_GET_CALLER_IDENTITY";
  const sts = new STSClient({ region });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  result.identity = { account: identity.Account || null, arn: identity.Arn || null };
  if (identity.Account !== expectedAccount || !identity.Arn?.startsWith(expectedPrefix)) {
    result.stage = "WRONG_BACKEND_IDENTITY";
    throw new Error(`Unexpected CASA AWS caller: ${identity.Arn || "missing ARN"}`);
  }

  result.stage = "REKOGNITION_LIST_COLLECTIONS";
  const rekognition = new RekognitionClient({ region });
  await rekognition.send(new ListCollectionsCommand({ MaxResults: 1 }));
  result.rekognitionListCollections = true;

  result.stage = "STS_ASSUME_STREAMING_ROLE";
  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn: streamRole,
    RoleSessionName: `casa-readonly-diag-${Date.now()}`,
    DurationSeconds: 900,
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: ["rekognition:StartFaceLivenessSession"], Resource: "*" }],
    }),
  }));
  result.streamingRoleAssume = Boolean(
    assumed.Credentials?.AccessKeyId &&
    assumed.Credentials?.SecretAccessKey &&
    assumed.Credentials?.SessionToken &&
    assumed.Credentials?.Expiration
  );
  result.stage = "GREEN";
} catch (error) {
  result.error = cleanError(error);
}

console.log("CASA_DIAG_JSON=" + JSON.stringify(result));
'@
    [IO.File]::WriteAllText($AwsProbe, $awsSource, $Utf8NoBom)

    # Mirror the runtime profile explicitly; values are the exact Development authority already proven above.
    $env:AWS_PROFILE = $BackendProfile
    $env:AWS_REGION = $ExpectedRegion
    $env:AWS_DEFAULT_REGION = $ExpectedRegion

    $awsOutput = @(& node --env-file=.env.local $AwsProbe 2>&1)
    $awsOutputSafe = @($awsOutput | ForEach-Object { Safe-Text ([string]$_) })
    $diagLine = @($awsOutputSafe | Where-Object { $_ -like 'CASA_DIAG_JSON=*' }) | Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace([string]$diagLine)) {
        $awsOutputSafe | ForEach-Object { Write-Host $_ }
        Stop-Diagnosis "Node AWS SDK probe did not return structured diagnostic output."
    }

    $AwsState = ([string]$diagLine).Substring("CASA_DIAG_JSON=".Length) | ConvertFrom-Json
    Write-Host "  SDK profile:               $($AwsState.profile)"
    Write-Host "  SDK region:                $($AwsState.region)"
    Write-Host "  inherited static AWS vars: $($(if ($AwsState.envStaticCredentialVariablesPresent) {'PRESENT'} else {'NONE'}))"
    Write-Host "  probe stage:               $($AwsState.stage)"

    $classification = "UNDETERMINED"
    $errorText = ""
    if ($null -ne $AwsState.error) {
        $errorText = (([string]$AwsState.error.name) + " | " + ([string]$AwsState.error.message) + " | " + ([string]$AwsState.error.causeName) + " | " + ([string]$AwsState.error.causeMessage))
        Write-Host "  SDK error:                 $(Safe-Text $errorText)" -ForegroundColor Yellow
    }

    if ([string]$AwsState.stage -eq "GREEN" -and $AwsState.rekognitionListCollections -and $AwsState.streamingRoleAssume) {
        $classification = "AWS_RUNTIME_CONTROL_PLANE_GREEN__ORIGINAL_503_REQUIRES_SERVER_LOG_OR_CONTROLLED_CREATE_PROBE"
        Write-Host "  backend caller identity:   VERIFIED"
        Write-Host "  Rekognition access:        VERIFIED"
        Write-Host "  streaming-role AssumeRole: VERIFIED"
    }
    elseif ([string]$AwsState.stage -eq "WRONG_BACKEND_IDENTITY") {
        $classification = "WRONG_BACKEND_AWS_IDENTITY"
    }
    elseif ([string]$AwsState.stage -eq "STS_GET_CALLER_IDENTITY") {
        if ($bridgeUsesAws -and -not $awsOnPath -and ($errorText -match '(?i)(ENOENT|not recognized|cannot find|spawn\s+aws|credential_process|process credentials|CredentialsProviderError)')) {
            if ($awsCandidates.Count -gt 0) {
                $classification = "AWS_CLI_INSTALLED_BUT_NOT_ON_RUNTIME_PATH__CREDENTIAL_PROCESS_BROKEN"
            }
            else {
                $classification = "AWS_CLI_REQUIRED_BY_CREDENTIAL_PROCESS_BUT_NOT_INSTALLED__CONFIRMED"
            }
        }
        elseif ($errorText -match '(?i)(expired|login session|token.*expired|refresh|unauthorized|credentials.*expired)') {
            $classification = "AWS_LOGIN_SESSION_EXPIRED_OR_UNAVAILABLE"
        }
        elseif ($bridgeUsesAws -and -not $awsOnPath) {
            if ($awsCandidates.Count -gt 0) {
                $classification = "AWS_CLI_INSTALLED_BUT_NOT_ON_RUNTIME_PATH__LIKELY_CREDENTIAL_PROCESS_FAILURE"
            }
            else {
                $classification = "AWS_CLI_REQUIRED_BY_CREDENTIAL_PROCESS_BUT_NOT_INSTALLED__LIKELY_ROOT_CAUSE"
            }
        }
        else {
            $classification = "AWS_BACKEND_CREDENTIAL_CHAIN_FAILURE"
        }
    }
    elseif ([string]$AwsState.stage -eq "REKOGNITION_LIST_COLLECTIONS") {
        if ($errorText -match '(?i)AccessDenied') { $classification = "BACKEND_REKOGNITION_ACCESS_DENIED" }
        else { $classification = "BACKEND_REKOGNITION_CONTROL_PLANE_FAILURE" }
    }
    elseif ([string]$AwsState.stage -eq "STS_ASSUME_STREAMING_ROLE") {
        $classification = "STREAMING_ROLE_ASSUME_FAILURE"
    }

    Write-Host ""
    Write-Host "==> Diagnosis" -ForegroundColor Cyan
    Write-Host "  classification:            $classification" -ForegroundColor Yellow

    if ($classification -match '^AWS_CLI_') {
        Write-Host "  root-cause meaning:         CASA's AWS SDK profile delegates credential export to the 'aws' executable, but the Next.js runtime cannot execute it."
        Write-Host "  expected Scanner symptom:  liveness/start fails before a provider session is bound, returning HTTP 503."
    }
    elseif ($classification -eq "AWS_LOGIN_SESSION_EXPIRED_OR_UNAVAILABLE") {
        Write-Host "  root-cause meaning:         AWS login/session credentials cannot currently be exported for the CASA backend role."
    }
    elseif ($classification -eq "AWS_RUNTIME_CONTROL_PLANE_GREEN__ORIGINAL_503_REQUIRES_SERVER_LOG_OR_CONTROLLED_CREATE_PROBE") {
        Write-Host "  meaning:                    Credential chain, Rekognition control plane and streaming-role assumption are currently green."
        Write-Host "  next safe step:             inspect/capture the exact server-side 503 or perform one separately authorized controlled CreateFaceLivenessSession probe."
    }

    $result = [ordered]@{
        createdAt = (Get-Date -Format o)
        proof = "CASA_SCANNER_LIVENESS_START_503_RUNTIME_CREDENTIAL_DIAGNOSIS_V3"
        classification = $classification
        branch = $branch
        head = $head
        scannerSha256 = (Sha $ScannerPath)
        awsLivenessSha256 = (Sha $AwsPath)
        developmentHost = $ExpectedDevelopmentHost
        developmentMigrations = 30
        attemptId = $AttemptId
        attemptOperation = [string]$DbState.attempt.operation
        cardResult = [string]$DbState.attempt.card_result
        faceResult = [string]$DbState.attempt.face_result
        livenessResult = [string]$DbState.attempt.liveness_result
        outcome = [string]$DbState.attempt.outcome
        livenessSessionCount = @($DbState.livenessSessions).Count
        attendanceRows = [int]$DbState.protectedCounts.attendance
        presenceRows = [int]$DbState.protectedCounts.presence
        evidenceRows = [int]$DbState.protectedCounts.evidence
        awsConfigPresent = (Test-Path -LiteralPath $AwsConfigPath -PathType Leaf)
        backendRoleConfigVerified = $roleOk
        sourceProfileConfigVerified = $sourceOk
        credentialProcessUsesAwsCli = $bridgeUsesAws
        awsExecutableOnPath = [bool]$awsOnPath
        awsCliFoundAtCommonPath = ($awsCandidates.Count -gt 0)
        sdkStage = [string]$AwsState.stage
        sdkRekognitionListCollections = [bool]$AwsState.rekognitionListCollections
        sdkStreamingRoleAssume = [bool]$AwsState.streamingRoleAssume
        scannerMutation = $false
        databaseMutation = $false
        attendanceMutation = $false
        faceLivenessSessionCreatedByDiagnosis = $false
        persistentAwsMutation = $false
        stagingConnected = $false
        productionConnected = $false
    }
    [IO.File]::WriteAllText((Join-Path $EvidenceRoot "RESULT.json"), ($result | ConvertTo-Json -Depth 10), $Utf8NoBom)

    Write-Host ""
    Write-Host "CASA SCANNER LIVENESS START 503 RUNTIME DIAGNOSIS COMPLETE" -ForegroundColor Green
    Write-Host "  classification:             $classification"
    Write-Host "  exact attempt:              $AttemptId"
    Write-Host "  attempt remains pending:    YES"
    Write-Host "  Face Liveness sessions:     0 / NO SESSION CREATED BY DIAGNOSIS"
    Write-Host "  attendance/presence/evidence: 0/0/0"
    Write-Host "  source mutation:            NO"
    Write-Host "  DB/attendance mutation:     NO"
    Write-Host "  persistent AWS mutation:    NO"
    Write-Host "  Staging touched:            NO"
    Write-Host "  Production touched:         NO"
    Write-Host "  evidence:                   $EvidenceRoot"
    Write-Host ""
    Write-Host "Return this complete output. DO NOT rescan yet." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA SCANNER LIVENESS 503 RUNTIME DIAGNOSIS STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    if ($EvidenceRoot) { Write-Host "Evidence: $EvidenceRoot" }
    throw
}
finally {
    if ($null -ne $OriginalNodeOptions) { $env:NODE_OPTIONS = $OriginalNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalDiagAttempt) { $env:CASA_DIAG_ATTEMPT_ID = $OriginalDiagAttempt } else { Remove-Item Env:CASA_DIAG_ATTEMPT_ID -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsProfile) { $env:AWS_PROFILE = $OriginalAwsProfile } else { Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsRegion) { $env:AWS_REGION = $OriginalAwsRegion } else { Remove-Item Env:AWS_REGION -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalAwsDefaultRegion) { $env:AWS_DEFAULT_REGION = $OriginalAwsDefaultRegion } else { Remove-Item Env:AWS_DEFAULT_REGION -ErrorAction SilentlyContinue }
    if ($DbProbe -and (Test-Path -LiteralPath $DbProbe -PathType Leaf)) { Remove-Item -LiteralPath $DbProbe -Force -ErrorAction SilentlyContinue }
    if ($AwsProbe -and (Test-Path -LiteralPath $AwsProbe -PathType Leaf)) { Remove-Item -LiteralPath $AwsProbe -Force -ErrorAction SilentlyContinue }
}
