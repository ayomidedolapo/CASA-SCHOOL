param(
    [string]$ProjectRoot = "C:\Users\ayomi\Desktop\casa-school"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "main"
$ExpectedHead = "a7aa668"
$RequiredAncestor = "4dedfab"
$AllowedModifiedPath = "src/app/internal/onboarding/onboarding-client.tsx"
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

function Relative([string]$Path) {
    return ($Path.Substring($ProjectRoot.Length)) -replace '^[\\/]+', ''
}

function EnsureParent([string]$Path) {
    $Parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $Parent -PathType Container)) {
        New-Item -ItemType Directory -Path $Parent -Force | Out-Null
    }
}

function CopyRelative(
    [string]$RelativePath,
    [string]$DestinationRoot,
    [System.Collections.Generic.List[string]]$Manifest
) {
    $Source = Join-Path $ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        return
    }

    $Destination = Join-Path $DestinationRoot $RelativePath
    EnsureParent $Destination
    Copy-Item -LiteralPath $Source -Destination $Destination -Force

    [void]$Manifest.Add("$RelativePath|$(Sha $Source)")
}

function CopyTreeFiles(
    [string]$RelativeRoot,
    [string[]]$Includes,
    [string]$DestinationRoot,
    [System.Collections.Generic.List[string]]$Manifest
) {
    $Root = Join-Path $ProjectRoot $RelativeRoot
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        return
    }

    Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $Matched = $false
            foreach ($Pattern in $Includes) {
                if ($_.Name -like $Pattern) {
                    $Matched = $true
                    break
                }
            }
            $Matched
        } |
        Sort-Object FullName |
        ForEach-Object {
            CopyRelative (Relative $_.FullName) $DestinationRoot $Manifest
        }
}

try {
    Write-Host "CASA School - Pass A Exact Source Handoff V1R1" -ForegroundColor Green
    Write-Host "READ-ONLY recovery handoff."
    Write-Host "Allows exactly one known modified tracked file and captures BOTH worktree and HEAD versions + diff."
    Write-Host "No source, DB, migration, AWS, Staging or Production mutation."
    Write-Host ""

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "Repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Verifying repository checkpoint and bounded drift"

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
        Fail "HEAD is not descended from required CASA authority $RequiredAncestor."
    }

    $TrackedStatus = @(& git status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) {
        Fail "Unable to inspect tracked working tree."
    }

    $Unexpected = New-Object System.Collections.Generic.List[string]
    $AllowedSeen = $false

    foreach ($Line in $TrackedStatus) {
        if ([string]::IsNullOrWhiteSpace($Line)) {
            continue
        }

        $PathPart = ""
        if ($Line.Length -ge 4) {
            $PathPart = $Line.Substring(3).Trim()
        }

        # Handle rename syntax conservatively.
        if ($PathPart -like "* -> *") {
            [void]$Unexpected.Add($Line)
            continue
        }

        if ($PathPart -eq $AllowedModifiedPath -and $Line.Substring(0,2) -match "M") {
            $AllowedSeen = $true
            continue
        }

        [void]$Unexpected.Add($Line)
    }

    if ($Unexpected.Count -gt 0) {
        Write-Host ($Unexpected -join [Environment]::NewLine)
        Fail "Tracked drift exists outside the one allowed onboarding client file."
    }

    if (-not $AllowedSeen) {
        Fail "Expected the known modified onboarding client drift, but it is no longer present. Re-run the clean V1 handoff instead."
    }

    $Migrations = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "drizzle") -Recurse -File -Filter "migration.sql" |
        Where-Object {
            $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
            $_.FullName -notmatch '[\\/]\.casa-backups[\\/]'
        } |
        Sort-Object FullName
    )

    if ($Migrations.Count -ne $ExpectedMigrationCount) {
        Fail "Expected $ExpectedMigrationCount local migrations; found $($Migrations.Count)."
    }

    $ScannerPath = Join-Path $ProjectRoot "src\app\scanner\scanner-client.tsx"
    $ScannerCssPath = Join-Path $ProjectRoot "src\app\scanner\scanner.module.css"

    if ((Sha $ScannerPath) -ne $ExpectedScannerHash) {
        Fail "Scanner trust-path drift."
    }

    if ((Sha $ScannerCssPath) -ne $ExpectedScannerCssHash) {
        Fail "Scanner camera-first CSS drift."
    }

    Write-Host "  branch/head:              $Branch/$Head"
    Write-Host "  allowed tracked drift:    $AllowedModifiedPath"
    Write-Host "  other tracked drift:      NONE"
    Write-Host "  local migrations:         $($Migrations.Count)"
    Write-Host "  scanner trust path:       VERIFIED"

    Step "Capturing onboarding drift without resetting it"

    $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Evidence = Join-Path $ProjectRoot (".casa-backups\pass-a-exact-source-handoff-v1r1-" + $Stamp)
    $PackRoot = Join-Path $Evidence "CASA_PASS_A_SOURCE_HANDOFF"
    New-Item -ItemType Directory -Path $PackRoot -Force | Out-Null

    $Manifest = New-Object System.Collections.Generic.List[string]

    $DriftRoot = Join-Path $PackRoot "_ONBOARDING_DRIFT"
    New-Item -ItemType Directory -Path $DriftRoot -Force | Out-Null

    $WorktreePath = Join-Path $ProjectRoot $AllowedModifiedPath
    $WorktreeCopy = Join-Path $DriftRoot "onboarding-client.WORKTREE.tsx"
    Copy-Item -LiteralPath $WorktreePath -Destination $WorktreeCopy -Force

    $HeadCopy = Join-Path $DriftRoot "onboarding-client.HEAD.tsx"
    $HeadContent = (& git show ("HEAD:" + $AllowedModifiedPath))
    if ($LASTEXITCODE -ne 0) {
        Fail "Unable to read HEAD version of $AllowedModifiedPath."
    }
    [System.IO.File]::WriteAllLines($HeadCopy, @($HeadContent), $Utf8NoBom)

    $DiffPath = Join-Path $DriftRoot "onboarding-client.diff"
    $Diff = @(& git diff -- $AllowedModifiedPath)
    if ($LASTEXITCODE -ne 0) {
        Fail "Unable to capture onboarding client diff."
    }
    [System.IO.File]::WriteAllLines($DiffPath, $Diff, $Utf8NoBom)

    [void]$Manifest.Add("_ONBOARDING_DRIFT/onboarding-client.WORKTREE.tsx|$(Sha $WorktreeCopy)")
    [void]$Manifest.Add("_ONBOARDING_DRIFT/onboarding-client.HEAD.tsx|$(Sha $HeadCopy)")
    [void]$Manifest.Add("_ONBOARDING_DRIFT/onboarding-client.diff|$(Sha $DiffPath)")

    Write-Host "  worktree onboarding SHA: $(Sha $WorktreeCopy)"
    Write-Host "  HEAD onboarding SHA:     $(Sha $HeadCopy)"
    Write-Host "  diff captured:           YES"
    Write-Host "  reset/discard performed: NO"

    Step "Packing exact Pass A source surface"

    foreach ($F in @(
        "package.json",
        "package-lock.json",
        "drizzle.config.ts",
        "tsconfig.json",
        "next.config.ts",
        "next.config.mjs"
    )) {
        CopyRelative $F $PackRoot $Manifest
    }

    CopyTreeFiles "src\db\schema" @("*.ts") $PackRoot $Manifest
    CopyTreeFiles "src\server\attendance" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\schools" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\terminal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\schools" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\internal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\internal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\internal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\identity" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\card-production" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\school-operations" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\security" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\auth" @("*.ts","*.tsx") $PackRoot $Manifest

    $RelevantScripts = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "scripts") -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match 'attendance|card|branch|calendar|progression|onboarding|registry|passkey|scanner'
        } |
        Sort-Object Name
    )

    foreach ($File in $RelevantScripts) {
        CopyRelative (Relative $File.FullName) $PackRoot $Manifest
    }

    $LatestMigration = $Migrations | Select-Object -Last 1
    $LatestMigrationDir = Split-Path -Parent $LatestMigration.FullName
    Get-ChildItem -LiteralPath $LatestMigrationDir -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            CopyRelative (Relative $_.FullName) $PackRoot $Manifest
        }

    $MigrationManifestPath = Join-Path $PackRoot "MIGRATIONS_SHA256.txt"
    $MigrationLines = New-Object System.Collections.Generic.List[string]
    foreach ($Migration in $Migrations) {
        [void]$MigrationLines.Add("$(Relative $Migration.FullName)|$(Sha $Migration.FullName)")
    }
    [System.IO.File]::WriteAllLines($MigrationManifestPath, $MigrationLines, $Utf8NoBom)
    [void]$Manifest.Add("MIGRATIONS_SHA256.txt|$(Sha $MigrationManifestPath)")

    $InventoryReport = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot ".casa-backups") -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "pass-a-exact-source-inventory-v1-*" } |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object {
            $Candidate = Join-Path $_.FullName "REPORT.txt"
            if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
                $Candidate
            }
        }
    ) | Select-Object -First 1

    if (-not $InventoryReport) {
        Fail "Latest Pass A inventory REPORT.txt was not found."
    }

    $InventoryDest = Join-Path $PackRoot "PASS_A_INVENTORY_REPORT.txt"
    Copy-Item -LiteralPath $InventoryReport -Destination $InventoryDest -Force
    [void]$Manifest.Add("PASS_A_INVENTORY_REPORT.txt|$(Sha $InventoryDest)")

    $ContractPath = Join-Path $PackRoot "LOCKED_PASS_A_PRODUCT_RULES.txt"
    $Contract = @(
        "CASA PASS A LOCKED PRODUCT RULES",
        "",
        "NO DYNAMIC STUDENT PHOTO:",
        "- No dynamic student photo field on any CASA physical student card.",
        "- CASA must not capture/store/render a student portrait into the card.",
        "- Any image/visual in that area is static artwork baked into the CASA-owned template.",
        "",
        "CARD HANDOVER/ACTIVATION:",
        "- Production success does not make a card Scanner-usable.",
        "- First/replacement/promotion cards enter READY_FOR_ACTIVATION.",
        "- Authorized school/branch physical handover activation makes the new card ACTIVE.",
        "- Lost cards become invalid immediately.",
        "- Promotion/class-change: old card remains usable until new card handover activation; activation atomically makes old card REPLACED.",
        "",
        "CARD RENEWAL:",
        "- New academic session alone does NOT trigger a new physical card.",
        "- RETAINED student keeps existing card.",
        "- Promotion/class change triggers new card.",
        "- Academic Session is not a printed dynamic field that forces annual reissue.",
        "",
        "ATTENDANCE:",
        "- Normal on-time/late scanning remains self-service inside check-in window.",
        "- After check-in close, supervised late entry records true LATE arrival.",
        "- First-card pending handover must support supervised face-based attendance.",
        "- Lost/replacement-card exception remains separate and audited.",
        "",
        "BRANCH AUTONOMY:",
        "- HQ is one branch, not automatic operational authority over other branches.",
        "- Branch Admin manages ordinary attendance/calendar operations for their own branch.",
        "- OWNER/ADMIN retains organization-wide authority.",
        "",
        "SUSPEND/RESUME:",
        "- School Technician does not suspend/resume attendance lifecycle.",
        "- Scheduled resume must be explicit and audited.",
        "",
        "ONBOARDING:",
        "- CASA internal one-student folder includes Branch and SCHOOL_BUS/INDEPENDENT arrival method.",
        "",
        "TEMPLATE:",
        "- CASA internal production manages front/back template assets.",
        "- Long names/classes/school names must fit safely by bounded wrap/shrink.",
        "- No dynamic photo source."
    )
    [System.IO.File]::WriteAllLines($ContractPath, $Contract, $Utf8NoBom)
    [void]$Manifest.Add("LOCKED_PASS_A_PRODUCT_RULES.txt|$(Sha $ContractPath)")

    $AuthorityPath = Join-Path $PackRoot "SOURCE_AUTHORITY.txt"
    $Authority = @(
        "branch=$Branch",
        "HEAD=$Head",
        "required_ancestor=$RequiredAncestor",
        "allowed_modified_path=$AllowedModifiedPath",
        "worktree_onboarding_sha256=$(Sha $WorktreeCopy)",
        "head_onboarding_sha256=$(Sha $HeadCopy)",
        "migration_count=$($Migrations.Count)",
        "latest_migration=$(Relative $LatestMigration.FullName)",
        "latest_migration_sha256=$(Sha $LatestMigration.FullName)",
        "scanner_sha256=$(Sha $ScannerPath)",
        "scanner_css_sha256=$(Sha $ScannerCssPath)",
        "other_tracked_drift=NONE",
        "source_mutation=NO",
        "db_connected=NO",
        "aws_connected=NO",
        "staging_connected=NO",
        "production_connected=NO"
    )
    [System.IO.File]::WriteAllLines($AuthorityPath, $Authority, $Utf8NoBom)
    [void]$Manifest.Add("SOURCE_AUTHORITY.txt|$(Sha $AuthorityPath)")

    $ManifestPath = Join-Path $PackRoot "FILES_SHA256.txt"
    [System.IO.File]::WriteAllLines(
        $ManifestPath,
        ($Manifest | Sort-Object),
        $Utf8NoBom
    )

    $ZipPath = Join-Path $Evidence "CASA_PASS_A_SOURCE_HANDOFF_V1R1.zip"
    if (Test-Path -LiteralPath $ZipPath -PathType Leaf) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    Compress-Archive -LiteralPath $PackRoot -DestinationPath $ZipPath -CompressionLevel Optimal
    $ZipHash = Sha $ZipPath

    Write-Host ""
    Write-Host "CASA PASS A EXACT SOURCE HANDOFF V1R1 IS GREEN" -ForegroundColor Green
    Write-Host "  onboarding drift preserved: YES"
    Write-Host "  reset/discard:               NO"
    Write-Host "  other tracked drift:         NONE"
    Write-Host "  source/DB/AWS mutation:      NONE"
    Write-Host "  Scanner trust path:          UNCHANGED"
    Write-Host "  Staging/Production:          NOT TOUCHED"
    Write-Host "  ZIP:                         $ZipPath"
    Write-Host "  ZIP SHA256:                  $ZipHash"
    Write-Host ""
    Write-Host "NEXT: upload CASA_PASS_A_SOURCE_HANDOFF_V1R1.zip here. I will inspect the current onboarding modification instead of discarding it, then build the guarded Pass A implementation." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA Pass A exact source handoff V1R1 failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
