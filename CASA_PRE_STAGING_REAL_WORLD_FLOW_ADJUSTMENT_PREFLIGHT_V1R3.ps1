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

$PinnedMigrations = [ordered]@{
    "drizzle\20260901081825_attendance-readiness-card-replacement\migration.sql" = "085bff90afedaa894f4eb77e03f2a46b38bc8b410bbbef6bbef4f06d3abd5f3b"
    "drizzle\20260902190300_wave1_transport_casa_internal\migration.sql" = "5bbde238a3a791e488f0dceeab4d98996e57dbe21ac3717cde35b2c25f034aa3"
    "drizzle\20260902201500_wave2_structure_audit\migration.sql" = "96ea98960aed00d4fca194403b54c8b8c6137e1937783b837bb38c980df0334f"
    "drizzle\20260905030000_internal_face_authority\migration.sql" = "cab5de3c1b8bf69d6148b529a1bafcda7860c9037bd17d251ed179c9f9a28dd7"
    "drizzle\20260907043140_attendance-session-reopen\migration.sql" = "881c3d9c742a5eb16e699632d95dd5cdc5321dc07de356d29add6e9b4ce980bd"
    "drizzle\20260907105900_attendance-session-event-stream-multicycle\migration.sql" = "bb708c2702a5165549447b9b91d176ded1a3a03f79ddb37332959a1181fcc0a4"
}

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
        Fail "Required file missing: $Path"
    }

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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
        if (
            $Text.IndexOf(
                $Marker,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        ) {
            return $true
        }
    }

    return $false
}

function FindFiles([string[]]$Patterns) {
    $Found = New-Object System.Collections.Generic.List[string]

    foreach ($RootRelative in @("src", "scripts", "docs")) {
        $Root = Join-Path $ProjectRoot $RootRelative

        if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
            continue
        }

        Get-ChildItem `
            -LiteralPath $Root `
            -Recurse `
            -File `
            -Include *.ts,*.tsx,*.js,*.mjs,*.md `
            -ErrorAction SilentlyContinue |
            ForEach-Object {
                $Text = ""

                try {
                    $Text = [System.IO.File]::ReadAllText($_.FullName)
                }
                catch {
                    return
                }

                foreach ($Pattern in $Patterns) {
                    if (
                        $Text.IndexOf(
                            $Pattern,
                            [System.StringComparison]::OrdinalIgnoreCase
                        ) -ge 0
                    ) {
                        $Relative =
                            ($_.FullName.Substring($ProjectRoot.Length)) `
                            -replace '^[\\/]+', ''

                        if (-not $Found.Contains($Relative)) {
                            [void]$Found.Add($Relative)
                        }

                        break
                    }
                }
            }
    }

    return @($Found.ToArray())
}

try {
    Write-Host "CASA School - Pre-Staging Real-World Flow Adjustment Preflight V1R3" -ForegroundColor Green
    Write-Host "READ-ONLY inspection with branch/HQ coverage."
    Write-Host "No source, DB, migration, AWS, Staging or Production mutation."
    Write-Host ""

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "Repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Verifying exact repository authority"

    $Branch = (& git branch --show-current).Trim()
    $Head = (& git rev-parse --short HEAD).Trim()

    if ($Branch -ne $ExpectedBranch) {
        Fail "Expected branch $ExpectedBranch; found $Branch."
    }

    if ($Head -ne $ExpectedHead) {
        Fail "Expected committed CASA checkpoint $ExpectedHead; found $Head."
    }

    & git merge-base --is-ancestor $RequiredAncestor HEAD

    if ($LASTEXITCODE -ne 0) {
        Fail "Current checkpoint is not descended from required CASA authority $RequiredAncestor."
    }

    $Migrations = @(
        Get-ChildItem `
            -LiteralPath (Join-Path $ProjectRoot "drizzle") `
            -Recurse `
            -File `
            -Filter "migration.sql" |
            Where-Object {
                $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
                $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
            } |
            Sort-Object FullName
    )

    if ($Migrations.Count -ne $ExpectedMigrationCount) {
        Fail "Expected $ExpectedMigrationCount local migrations; found $($Migrations.Count)."
    }

    foreach ($Entry in $PinnedMigrations.GetEnumerator()) {
        if (
            (Sha (Join-Path $ProjectRoot $Entry.Key)) -ne
            $Entry.Value
        ) {
            Fail "Pinned migration drift: $($Entry.Key)"
        }
    }

    $ScannerPath =
        Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"

    $ScannerCssPath =
        Join-Path $ProjectRoot "src\app\scanner\scanner.module.css"

    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Fail "Scanner trust-path drift."
    }

    if ((Sha $ScannerCssPath) -ne $ExpectedScannerCssHash) {
        Fail "Scanner camera-first CSS drift."
    }

    $Evidence =
        Join-Path `
            $ProjectRoot `
            (
                ".casa-backups\pre-staging-real-world-flow-preflight-v1r3-" +
                (Get-Date -Format "yyyyMMdd-HHmmss")
            )

    New-Item -ItemType Directory -Path $Evidence -Force | Out-Null

    Write-Host "  branch/head:             $Branch/$Head"
    Write-Host "  required ancestor:       $RequiredAncestor"
    Write-Host "  local migrations:        $($Migrations.Count)"
    Write-Host "  scanner trust path:      VERIFIED"
    Write-Host "  camera-first CSS:        VERIFIED"

    Step "Reading attendance authority, Pause/Resume, late-arrival and session semantics"

    $Http =
        ReadText "src\server\attendance\http.ts"

    $LifecycleRoute =
        ReadText "src\app\api\schools\[slug]\attendance\lifecycle\route.ts"

    $Readiness =
        ReadText "src\server\attendance\readiness.ts"

    $SessionsRoute =
        ReadText "src\app\api\schools\[slug]\attendance\sessions\today\route.ts"

    $SessionManagement =
        ReadText "src\server\attendance\session-management.ts"

    $AttendanceClient =
        ReadText "src\app\schools\[slug]\attendance\attendance-client.tsx"

    $ScanOperation =
        ReadText "src\server\attendance\scan-operation.ts"

    $TerminalSession =
        ReadText "src\server\attendance\terminal-session.ts"

    $ScanRoute =
        ReadText "src\app\api\terminal\scan\route.ts"

    $ScanAll =
        $ScanOperation +
        "`n" +
        $TerminalSession +
        "`n" +
        $ScanRoute

    $OperatorHasTechnician =
        $Http.Contains("requireAttendanceOperator") -and
        $Http.Contains("SCHOOL_TECHNICIAN")

    $ManagerOwnerAdmin =
        $Http.Contains("requireAttendanceManager") -and
        $Http.Contains('"OWNER"') -and
        $Http.Contains('"ADMIN"')

    $LifecycleManager =
        $LifecycleRoute.Contains("export async function POST") -and
        $LifecycleRoute.Contains("requireAttendanceManager")

    $SessionManager =
        $SessionsRoute.Contains("requireAttendanceManager")

    $PauseBlocksOpen =
        $Readiness.Contains("ATTENDANCE_OPEN_SESSION_MUST_CLOSE") -and
        $Readiness.Contains(
            "Close the currently open attendance session before pausing attendance."
        )

    # Deliberately use whole-token/field-like matching so resumeAttendance
    # does NOT create a false "scheduled resume" signal.
    $ScheduledResume =
        [bool](
            $Readiness -match
            '(?im)\b(resume_at|scheduled_resume|scheduled_resume_at|auto_resume|auto_resume_at|scheduledResume|scheduledResumeAt|autoResume|autoResumeAt)\b'
        )

    $NormalLate =
        HasAny $ScanAll @(
            "classifyCheckIn",
            '"LATE"',
            "'LATE'"
        )

    $OutsideWindow =
        HasAny $ScanAll @(
            "OUTSIDE_WINDOW"
        )

    $LateAuthorization =
        HasAny `
            (
                $ScanAll +
                "`n" +
                $SessionManagement +
                "`n" +
                $AttendanceClient
            ) `
            @(
                "LATE_ARRIVAL_AUTH_REQUIRED",
                "late-arrival",
                "late arrival authorization",
                "LATE_ENTRY_AUTH",
                "supervised late arrival"
            )

    $SameDayReopen =
        HasAny `
            (
                $SessionManagement +
                "`n" +
                $SessionsRoute +
                "`n" +
                $AttendanceClient
            ) `
            @(
                "Reopen today",
                "REOPENED",
                "ATTENDANCE_SESSION_REOPEN"
            )

    Write-Host "  Technician operator/read support:           $OperatorHasTechnician"
    Write-Host "  OWNER/ADMIN manager authority:              $ManagerOwnerAdmin"
    Write-Host "  lifecycle mutations manager-gated:          $LifecycleManager"
    Write-Host "  Today-session mutations manager-gated:      $SessionManager"
    Write-Host "  Pause blocked while a session is OPEN:      $PauseBlocksOpen"
    Write-Host "  scheduled/automatic resume field detected:  $ScheduledResume"
    Write-Host "  normal LATE classification signal:          $NormalLate"
    Write-Host "  OUTSIDE_WINDOW signal:                      $OutsideWindow"
    Write-Host "  supervised after-window late-arrival path:  $LateAuthorization"
    Write-Host "  same-day reopen capability:                 $SameDayReopen"

    Step "Checking whether CASA internal onboarding is truly one student folder"

    $Onboarding =
        ReadText "src\app\internal\onboarding\onboarding-client.tsx"

    $OnboardingStructureRoute =
        ReadText "src\app\api\internal\onboarding\schools\[schoolId]\structure\route.ts"

    $OneFolder = [ordered]@{
        student =
            (HasAny $Onboarding @("firstName", "dateOfBirth", "student"))
        guardian =
            (HasAny $Onboarding @("guardian", "Link guardian"))
        branch =
            (
                HasAny $Onboarding @(
                    "branchId",
                    "branch",
                    "Select branch"
                )
            )
        enrollment =
            (
                HasAny $Onboarding @(
                    "classArm",
                    "enrollment",
                    "Assign class"
                )
            )
        face =
            (
                HasAny $Onboarding @(
                    "Capture Face",
                    "FaceLiveness",
                    "biometric"
                )
            )
        arrival =
            (
                HasAny $Onboarding @(
                    "SCHOOL_BUS",
                    "INDEPENDENT",
                    "arrivalMethod",
                    "arrival-method"
                )
            )
        card =
            (
                HasAny $Onboarding @(
                    "card readiness",
                    "card status",
                    "production",
                    "ID card"
                )
            )
        release =
            (HasAny $Onboarding @("Release", "/lock"))
        nextIncomplete =
            (
                HasAny $Onboarding @(
                    "Next Incomplete",
                    "next incomplete"
                )
            )
        structureApi =
            (
                $OnboardingStructureRoute.Length -gt 0
            )
    }

    foreach ($Key in $OneFolder.Keys) {
        Write-Host (
            "  {0,-18} {1}" -f
            ($Key + ":"),
            $OneFolder[$Key]
        )
    }

    Step "Auditing organization, HQ and branch operating model"

    $BranchesRoute =
        ReadText "src\app\api\schools\[slug]\branches\route.ts"

    $BranchRoute =
        ReadText "src\app\api\schools\[slug]\branches\[branchId]\route.ts"

    $BranchAdminsRoute =
        ReadText "src\app\api\schools\[slug]\branches\[branchId]\admins\route.ts"

    $BranchStructureRoute =
        ReadText "src\app\api\schools\[slug]\branches\[branchId]\structure\route.ts"

    $BranchCorrectionRoute =
        ReadText "src\app\api\schools\[slug]\branches\[branchId]\correction\route.ts"

    $StructureCorrection =
        ReadText "src\server\school-operations\structure-correction.ts"

    $Progression =
        ReadText "src\server\school-operations\progression.ts"

    $TerminalCredential =
        ReadText "src\server\attendance\terminal-credential.ts"

    $BranchModel = [ordered]@{
        branchListCreateRoute =
            ($BranchesRoute.Length -gt 0)
        branchDetailRoute =
            ($BranchRoute.Length -gt 0)
        branchAdminRoute =
            ($BranchAdminsRoute.Length -gt 0)
        branchStructureRoute =
            ($BranchStructureRoute.Length -gt 0)
        branchCorrectionRoute =
            ($BranchCorrectionRoute.Length -gt 0)
        casaInternalStructureRoute =
            ($OnboardingStructureRoute.Length -gt 0)
        organizationAdminGuard =
            (
                HasAny `
                    (
                        $BranchesRoute +
                        "`n" +
                        $BranchRoute +
                        "`n" +
                        $BranchAdminsRoute +
                        "`n" +
                        $BranchStructureRoute
                    ) `
                    @("requireOrganizationAdmin")
            )
        branchAdministratorAssignment =
            (
                HasAny $BranchAdminsRoute @(
                    "assignBranchAdministrator",
                    "listBranchAdministrators"
                )
            )
        hqSemantics =
            (
                HasAny $StructureCorrection @(
                    "headquarters",
                    "HEADQUARTERS",
                    "isHeadquarters",
                    "is_headquarters",
                    "HQ"
                )
            )
        standaloneToBranchSemantics =
            (
                HasAny $StructureCorrection @(
                    "standalone",
                    "Standalone",
                    "convert",
                    "restructure"
                )
            )
        crossBranchTransferGuard =
            (
                HasAny $Progression @(
                    "Cross-branch transfers require organization OWNER or ADMIN authority",
                    "cross-branch"
                )
            )
        onboardingBranchSelection =
            (
                [bool]$OneFolder.branch -and
                $OnboardingStructureRoute.Length -gt 0
            )
        terminalBranchBinding =
            (
                HasAny $TerminalCredential @(
                    "branchId",
                    "branch_id"
                )
            )
    }

    foreach ($Key in $BranchModel.Keys) {
        Write-Host (
            "  {0,-31} {1}" -f
            ($Key + ":"),
            $BranchModel[$Key]
        )
    }

    Step "Checking CASA-team account and WhatsApp operational surfaces"

    $InternalAccess =
        @(
            FindFiles @(
                "casa_internal_memberships",
                "CASA_SUPER_ADMIN",
                "CASA_TEAM"
            )
        )

    $Invite =
        @(
            FindFiles @(
                "Invite CASA",
                "invite team",
                "CASA Team member",
                "internal invitation",
                "internal invite"
            )
        )

    $WhatsApp =
        @(
            FindFiles @(
                "WhatsApp",
                "whatsapp",
                "school_notification_outbox",
                "school_messaging_sender"
            )
        )

    $Provider =
        @(
            FindFiles @(
                "graph.facebook.com",
                "Twilio",
                "WHATSAPP_ACCESS_TOKEN",
                "WHATSAPP_PHONE_NUMBER_ID",
                "sendWhatsApp",
                "dispatchWhatsApp"
            )
        )

    $Worker =
        @(
            FindFiles @(
                "outbox worker",
                "delivery attempt",
                "school_notification_outbox",
                "PROCESSING"
            )
        )

    Write-Host "  internal-access files:       $($InternalAccess.Count)"
    Write-Host "  CASA-team invite UI signals: $($Invite.Count)"
    Write-Host "  WhatsApp/outbox files:       $($WhatsApp.Count)"
    Write-Host "  provider integration files:  $($Provider.Count)"
    Write-Host "  worker/dispatcher files:     $($Worker.Count)"
    Write-Host "  live WhatsApp test:          NOT PERFORMED"

    Step "Writing exact read-only evidence"

    $Report =
        New-Object System.Collections.Generic.List[string]

    [void]$Report.Add(
        "CASA PRE-STAGING REAL-WORLD FLOW ADJUSTMENT PREFLIGHT V1R3"
    )
    [void]$Report.Add("created=$(Get-Date -Format o)")
    [void]$Report.Add("branch=$Branch")
    [void]$Report.Add("HEAD=$Head")
    [void]$Report.Add("required_ancestor=$RequiredAncestor")
    [void]$Report.Add("local_migrations=$($Migrations.Count)")

    [void]$Report.Add("")
    [void]$Report.Add("[ATTENDANCE]")
    [void]$Report.Add(
        "operator_includes_school_technician=$OperatorHasTechnician"
    )
    [void]$Report.Add(
        "manager_owner_admin_only=$ManagerOwnerAdmin"
    )
    [void]$Report.Add(
        "lifecycle_mutations_manager_only=$LifecycleManager"
    )
    [void]$Report.Add(
        "session_mutations_manager_only=$SessionManager"
    )
    [void]$Report.Add(
        "pause_blocks_open_session=$PauseBlocksOpen"
    )
    [void]$Report.Add(
        "scheduled_resume_signal=$ScheduledResume"
    )
    [void]$Report.Add(
        "normal_late_classification=$NormalLate"
    )
    [void]$Report.Add(
        "outside_window=$OutsideWindow"
    )
    [void]$Report.Add(
        "supervised_after_window_late_arrival=$LateAuthorization"
    )
    [void]$Report.Add(
        "same_day_reopen=$SameDayReopen"
    )

    [void]$Report.Add("")
    [void]$Report.Add("[ONBOARDING_ONE_FOLDER]")

    foreach ($Key in $OneFolder.Keys) {
        [void]$Report.Add(
            "$Key=$($OneFolder[$Key])"
        )
    }

    [void]$Report.Add("")
    [void]$Report.Add("[ORGANIZATION_BRANCH_HQ]")

    foreach ($Key in $BranchModel.Keys) {
        [void]$Report.Add(
            "$Key=$($BranchModel[$Key])"
        )
    }

    [void]$Report.Add("")
    [void]$Report.Add("[CASA_INTERNAL]")
    [void]$Report.Add(
        "internal_access_files=$($InternalAccess.Count)"
    )
    [void]$Report.Add(
        "invite_signal_files=$($Invite.Count)"
    )

    foreach ($File in $Invite) {
        [void]$Report.Add(
            "invite_file=$File"
        )
    }

    [void]$Report.Add("")
    [void]$Report.Add("[WHATSAPP]")
    [void]$Report.Add(
        "whatsapp_files=$($WhatsApp.Count)"
    )
    [void]$Report.Add(
        "provider_files=$($Provider.Count)"
    )
    [void]$Report.Add(
        "worker_files=$($Worker.Count)"
    )
    [void]$Report.Add("live_test=NO")

    foreach ($File in $Provider) {
        [void]$Report.Add(
            "provider_file=$File"
        )
    }

    foreach ($File in $Worker) {
        [void]$Report.Add(
            "worker_file=$File"
        )
    }

    $LatestMigration =
        $Migrations |
        Select-Object -Last 1

    $LatestMigrationRelative =
        (
            $LatestMigration.FullName.Substring(
                $ProjectRoot.Length
            )
        ) -replace '^[\\/]+', ''

    [void]$Report.Add("")
    [void]$Report.Add("[LATEST_MIGRATION]")
    [void]$Report.Add(
        "path=$LatestMigrationRelative"
    )
    [void]$Report.Add(
        "sha256=$(Sha $LatestMigration.FullName)"
    )

    [void]$Report.Add("")
    [void]$Report.Add("MUTATION=NONE")
    [void]$Report.Add("DB_CONNECTED=NO")
    [void]$Report.Add("AWS_CONNECTED=NO")
    [void]$Report.Add("STAGING_CONNECTED=NO")
    [void]$Report.Add("PRODUCTION_CONNECTED=NO")

    $ReportPath =
        Join-Path $Evidence "REPORT.txt"

    [System.IO.File]::WriteAllLines(
        $ReportPath,
        $Report,
        $Utf8NoBom
    )

    Write-Host ""
    Write-Host "CASA PRE-STAGING REAL-WORLD FLOW ADJUSTMENT PREFLIGHT V1R3 IS COMPLETE" -ForegroundColor Green
    Write-Host "  source/DB/migration/AWS mutation: NONE"
    Write-Host "  Staging/Production:              NOT TOUCHED"
    Write-Host "  report:                          $ReportPath"
    Write-Host ""
    Write-Host "NEXT: paste the complete console output and REPORT.txt. We will use it to make the final guarded Development adjustment plan before Staging." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA preflight failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
