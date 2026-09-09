param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$RequiredAncestor = "4dedfab"
$ExpectedMigrationCount = 28
$ExpectedScannerHash = "bae161ca1d8ad1d5ccb4c24e477ff8e8f980f93dce2ac7042678b65a391fbf90"
$ExpectedScannerCssHash = "d09fdc74d3649aa6f0876ddbbfc2754cb6da2950c8171820e44860e68f9149ba"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "ABORTED: $Message" -ForegroundColor Red
    throw $Message
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return "MISSING"
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Rel([string]$Path) {
    return ($Path.Substring($ProjectRoot.Length)) -replace '^[\\/]+', ''
}

function ReadText([string]$Relative) {
    $Path = Join-Path $ProjectRoot $Relative
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return ""
    }
    return [System.IO.File]::ReadAllText($Path)
}

function Exists([string]$Relative) {
    return Test-Path -LiteralPath (Join-Path $ProjectRoot $Relative) -PathType Leaf
}

function HasAny([string]$Text, [string[]]$Markers) {
    foreach ($Marker in $Markers) {
        if ($Text.IndexOf($Marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }
    return $false
}

function FindSourceFiles([string[]]$Patterns) {
    $Found = New-Object System.Collections.Generic.List[string]
    foreach ($RootRelative in @("src", "scripts", "docs")) {
        $Root = Join-Path $ProjectRoot $RootRelative
        if (-not (Test-Path -LiteralPath $Root -PathType Container)) { continue }

        Get-ChildItem -LiteralPath $Root -Recurse -File -Include *.ts,*.tsx,*.js,*.mjs,*.md -ErrorAction SilentlyContinue |
            ForEach-Object {
                $Text = ""
                try { $Text = [System.IO.File]::ReadAllText($_.FullName) } catch { return }
                foreach ($Pattern in $Patterns) {
                    if ($Text.IndexOf($Pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                        $R = Rel $_.FullName
                        if (-not $Found.Contains($R)) { [void]$Found.Add($R) }
                        break
                    }
                }
            }
    }
    return @($Found.ToArray())
}

function AddSection([System.Collections.Generic.List[string]]$Report, [string]$Title) {
    [void]$Report.Add("")
    [void]$Report.Add("[$Title]")
}

function AddFileHash([System.Collections.Generic.List[string]]$Report, [string]$Relative) {
    $Full = Join-Path $ProjectRoot $Relative
    [void]$Report.Add("$Relative=$(Sha $Full)")
}

try {
    Write-Host "CASA School - Pass A Exact Source Inventory V1" -ForegroundColor Green
    Write-Host "READ-ONLY inventory for card handover/activation, attendance exceptions, branch autonomy, calendar, onboarding, renewal and template rendering."
    Write-Host "LOCKED PRODUCT RULE: student photo is NOT a dynamic CASA card field. Any visual/artwork in that area is baked into the CASA-owned front/back template asset."
    Write-Host "No source, DB, migration, AWS, Staging or Production mutation."
    Write-Host ""

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "Repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Verifying exact repository checkpoint"

    $Branch = (& git branch --show-current).Trim()
    $Head = (& git rev-parse --short HEAD).Trim()

    if ($Branch -ne $ExpectedBranch) {
        Fail "Expected branch $ExpectedBranch; found $Branch."
    }
    if ($Head -ne $ExpectedHead) {
        Fail "Expected HEAD $ExpectedHead; found $Head."
    }

    & git merge-base --is-ancestor $RequiredAncestor HEAD
    if ($LASTEXITCODE -ne 0) {
        Fail "HEAD is not descended from required authority $RequiredAncestor."
    }

    $MigrationFiles = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Recurse -File -Filter "migration.sql" |
        Where-Object {
            $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
            $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
        } |
        Sort-Object FullName
    )

    if ($MigrationFiles.Count -ne $ExpectedMigrationCount) {
        Fail "Expected $ExpectedMigrationCount local migrations; found $($MigrationFiles.Count)."
    }

    $ScannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $ScannerCssPath = Join-Path $ProjectRoot "src\app\scanner\scanner.module.css"

    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Fail "Scanner trust-path drift."
    }
    if ((Sha $ScannerCssPath) -ne $ExpectedScannerCssHash) {
        Fail "Scanner camera-first CSS drift."
    }

    Write-Host "  branch/head:        $Branch/$Head"
    Write-Host "  local migrations:   $($MigrationFiles.Count)"
    Write-Host "  scanner trust path: VERIFIED"
    Write-Host "  scanner CSS:        VERIFIED"

    $Evidence = Join-Path $ProjectRoot (".casa-backups\pass-a-exact-source-inventory-v1-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $Evidence -Force | Out-Null

    $Report = New-Object System.Collections.Generic.List[string]
    [void]$Report.Add("CASA PASS A EXACT SOURCE INVENTORY V1")
    [void]$Report.Add("created=$(Get-Date -Format o)")
    [void]$Report.Add("branch=$Branch")
    [void]$Report.Add("HEAD=$Head")
    [void]$Report.Add("required_ancestor=$RequiredAncestor")
    [void]$Report.Add("local_migrations=$($MigrationFiles.Count)")
    [void]$Report.Add("dynamic_student_photo_on_card=FORBIDDEN")
    [void]$Report.Add("card_visual_area=BAKED_INTO_CASA_OWNED_TEMPLATE_ASSET")

    Step "Inventorying exact card lifecycle and activation authority"

    $CardCandidateFiles = @(
        FindSourceFiles @(
            "studentIdentityCardStatusEnum",
            "student_identity_card_status",
            "READY_FOR_ACTIVATION",
            "CARD_ISSUE",
            "CARD_REISSUE",
            "MARKED_LOST",
            "REPLACED",
            "activate card",
            "activateCard",
            "student_card_replacement"
        )
    )

    $CardStatusSignals = [ordered]@{
        readyForActivation = $false
        active = $false
        lost = $false
        replaced = $false
        cardIssue = $false
        cardReissue = $false
        explicitActivateAction = $false
        handoverSignal = $false
    }

    foreach ($F in $CardCandidateFiles) {
        $T = ReadText $F
        if (HasAny $T @("READY_FOR_ACTIVATION")) { $CardStatusSignals.readyForActivation = $true }
        if (HasAny $T @('"ACTIVE"', "'ACTIVE'", "ACTIVE")) { $CardStatusSignals.active = $true }
        if (HasAny $T @("LOST")) { $CardStatusSignals.lost = $true }
        if (HasAny $T @("REPLACED")) { $CardStatusSignals.replaced = $true }
        if (HasAny $T @("CARD_ISSUE")) { $CardStatusSignals.cardIssue = $true }
        if (HasAny $T @("CARD_REISSUE")) { $CardStatusSignals.cardReissue = $true }
        if (HasAny $T @("CARD_ACTIVATE", "activate card", "activateCard", "activateStudentCard")) { $CardStatusSignals.explicitActivateAction = $true }
        if (HasAny $T @("handover", "hand over", "physical handover")) { $CardStatusSignals.handoverSignal = $true }
    }

    foreach ($K in $CardStatusSignals.Keys) {
        Write-Host ("  {0,-28} {1}" -f ($K + ":"), $CardStatusSignals[$K])
    }

    AddSection $Report "CARD_LIFECYCLE_SIGNALS"
    foreach ($K in $CardStatusSignals.Keys) {
        [void]$Report.Add("$K=$($CardStatusSignals[$K])")
    }
    AddSection $Report "CARD_RELEVANT_FILES"
    foreach ($F in $CardCandidateFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying first-card waiting and lost/replacement attendance exceptions"

    $ExceptionCandidateFiles = @(
        FindSourceFiles @(
            "CARD_REPLACEMENT_PENDING",
            "PRESENT_CARD_EXCEPTION",
            "CARD_REPLACEMENT_GRACE_EXPIRED",
            "FACE_EXISTING_PROFILE",
            "CARD_PENDING_HANDOVER",
            "first card",
            "awaiting card",
            "pending handover"
        )
    )

    $ExceptionSignals = [ordered]@{
        replacementPending = $false
        replacementAttendanceException = $false
        firstCardPendingException = $false
        faceExistingProfile = $false
        cardComplianceSeparate = $false
    }

    foreach ($F in $ExceptionCandidateFiles) {
        $T = ReadText $F
        if (HasAny $T @("CARD_REPLACEMENT_PENDING")) { $ExceptionSignals.replacementPending = $true }
        if (HasAny $T @("PRESENT_CARD_EXCEPTION", "student_card_attendance_exceptions")) { $ExceptionSignals.replacementAttendanceException = $true }
        if (HasAny $T @("CARD_PENDING_HANDOVER", "FIRST_CARD_PENDING", "first-card attendance", "awaiting first card")) { $ExceptionSignals.firstCardPendingException = $true }
        if (HasAny $T @("FACE_EXISTING_PROFILE")) { $ExceptionSignals.faceExistingProfile = $true }
        if (HasAny $T @("cardCompliancePercentage", "card compliance")) { $ExceptionSignals.cardComplianceSeparate = $true }
    }

    foreach ($K in $ExceptionSignals.Keys) {
        Write-Host ("  {0,-31} {1}" -f ($K + ":"), $ExceptionSignals[$K])
    }

    AddSection $Report "CARD_EXCEPTION_SIGNALS"
    foreach ($K in $ExceptionSignals.Keys) {
        [void]$Report.Add("$K=$($ExceptionSignals[$K])")
    }
    AddSection $Report "CARD_EXCEPTION_FILES"
    foreach ($F in $ExceptionCandidateFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying progression and card-renewal triggers"

    $RenewalFiles = @(
        FindSourceFiles @(
            "SESSION_CHANGE",
            "CLASS_AND_SESSION_CHANGE",
            "CLASS_CHANGE",
            "student_card_renewal",
            "PROMOTED",
            "RETAINED",
            "TRANSFERRED"
        )
    )

    $RenewalSignals = [ordered]@{
        sessionChange = $false
        classAndSessionChange = $false
        classChange = $false
        retained = $false
        promoted = $false
        autoIssueOrRenderRenewal = $false
    }

    foreach ($F in $RenewalFiles) {
        $T = ReadText $F
        if (HasAny $T @("SESSION_CHANGE")) { $RenewalSignals.sessionChange = $true }
        if (HasAny $T @("CLASS_AND_SESSION_CHANGE")) { $RenewalSignals.classAndSessionChange = $true }
        if (HasAny $T @("CLASS_CHANGE")) { $RenewalSignals.classChange = $true }
        if (HasAny $T @("RETAINED")) { $RenewalSignals.retained = $true }
        if (HasAny $T @("PROMOTED")) { $RenewalSignals.promoted = $true }
        if ((HasAny $T @("renewal")) -and (HasAny $T @("render", "CARD_REISSUE", "productionJob"))) {
            $RenewalSignals.autoIssueOrRenderRenewal = $true
        }
    }

    foreach ($K in $RenewalSignals.Keys) {
        Write-Host ("  {0,-31} {1}" -f ($K + ":"), $RenewalSignals[$K])
    }

    AddSection $Report "RENEWAL_SIGNALS"
    foreach ($K in $RenewalSignals.Keys) {
        [void]$Report.Add("$K=$($RenewalSignals[$K])")
    }
    AddSection $Report "RENEWAL_FILES"
    foreach ($F in $RenewalFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying internal onboarding one-folder gaps"

    $OnboardingFiles = @(
        "src\app\internal\onboarding\onboarding-client.tsx",
        "src\server\internal\onboarding.ts",
        "src\app\api\internal\onboarding\schools\[schoolId]\structure\route.ts",
        "src\app\api\schools\[slug]\registry\students\[studentId]\arrival-method\route.ts"
    )

    $OnboardingText = ""
    foreach ($F in $OnboardingFiles) {
        $OnboardingText += "`n" + (ReadText $F)
    }

    $OnboardingSignals = [ordered]@{
        branchInClient = HasAny (ReadText "src\app\internal\onboarding\onboarding-client.tsx") @("branchId", "Select branch", "Branch")
        arrivalInClient = HasAny (ReadText "src\app\internal\onboarding\onboarding-client.tsx") @("SCHOOL_BUS", "INDEPENDENT", "arrivalMethod", "arrival-method")
        structureApi = Exists "src\app\api\internal\onboarding\schools\[schoolId]\structure\route.ts"
        arrivalApi = Exists "src\app\api\schools\[slug]\registry\students\[studentId]\arrival-method\route.ts"
    }

    foreach ($K in $OnboardingSignals.Keys) {
        Write-Host ("  {0,-25} {1}" -f ($K + ":"), $OnboardingSignals[$K])
    }

    AddSection $Report "ONBOARDING_SIGNALS"
    foreach ($K in $OnboardingSignals.Keys) {
        [void]$Report.Add("$K=$($OnboardingSignals[$K])")
    }
    AddSection $Report "ONBOARDING_TARGET_HASHES"
    foreach ($F in $OnboardingFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying attendance late-entry, session close, suspend/resume and branch scope"

    $AttendanceFiles = @(
        FindSourceFiles @(
            "ATTENDANCE_SESSION_REOPEN",
            "OUTSIDE_WINDOW",
            "requireAttendanceManager",
            "pauseAttendance",
            "resumeAttendance",
            "attendance_lifecycle",
            "branchId",
            "branch_id",
            "early-departure"
        )
    )

    $AttendanceAll = ""
    foreach ($F in $AttendanceFiles) {
        $AttendanceAll += "`n" + (ReadText $F)
    }

    $AttendanceSignals = [ordered]@{
        outsideWindow = HasAny $AttendanceAll @("OUTSIDE_WINDOW")
        sameDayReopen = HasAny $AttendanceAll @("ATTENDANCE_SESSION_REOPEN", "REOPENED", "Reopen today")
        supervisedAfterWindowLate = HasAny $AttendanceAll @("LATE_ARRIVAL_AUTH_REQUIRED", "supervised late arrival", "LATE_ENTRY_AUTH")
        pause = HasAny $AttendanceAll @("pauseAttendance")
        resume = HasAny $AttendanceAll @("resumeAttendance")
        scheduledResume = [bool]($AttendanceAll -match '(?im)\b(resume_at|scheduled_resume|scheduled_resume_at|auto_resume|auto_resume_at|scheduledResume|scheduledResumeAt|autoResume|autoResumeAt)\b')
        branchScopedLifecycleSignal = [bool]($AttendanceAll -match '(?is)attendance[_A-Za-z]*lifecycle[\s\S]{0,1200}\bbranch(Id|_id)\b')
        closeTodayLanguage = HasAny $AttendanceAll @("Close today", "Close Today")
    }

    foreach ($K in $AttendanceSignals.Keys) {
        Write-Host ("  {0,-31} {1}" -f ($K + ":"), $AttendanceSignals[$K])
    }

    AddSection $Report "ATTENDANCE_SIGNALS"
    foreach ($K in $AttendanceSignals.Keys) {
        [void]$Report.Add("$K=$($AttendanceSignals[$K])")
    }

    $AttendanceTargetFiles = @(
        "src\server\attendance\http.ts",
        "src\server\attendance\readiness.ts",
        "src\server\attendance\session-management.ts",
        "src\server\attendance\scan-operation.ts",
        "src\server\attendance\finalize-presence.ts",
        "src\server\attendance\today.ts",
        "src\app\api\schools\[slug]\attendance\lifecycle\route.ts",
        "src\app\api\schools\[slug]\attendance\sessions\today\route.ts",
        "src\app\schools\[slug]\attendance\attendance-client.tsx"
    )

    AddSection $Report "ATTENDANCE_TARGET_HASHES"
    foreach ($F in $AttendanceTargetFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying branch calendar autonomy"

    $CalendarFiles = @(
        FindSourceFiles @(
            "school_calendar_events",
            "calendar-events",
            "branchId",
            "branch_id",
            "HOLIDAY",
            "BREAK",
            "CLOSURE",
            "NON_INSTRUCTIONAL"
        )
    )

    $CalendarAll = ""
    foreach ($F in $CalendarFiles) {
        $CalendarAll += "`n" + (ReadText $F)
    }

    $CalendarSignals = [ordered]@{
        calendarModel = HasAny $CalendarAll @("school_calendar_events", "schoolCalendarEvents")
        branchId = HasAny $CalendarAll @("branchId", "branch_id")
        holiday = HasAny $CalendarAll @("HOLIDAY")
        break = HasAny $CalendarAll @("BREAK")
        closure = HasAny $CalendarAll @("CLOSURE")
        branchAdminSignal = HasAny $CalendarAll @("BRANCH_ADMIN", "branch administrator", "branchAdmin")
        organizationWideSignal = HasAny $CalendarAll @("organization-wide", "all branches", "branchId: null", "branch_id is null")
    }

    foreach ($K in $CalendarSignals.Keys) {
        Write-Host ("  {0,-31} {1}" -f ($K + ":"), $CalendarSignals[$K])
    }

    AddSection $Report "CALENDAR_SIGNALS"
    foreach ($K in $CalendarSignals.Keys) {
        [void]$Report.Add("$K=$($CalendarSignals[$K])")
    }

    AddSection $Report "CALENDAR_FILES"
    foreach ($F in $CalendarFiles) {
        AddFileHash $Report $F
    }

    Step "Inventorying card-template internal UI and text-fitting behavior"

    $TemplateFiles = @(
        FindSourceFiles @(
            "template-assets",
            "student_card_templates",
            "STUDENT_NAME",
            "fontSize",
            "measureText",
            "wrapText",
            "fitText",
            "shrink",
            "frontText",
            "backText"
        )
    )

    $TemplateAll = ""
    foreach ($F in $TemplateFiles) {
        $TemplateAll += "`n" + (ReadText $F)
    }

    $TemplateSignals = [ordered]@{
        templateAssetApi = HasAny $TemplateAll @("/api/internal/card-production/template-assets", "template-assets")
        templateCreateActivateApi = HasAny $TemplateAll @("DRAFT", "ACTIVE", "student_card_templates")
        internalTemplatePage = [bool](@(FindSourceFiles @("/internal/card-production", "Card Template", "Template Manager")).Count -gt 0)
        studentNameField = HasAny $TemplateAll @("STUDENT_NAME")
        dynamicPhotoField = HasAny $TemplateAll @("STUDENT_PHOTO", "studentPhoto", "portrait", "photo source")
        measureText = HasAny $TemplateAll @("measureText")
        wrapOrFit = HasAny $TemplateAll @("wrapText", "fitText", "shrink", "maxLines", "minimumFontSize", "minFontSize")
    }

    foreach ($K in $TemplateSignals.Keys) {
        Write-Host ("  {0,-31} {1}" -f ($K + ":"), $TemplateSignals[$K])
    }

    AddSection $Report "TEMPLATE_SIGNALS"
    foreach ($K in $TemplateSignals.Keys) {
        [void]$Report.Add("$K=$($TemplateSignals[$K])")
    }

    AddSection $Report "TEMPLATE_FILES"
    foreach ($F in $TemplateFiles) {
        AddFileHash $Report $F
    }

    Step "Classifying likely implementation shape"

    $NeedsSchema =
        (-not $CardStatusSignals.readyForActivation) -or
        (-not $AttendanceSignals.scheduledResume) -or
        (-not $AttendanceSignals.supervisedAfterWindowLate) -or
        (-not $ExceptionSignals.firstCardPendingException)

    $NeedsCardLifecycleChange =
        (-not $CardStatusSignals.readyForActivation) -or
        (-not $CardStatusSignals.explicitActivateAction)

    $NeedsOnboardingChange =
        (-not $OnboardingSignals.branchInClient) -or
        (-not $OnboardingSignals.arrivalInClient)

    $NeedsRendererHardening =
        (-not $TemplateSignals.wrapOrFit)

    Write-Host "  likely new migration required:         $NeedsSchema"
    Write-Host "  card lifecycle adjustment required:   $NeedsCardLifecycleChange"
    Write-Host "  onboarding UI adjustment required:    $NeedsOnboardingChange"
    Write-Host "  long-name renderer hardening required:$NeedsRendererHardening"
    Write-Host "  dynamic student photo handling:       FORBIDDEN / NOT PART OF IMPLEMENTATION"

    AddSection $Report "IMPLEMENTATION_CLASSIFICATION"
    [void]$Report.Add("likely_new_migration_required=$NeedsSchema")
    [void]$Report.Add("card_lifecycle_adjustment_required=$NeedsCardLifecycleChange")
    [void]$Report.Add("onboarding_ui_adjustment_required=$NeedsOnboardingChange")
    [void]$Report.Add("renderer_hardening_required=$NeedsRendererHardening")
    [void]$Report.Add("dynamic_student_photo_handling=FORBIDDEN")
    [void]$Report.Add("photo_visual_source=STATIC_TEMPLATE_ASSET_ONLY")

    AddSection $Report "LATEST_MIGRATION"
    $LatestMigration = $MigrationFiles | Select-Object -Last 1
    [void]$Report.Add("path=$(Rel $LatestMigration.FullName)")
    [void]$Report.Add("sha256=$(Sha $LatestMigration.FullName)")

    AddSection $Report "SAFETY"
    [void]$Report.Add("MUTATION=NONE")
    [void]$Report.Add("DB_CONNECTED=NO")
    [void]$Report.Add("AWS_CONNECTED=NO")
    [void]$Report.Add("SCANNER_MUTATED=NO")
    [void]$Report.Add("STAGING_CONNECTED=NO")
    [void]$Report.Add("PRODUCTION_CONNECTED=NO")

    $ReportPath = Join-Path $Evidence "REPORT.txt"
    [System.IO.File]::WriteAllLines($ReportPath, $Report, $Utf8NoBom)

    Write-Host ""
    Write-Host "CASA PASS A EXACT SOURCE INVENTORY V1 IS COMPLETE" -ForegroundColor Green
    Write-Host "  photo rule:                         STATIC TEMPLATE ART ONLY / NO DYNAMIC STUDENT PHOTO"
    Write-Host "  source/DB/migration/AWS mutation:   NONE"
    Write-Host "  scanner trust path:                 UNCHANGED"
    Write-Host "  Staging/Production:                 NOT TOUCHED"
    Write-Host "  report:                             $ReportPath"
    Write-Host ""
    Write-Host "NEXT: paste the complete console output and REPORT.txt. That will be the exact source contract for the guarded Pass A implementation + any required Migration 29." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA Pass A exact-source inventory failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
