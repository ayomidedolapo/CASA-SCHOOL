param([string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "4dedfab"
$ExpectedMigrationCount = 28
$ExpectedScannerHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90"
$ExpectedScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"
$PinnedMigrations = [ordered]@{
  "drizzle\20260901081825_attendance-readiness-card-replacement\migration.sql" = "085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b"
  "drizzle\20260902190300_wave1_transport_casa_internal\migration.sql" = "5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3"
  "drizzle\20260902201500_wave2_structure_audit\migration.sql" = "96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f"
  "drizzle\20260905030000_internal_face_authority\migration.sql" = "cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7"
  "drizzle\20260907043140_attendance-session-reopen\migration.sql" = "881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd"
  "drizzle\20260907105900_attendance-session-event-stream-multicycle\migration.sql" = "bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4"
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) { Write-Host ""; Write-Host "ABORTED: $Message" -ForegroundColor Red; throw $Message }
function Step([string]$Message) { Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Sha([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail "Required file missing: $Path" }
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function ReadText([string]$Relative) {
  $p = Join-Path $ProjectRoot $Relative
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return "" }
  [System.IO.File]::ReadAllText($p)
}
function HasAny([string]$Text,[string[]]$Markers) {
  foreach($m in $Markers){ if($Text.IndexOf($m,[System.StringComparison]::OrdinalIgnoreCase)-ge 0){return $true} }
  return $false
}
function FindFiles([string[]]$Patterns) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach($rootRel in @("src","scripts","docs")) {
    $root = Join-Path $ProjectRoot $rootRel
    if(-not (Test-Path -LiteralPath $root -PathType Container)){continue}
    Get-ChildItem -LiteralPath $root -Recurse -File -Include *.ts,*.tsx,*.js,*.mjs,*.md -ErrorAction SilentlyContinue | ForEach-Object {
      try {$t=[System.IO.File]::ReadAllText($_.FullName)} catch {return}
      foreach($p in $Patterns){
        if($t.IndexOf($p,[System.StringComparison]::OrdinalIgnoreCase)-ge 0){
          $r=(($_.FullName.Substring($ProjectRoot.Length)) -replace '^[\\/]+', '')
          if(-not $out.Contains($r)){$out.Add($r)}
          break
        }
      }
    }
  }
  @($out)
}

try {
  Write-Host "CASA School - Pre-Staging Real-World Flow Adjustment Preflight V1R1" -ForegroundColor Green
  Write-Host "READ-ONLY inspection. No source, DB, migration, AWS, Staging or Production mutation."
  if(-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)){Fail "Repository not found: $ProjectRoot"}
  Set-Location $ProjectRoot

  Step "Verifying exact repository authority"
  $branch=(& git branch --show-current).Trim(); $head=(& git rev-parse --short HEAD).Trim()
  if($branch-ne$ExpectedBranch){Fail "Expected branch $ExpectedBranch; found $branch."}
  if($head-ne$ExpectedHead){Fail "Expected HEAD $ExpectedHead; found $head."}
  $migrations=@(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Recurse -File -Filter migration.sql | Where-Object {$_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'} | Sort-Object FullName)
  if($migrations.Count-ne$ExpectedMigrationCount){Fail "Expected $ExpectedMigrationCount local migrations; found $($migrations.Count)."}
  foreach($e in $PinnedMigrations.GetEnumerator()){if((Sha (Join-Path $ProjectRoot $e.Key))-ne$e.Value){Fail "Pinned migration drift: $($e.Key)"}}
  $scanner=Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"; $scannerCss=Join-Path $ProjectRoot "src\app\scanner\scanner.module.css"
  if((Sha $scanner)-ne$ExpectedScannerHash){Fail "Scanner trust-path drift."}
  if((Sha $scannerCss)-ne$ExpectedScannerCssHash){Fail "Scanner CSS drift."}
  $evidence=Join-Path $ProjectRoot (".casa-backups\pre-staging-real-world-flow-preflight-v1-"+(Get-Date -Format "yyyyMMdd-HHmmss")); New-Item -ItemType Directory -Path $evidence -Force | Out-Null

  Step "Reading attendance authority, pause/resume, late-arrival and session semantics"
  $http=ReadText "src\server\attendance\http.ts"
  $lifeRoute=ReadText "src\app\api\schools\[slug]\attendance\lifecycle\route.ts"
  $readiness=ReadText "src\server\attendance\readiness.ts"
  $sessionsRoute=ReadText "src\app\api\schools\[slug]\attendance\sessions\today\route.ts"
  $sessionMgmt=ReadText "src\server\attendance\session-management.ts"
  $attendanceClient=ReadText "src\app\schools\[slug]\attendance\attendance-client.tsx"
  $scanOperation=ReadText "src\server\attendance\scan-operation.ts"
  $terminalSession=ReadText "src\server\attendance\terminal-session.ts"
  $scanRoute=ReadText "src\app\api\terminal\scan\route.ts"
  $scanAll=$scanOperation+"`n"+$terminalSession+"`n"+$scanRoute

  $operatorHasTech=($http -match 'requireAttendanceOperator[\s\S]{0,500}SCHOOL_TECHNICIAN')
  $managerOwnerAdmin=($http -match 'requireAttendanceManager[\s\S]{0,500}OWNER[\s\S]{0,200}ADMIN' -and $http -notmatch 'requireAttendanceManager[\s\S]{0,500}SCHOOL_TECHNICIAN')
  $lifecycleManager=($lifeRoute -match 'export async function POST[\s\S]{0,800}requireAttendanceManager')
  $sessionManager=($sessionsRoute -match 'requireAttendanceManager')
  $pauseBlocksOpen=($readiness.Contains("ATTENDANCE_OPEN_SESSION_MUST_CLOSE") -and $readiness.Contains("Close the currently open attendance session before pausing attendance."))
  $scheduledResume=HasAny $readiness @("resume_at","resumeAt","scheduled_resume","autoResume","auto_resume")
  $normalLate = HasAny $scanAll @("classifyCheckIn", "LATE")
  $outsideWindow=HasAny $scanAll @("OUTSIDE_WINDOW")
  $lateAuth=HasAny ($scanAll+"`n"+$sessionMgmt+"`n"+$attendanceClient) @("LATE_ARRIVAL_AUTH_REQUIRED","late-arrival","late arrival authorization","LATE_ENTRY_AUTH","supervised late")
  $sameDayReopen=HasAny ($sessionMgmt+"`n"+$sessionsRoute+"`n"+$attendanceClient) @("Reopen today","REOPENED","ATTENDANCE_SESSION_REOPEN")

  Write-Host "  Technician operator/read support:           $operatorHasTech"
  Write-Host "  OWNER/ADMIN manager authority:              $managerOwnerAdmin"
  Write-Host "  lifecycle mutations manager-gated:          $lifecycleManager"
  Write-Host "  Today-session mutations manager-gated:      $sessionManager"
  Write-Host "  Pause blocked while a session is OPEN:      $pauseBlocksOpen"
  Write-Host "  scheduled/automatic resume signal:          $scheduledResume"
  Write-Host "  normal LATE classification signal:          $normalLate"
  Write-Host "  OUTSIDE_WINDOW signal:                      $outsideWindow"
  Write-Host "  supervised after-window late-arrival path:  $lateAuth"
  Write-Host "  same-day reopen capability:                 $sameDayReopen"

  Step "Checking whether CASA internal onboarding is truly one student folder"
  $onboarding=ReadText "src\app\internal\onboarding\onboarding-client.tsx"
  $one=[ordered]@{
    student=(HasAny $onboarding @("firstName","dateOfBirth","student"))
    guardian=(HasAny $onboarding @("guardian","Link guardian"))
    enrollment=(HasAny $onboarding @("classArm","enrollment","Assign class"))
    face=(HasAny $onboarding @("Capture Face","FaceLiveness","biometric"))
    arrival=(HasAny $onboarding @("SCHOOL_BUS","INDEPENDENT","arrivalMethod","arrival-method"))
    card=(HasAny $onboarding @("card readiness","card status","production","ID card"))
    release=(HasAny $onboarding @("Release","/lock"))
    nextIncomplete=(HasAny $onboarding @("Next Incomplete","next incomplete"))
  }
  foreach($k in $one.Keys){Write-Host ("  {0,-18} {1}" -f ($k+":"),$one[$k])}

  Step "Checking CASA-team account and WhatsApp operational surfaces"
  $internalAccess=FindFiles @("casa_internal_memberships","CASA_SUPER_ADMIN","CASA_TEAM")
  $invite=FindFiles @("Invite CASA","invite team","CASA Team member","internal invitation","internal invite")
  $whatsapp=FindFiles @("WhatsApp","whatsapp","school_notification_outbox","school_messaging_sender")
  $provider=FindFiles @("graph.facebook.com","Twilio","WHATSAPP_ACCESS_TOKEN","WHATSAPP_PHONE_NUMBER_ID","sendWhatsApp","dispatchWhatsApp")
  $worker=FindFiles @("outbox worker","delivery attempt","school_notification_outbox","PROCESSING")
  Write-Host "  internal-access files:      $($internalAccess.Count)"
  Write-Host "  CASA-team invite UI signals:$($invite.Count)"
  Write-Host "  WhatsApp/outbox files:      $($whatsapp.Count)"
  Write-Host "  provider integration files: $($provider.Count)"
  Write-Host "  worker/dispatcher files:    $($worker.Count)"
  Write-Host "  live WhatsApp test:         NOT PERFORMED"

  Step "Writing evidence"
  $report=New-Object System.Collections.Generic.List[string]
  $report.Add("CASA PRE-STAGING REAL-WORLD FLOW ADJUSTMENT PREFLIGHT V1R1")
  $report.Add("created=$(Get-Date -Format o)"); $report.Add("branch=$branch"); $report.Add("HEAD=$head"); $report.Add("local_migrations=$($migrations.Count)")
  $report.Add(""); $report.Add("[ATTENDANCE]")
  $report.Add("operator_includes_school_technician=$operatorHasTech"); $report.Add("manager_owner_admin_only=$managerOwnerAdmin"); $report.Add("lifecycle_mutations_manager_only=$lifecycleManager"); $report.Add("session_mutations_manager_only=$sessionManager")
  $report.Add("pause_blocks_open_session=$pauseBlocksOpen"); $report.Add("scheduled_resume_signal=$scheduledResume"); $report.Add("normal_late_classification=$normalLate"); $report.Add("outside_window=$outsideWindow"); $report.Add("supervised_after_window_late_arrival=$lateAuth"); $report.Add("same_day_reopen=$sameDayReopen")
  $report.Add(""); $report.Add("[ONBOARDING_ONE_FOLDER]"); foreach($k in $one.Keys){$report.Add("$k=$($one[$k])")}
  $report.Add(""); $report.Add("[CASA_INTERNAL]"); $report.Add("internal_access_files=$($internalAccess.Count)"); $report.Add("invite_signal_files=$($invite.Count)"); foreach($f in $invite){$report.Add("invite_file=$f")}
  $report.Add(""); $report.Add("[WHATSAPP]"); $report.Add("whatsapp_files=$($whatsapp.Count)"); $report.Add("provider_files=$($provider.Count)"); $report.Add("worker_files=$($worker.Count)"); $report.Add("live_test=NO"); foreach($f in $provider){$report.Add("provider_file=$f")}; foreach($f in $worker){$report.Add("worker_file=$f")}
  $last=$migrations | Select-Object -Last 1; $report.Add(""); $report.Add("[LATEST_MIGRATION]"); $report.Add("path=$((($last.FullName.Substring($ProjectRoot.Length)) -replace '^[\\/]+', ''))"); $report.Add("sha256=$(Sha $last.FullName)")
  $report.Add(""); $report.Add("MUTATION=NONE"); $report.Add("DB_CONNECTED=NO"); $report.Add("AWS_CONNECTED=NO"); $report.Add("STAGING_CONNECTED=NO"); $report.Add("PRODUCTION_CONNECTED=NO")
  $reportPath=Join-Path $evidence "REPORT.txt"; [System.IO.File]::WriteAllLines($reportPath,$report,$Utf8NoBom)

  Write-Host ""
  Write-Host "CASA PRE-STAGING REAL-WORLD FLOW ADJUSTMENT PREFLIGHT V1R1 IS COMPLETE" -ForegroundColor Green
  Write-Host "  source/DB/migration/AWS mutation: NONE"
  Write-Host "  Staging/Production:              NOT TOUCHED"
  Write-Host "  report:                          $reportPath"
  Write-Host ""
  Write-Host "NEXT: paste the complete console output and REPORT.txt. Then we will make the guarded Development adjustment pass." -ForegroundColor Yellow
}
catch {
  Write-Host ""; Write-Host "CASA preflight failed." -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor Red; exit 1
}
