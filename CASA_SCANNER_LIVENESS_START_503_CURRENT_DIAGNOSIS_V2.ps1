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
$ExpectedScannerHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90"
$ExpectedAwsLivenessHash = "a1bd8db909b88ba9f0c4f3e03199ad24521acb161e84b49bb9ca0f54cc451a2f"
$ExpectedAccount = "938733852185"
$ExpectedBackendPrefix = "arn:aws:sts::938733852185:assumed-role/CASA-School-Dev-Biometric-Backend/"
$LoginProfile = "casa-dev"
$LoginProcessProfile = "casa-login-process"
$BackendProfile = "casa-biometric-dev"
$ExpectedRegion = "eu-west-1"
$StreamingRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Liveness-Streaming"
$BackendRoleArn = "arn:aws:iam::938733852185:role/CASA-School-Dev-Biometric-Backend"
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

function Safe-LogLine([string]$Line) {
    $safe = $Line
    $safe = $safe -replace '(?i)(accessKeyId|secretAccessKey|sessionToken|authorization|cookie|set-cookie)(["''\s:=]+)[^,\s}]+', '$1$2[REDACTED]'
    $safe = $safe -replace '(?i)(ASIA|AKIA)[A-Z0-9]{12,}', '[REDACTED_AWS_ACCESS_KEY]'
    $safe = $safe -replace '(?i)(SessionId|providerSessionId)(["''\s:=]+)[A-Za-z0-9-]+', '$1$2[REDACTED_PROVIDER_SESSION]'
    return $safe
}

function Invoke-AwsCapture([string[]]$Arguments) {
    $stderrPath = [IO.Path]::GetTempFileName()
    $previous = $ErrorActionPreference
    $stdout = @()
    $exitCode = $null
    try {
        $ErrorActionPreference = "Continue"
        $stdout = @(& aws @Arguments 2> $stderrPath)
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
        ExitCode = $exitCode
        Stdout = @($stdout | ForEach-Object { [string]$_ })
        Stderr = @($stderr | ForEach-Object { [string]$_ })
    }
}

function Aws-FailureSummary($Result) {
    $text = (@($Result.Stderr) + @($Result.Stdout)) -join " | "
    $text = Safe-LogLine $text
    if ($text.Length -gt 900) { $text = $text.Substring(0, 900) + "..." }
    return $text
}

Write-Host "CASA School - Current Scanner Liveness Start 503 Diagnosis V2" -ForegroundColor Cyan
Write-Host "READ-ONLY diagnostic for the exact current Development scanner attempt."
Write-Host "No new scan. No Face Liveness session creation. No DB write. No AWS mutation. No Staging/Production connection."
Write-Host "Attempt: $AttemptId"
Write-Host ""

$OriginalNodeOptions = $env:NODE_OPTIONS
$OriginalDiagAttempt = $env:CASA_DIAG_ATTEMPT_ID
$EvidenceRoot = $null
$DbProbe = $null

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Stop-Diagnosis "CASA project root not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Write-Host "==> Re-proving current CASA source boundary" -ForegroundColor Cyan
    $branch = (& git branch --show-current).Trim()
    $head = (& git rev-parse --short=7 HEAD).Trim()
    if ($branch -ne $ExpectedBranch -or $head -ne $ExpectedHead) {
        Stop-Diagnosis "Git checkpoint drift: $branch/$head"
    }

    $ScannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $AwsPath = Join-Path $ProjectRoot "src\server\biometrics\aws-liveness.ts"
    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Stop-Diagnosis "Scanner trust path drift."
    }
    if ((Sha $AwsPath) -ne $ExpectedAwsLivenessHash) {
        Stop-Diagnosis "AWS liveness authority drift."
    }

    $migrationFiles = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Filter "migration.sql" -File -Recurse -ErrorAction Stop
    )
    if ($migrationFiles.Count -ne $ExpectedMigrationCount) {
        Stop-Diagnosis "Expected 30 local migrations; found $($migrationFiles.Count)."
    }

    Write-Host "  branch/head:              $branch/$head"
    Write-Host "  local migrations:         30 / VERIFIED"
    Write-Host "  Scanner authority:        LOCKED"
    Write-Host "  AWS liveness authority:   LOCKED"

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

    Write-Host ""
    Write-Host "==> Reading non-secret Development biometric configuration" -ForegroundColor Cyan
    Write-Host "  Development host:         $ExpectedDevelopmentHost"
    Write-Host "  provider mode:            $($(if ($ProviderMode) {$ProviderMode} else {'NOT_IN_ENV_FILE'}))"
    Write-Host "  AWS_PROFILE in .env:      $($(if ($EnvAwsProfile) {$EnvAwsProfile} else {'NOT_IN_ENV_FILE / MAY BE HARNESS-INJECTED'}))"
    Write-Host "  AWS_REGION in .env:       $($(if ($EnvAwsRegion) {$EnvAwsRegion} else {'NOT_IN_ENV_FILE / MAY BE HARNESS-INJECTED'}))"
    Write-Host "  CASA region in .env:      $($(if ($EnvCasaRegion) {$EnvCasaRegion} else {'NOT_IN_ENV_FILE / MAY BE HARNESS-INJECTED'}))"
    Write-Host "  stream role in .env:      $($(if ($EnvStreamRole) {'PRESENT'} else {'NOT_IN_ENV_FILE / MAY BE HARNESS-INJECTED'}))"

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $ProjectRoot ".casa-backups\scanner-liveness-start-503-diagnosis-v2-$stamp"
    New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

    Write-Host ""
    Write-Host "==> Locating the exact failed Scanner server evidence" -ForegroundColor Cyan
    $backupRoot = Join-Path $ProjectRoot ".casa-backups"
    $logFiles = @()
    if (Test-Path -LiteralPath $backupRoot -PathType Container) {
        $logFiles = @(
            Get-ChildItem -LiteralPath $backupRoot -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -in @("dev-server.stdout.log", "dev-server.stderr.log") } |
                Sort-Object LastWriteTime -Descending
        )
    }

    $matchingLogs = New-Object System.Collections.Generic.List[object]
    foreach ($log in ($logFiles | Select-Object -First 30)) {
        $tail = @(Get-Content -LiteralPath $log.FullName -Tail 3000 -ErrorAction SilentlyContinue)
        if (@($tail | Where-Object { $_ -match [regex]::Escape($AttemptId) }).Count -gt 0) {
            $matchingLogs.Add([pscustomobject]@{ File=$log; Lines=$tail })
        }
    }

    if ($matchingLogs.Count -eq 0) {
        Write-Host "  exact attempt in captured evidence logs: NOT FOUND"
        Write-Host "  implication: the 503 may have come from a manually started/non-evidence dev server."
    }
    else {
        Write-Host "  exact attempt in captured evidence logs: FOUND"
        foreach ($match in $matchingLogs) {
            Write-Host ""
            Write-Host "--- $($match.File.FullName) ---"
            $interesting = @(
                $match.Lines |
                    Where-Object {
                        $_ -match [regex]::Escape($AttemptId) -or
                        $_ -match '(?i)(liveness/start|AWS_BIOMETRIC_UNAVAILABLE|AwsBiometricUnavailableError|Unable to create an AWS Face Liveness session|Unable to issue temporary Face Liveness streaming credentials|CreateFaceLivenessSession|AssumeRole|AccessDenied|ExpiredToken|InvalidClientTokenId|CredentialsProviderError|Timeout|fetch failed|ECONN|ETIMEDOUT|503|rekognition|sts)'
                    } |
                    Select-Object -Last 180
            )
            if ($interesting.Count -eq 0) { Write-Host "no additional diagnostic lines" }
            else { $interesting | ForEach-Object { Write-Host (Safe-LogLine ([string]$_) ) } }
        }
    }

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
  select
    id,
    school_id,
    session_id,
    terminal_id,
    student_id,
    card_id,
    operation::text as operation,
    card_result::text as card_result,
    time_result::text as time_result,
    face_result::text as face_result,
    liveness_result::text as liveness_result,
    outcome::text as outcome,
    reason_code,
    occurred_at,
    completed_at,
    created_at
  from attendance_verification_attempts
  where id=${attemptId}::uuid
`;
const live = await sql`
  select
    id,
    purpose::text as purpose,
    status::text as status,
    provider,
    provider_session_id is not null as provider_session_present,
    expires_at,
    failure_code,
    liveness_confidence_bps,
    face_similarity_bps,
    created_at,
    completed_at
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
    if ([int]$DbState.migrations -ne 30) {
        Stop-Diagnosis "Development is no longer at migration 30; found $($DbState.migrations)."
    }
    if ($null -eq $DbState.attempt) {
        Stop-Diagnosis "Exact scanner attempt $AttemptId does not exist in Development."
    }

    Write-Host "  Development migrations:   30 / VERIFIED"
    Write-Host "  attempt operation:        $($DbState.attempt.operation)"
    Write-Host "  card result:              $($DbState.attempt.card_result)"
    Write-Host "  face result:              $($DbState.attempt.face_result)"
    Write-Host "  liveness result:          $($DbState.attempt.liveness_result)"
    Write-Host "  outcome:                  $($DbState.attempt.outcome)"
    Write-Host "  bound liveness sessions:  $(@($DbState.livenessSessions).Count)"
    Write-Host "  attendance/presence/evidence: $($DbState.protectedCounts.attendance)/$($DbState.protectedCounts.presence)/$($DbState.protectedCounts.evidence)"

    Write-Host ""
    Write-Host "==> AWS control-plane diagnosis (READ ONLY)" -ForegroundColor Cyan
    if (-not (Get-Command aws -CommandType Application -ErrorAction SilentlyContinue)) {
        Stop-Diagnosis "AWS CLI is not installed or not on PATH."
    }

    $classification = "UNDETERMINED"

    $roleArnCfg = Invoke-AwsCapture @('configure','get','role_arn','--profile',$BackendProfile)
    $sourceProfileCfg = Invoke-AwsCapture @('configure','get','source_profile','--profile',$BackendProfile)
    $credentialProcessCfg = Invoke-AwsCapture @('configure','get','credential_process','--profile',$LoginProcessProfile)
    $loginSessionCfg = Invoke-AwsCapture @('configure','get','login_session','--profile',$LoginProfile)

    Write-Host "  backend profile role ARN: $($(if (($roleArnCfg.Stdout -join '').Trim() -eq $BackendRoleArn) {'VERIFIED'} else {'DRIFT/MISSING'}))"
    Write-Host "  backend source profile:   $($(if (($sourceProfileCfg.Stdout -join '').Trim() -eq $LoginProcessProfile) {'VERIFIED'} else {'DRIFT/MISSING'}))"
    Write-Host "  login-process bridge:     $($(if (($credentialProcessCfg.Stdout -join ' ') -match 'export-credentials\s+--profile\s+casa-dev\s+--format\s+process') {'VERIFIED'} else {'DRIFT/MISSING'}))"
    Write-Host "  casa-dev login session:   $($(if (($loginSessionCfg.Stdout -join '').Trim()) {'CONFIGURED'} else {'MISSING'}))"

    $identity = Invoke-AwsCapture @('sts','get-caller-identity','--profile',$BackendProfile,'--region',$ExpectedRegion,'--query','[Account,Arn]','--output','text','--no-cli-pager')
    if ($identity.ExitCode -ne 0) {
        $classification = "BACKEND_AWS_CREDENTIAL_CHAIN_FAILURE"
        Write-Host "  backend caller identity:  FAIL" -ForegroundColor Red
        Write-Host "  AWS error: $(Aws-FailureSummary $identity)"
    }
    else {
        $identityText = ($identity.Stdout -join " ").Trim()
        $parts = @($identityText -split '\s+')
        $account = if ($parts.Count -ge 1) { $parts[0] } else { '' }
        $arn = if ($parts.Count -ge 2) { $parts[1] } else { '' }
        if ($account -ne $ExpectedAccount -or -not $arn.StartsWith($ExpectedBackendPrefix)) {
            $classification = "WRONG_BACKEND_AWS_IDENTITY"
            Write-Host "  backend caller identity:  WRONG ROLE/ACCOUNT" -ForegroundColor Red
        }
        else {
            Write-Host "  backend caller identity:  VERIFIED"

            $rekognition = Invoke-AwsCapture @('rekognition','list-collections','--max-results','1','--profile',$BackendProfile,'--region',$ExpectedRegion,'--query','length(CollectionIds)','--output','text','--no-cli-pager')
            if ($rekognition.ExitCode -ne 0) {
                $classification = "BACKEND_REKOGNITION_ACCESS_FAILURE"
                Write-Host "  Rekognition control plane: FAIL" -ForegroundColor Red
                Write-Host "  AWS error: $(Aws-FailureSummary $rekognition)"
            }
            else {
                Write-Host "  Rekognition control plane: VERIFIED"

                $policy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["rekognition:StartFaceLivenessSession"],"Resource":"*"}]}'
                $sessionName = "casa-readonly-diag-" + (Get-Date -Format "yyyyMMddHHmmss")
                $stream = Invoke-AwsCapture @('sts','assume-role','--role-arn',$StreamingRoleArn,'--role-session-name',$sessionName,'--duration-seconds','900','--policy',$policy,'--profile',$BackendProfile,'--region',$ExpectedRegion,'--query','Credentials.Expiration','--output','text','--no-cli-pager')
                if ($stream.ExitCode -ne 0) {
                    $classification = "STREAMING_ROLE_ASSUME_FAILURE"
                    Write-Host "  streaming-role AssumeRole: FAIL" -ForegroundColor Red
                    Write-Host "  AWS error: $(Aws-FailureSummary $stream)"
                }
                else {
                    Write-Host "  streaming-role AssumeRole: VERIFIED"

                    $sim = Invoke-AwsCapture @('iam','simulate-principal-policy','--policy-source-arn',$BackendRoleArn,'--action-names','rekognition:CreateFaceLivenessSession','rekognition:GetFaceLivenessSessionResults','sts:AssumeRole','--resource-arns','*','--profile',$LoginProfile,'--region',$ExpectedRegion,'--query','EvaluationResults[].[EvalActionName,EvalDecision]','--output','text','--no-cli-pager')
                    if ($sim.ExitCode -eq 0) {
                        $simText = ($sim.Stdout -join " | ")
                        Write-Host "  IAM liveness permission simulation: $simText"
                        if ($simText -match '(?i)implicitDeny|explicitDeny') {
                            $classification = "BACKEND_LIVENESS_PERMISSION_DENIED"
                        }
                    }
                    else {
                        Write-Host "  IAM simulation: unavailable/non-authoritative ($(Aws-FailureSummary $sim))" -ForegroundColor Yellow
                    }

                    if ($classification -eq "UNDETERMINED") {
                        if (@($DbState.livenessSessions).Count -eq 0) {
                            if ($matchingLogs.Count -eq 0) {
                                $classification = "AWS_CONTROL_PLANE_GREEN__SERVER_RUNTIME_NOT_PROVEN_AWS_CONFIGURED"
                            }
                            else {
                                $classification = "AWS_CONTROL_PLANE_GREEN__FAILURE_BEFORE_LIVENESS_DB_BIND__CREATE_CALL_OR_TRANSIENT"
                            }
                        }
                        else {
                            $classification = "LIVENESS_SESSION_WAS_BOUND__FAILURE_OCCURRED_AFTER_PROVIDER_AND_STREAM_CREDENTIAL_CREATION"
                        }
                    }
                }
            }
        }
    }

    $result = [ordered]@{
        createdAt = (Get-Date -Format o)
        proof = "CASA_SCANNER_LIVENESS_START_503_CURRENT_DIAGNOSIS_V2"
        classification = $classification
        branch = $branch
        head = $head
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
        scannerEvidenceLogMatched = ($matchingLogs.Count -gt 0)
        scannerMutation = $false
        databaseMutation = $false
        awsProviderSessionCreatedByDiagnosis = $false
        awsDataMutation = $false
        stagingConnected = $false
        productionConnected = $false
    }
    [IO.File]::WriteAllText((Join-Path $EvidenceRoot "RESULT.json"), ($result | ConvertTo-Json -Depth 10), $Utf8NoBom)

    Write-Host ""
    Write-Host "CASA SCANNER LIVENESS START 503 DIAGNOSIS COMPLETE" -ForegroundColor Green
    Write-Host "  classification:            $classification"
    Write-Host "  exact attempt:             $AttemptId"
    Write-Host "  Development migrations:    30 / READ-ONLY VERIFIED"
    Write-Host "  Scanner source mutation:   NO"
    Write-Host "  DB mutation:               NO"
    Write-Host "  AWS Face Liveness session created by diagnosis: NO"
    Write-Host "  Staging touched:           NO"
    Write-Host "  Production touched:        NO"
    Write-Host "  evidence:                  $EvidenceRoot"
    Write-Host ""
    Write-Host "Return this complete output. DO NOT rescan and DO NOT rerun Staging promotion yet." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA SCANNER 503 DIAGNOSIS STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    if ($EvidenceRoot) { Write-Host "Evidence: $EvidenceRoot" }
    throw
}
finally {
    if ($null -ne $OriginalNodeOptions) { $env:NODE_OPTIONS = $OriginalNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalDiagAttempt) { $env:CASA_DIAG_ATTEMPT_ID = $OriginalDiagAttempt } else { Remove-Item Env:CASA_DIAG_ATTEMPT_ID -ErrorAction SilentlyContinue }
    if ($DbProbe -and (Test-Path -LiteralPath $DbProbe -PathType Leaf)) {
        Remove-Item -LiteralPath $DbProbe -Force -ErrorAction SilentlyContinue
    }
}