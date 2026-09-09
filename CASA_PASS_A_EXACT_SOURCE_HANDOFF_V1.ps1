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

function Relative([string]$Path) {
    return ($Path.Substring($ProjectRoot.Length)) -replace '^[\\/]+', ''
}

function EnsureParent([string]$Path) {
    $Parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $Parent -PathType Container)) {
        New-Item -ItemType Directory -Path $Parent -Force | Out-Null
    }
}

function CopyRelative([string]$RelativePath, [string]$DestinationRoot, [System.Collections.Generic.List[string]]$Manifest) {
    $Source = Join-Path $ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        return
    }

    $Destination = Join-Path $DestinationRoot $RelativePath
    EnsureParent $Destination
    Copy-Item -LiteralPath $Source -Destination $Destination -Force

    $Hash = Sha $Source
    [void]$Manifest.Add("$RelativePath|$Hash")
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
            $Match = $false
            foreach ($Pattern in $Includes) {
                if ($_.Name -like $Pattern) {
                    $Match = $true
                    break
                }
            }
            $Match
        } |
        Sort-Object FullName |
        ForEach-Object {
            $RelativePath = Relative $_.FullName
            CopyRelative $RelativePath $DestinationRoot $Manifest
        }
}

try {
    Write-Host "CASA School - Pass A Exact Source Handoff V1" -ForegroundColor Green
    Write-Host "READ-ONLY source handoff pack for guarded Pass A implementation."
    Write-Host "No source, DB, migration, AWS, Staging or Production mutation."
    Write-Host "The only writes are under .casa-backups for the handoff package."
    Write-Host ""

    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        Fail "Repository not found: $ProjectRoot"
    }

    Set-Location $ProjectRoot

    Step "Verifying exact committed checkpoint"

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
        Fail "Unable to inspect Git working tree."
    }
    if ($TrackedStatus.Count -gt 0) {
        Write-Host ($TrackedStatus -join [Environment]::NewLine)
        Fail "Tracked source has uncommitted changes. Refusing to create an ambiguous source handoff."
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

    Write-Host "  branch/head:        $Branch/$Head"
    Write-Host "  tracked tree:       CLEAN"
    Write-Host "  local migrations:   $($Migrations.Count)"
    Write-Host "  scanner trust path: VERIFIED"

    Step "Creating exact source handoff pack"

    $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Evidence = Join-Path $ProjectRoot (".casa-backups\pass-a-exact-source-handoff-v1-" + $Stamp)
    $PackRoot = Join-Path $Evidence "CASA_PASS_A_SOURCE_HANDOFF"
    New-Item -ItemType Directory -Path $PackRoot -Force | Out-Null

    $Manifest = New-Object System.Collections.Generic.List[string]

    # Core package/config files.
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

    # Entire schema is required because Pass A may need one narrowly-scoped Migration 29.
    CopyTreeFiles "src\db\schema" @("*.ts") $PackRoot $Manifest

    # Attendance backend + routes + relevant school frontend.
    CopyTreeFiles "src\server\attendance" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\schools" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\terminal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\schools" @("*.ts","*.tsx") $PackRoot $Manifest

    # Internal onboarding + CASA internal card production UI/routes.
    CopyTreeFiles "src\server\internal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\internal" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\app\api\internal" @("*.ts","*.tsx") $PackRoot $Manifest

    # Card lifecycle/production/renderer.
    CopyTreeFiles "src\server\identity" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\card-production" @("*.ts","*.tsx") $PackRoot $Manifest

    # Branch / calendar / progression operations.
    CopyTreeFiles "src\server\school-operations" @("*.ts","*.tsx") $PackRoot $Manifest

    # Security actions may need a new exact Passkey action.
    CopyTreeFiles "src\server\security" @("*.ts","*.tsx") $PackRoot $Manifest
    CopyTreeFiles "src\server\auth" @("*.ts","*.tsx") $PackRoot $Manifest

    # Relevant focused tests only.
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

    # Current migration 28 + snapshot, and migration listing for immutable-history verification.
    $LatestMigration = $Migrations | Select-Object -Last 1
    $LatestMigrationDir = Split-Path -Parent $LatestMigration.FullName
    Get-ChildItem -LiteralPath $LatestMigrationDir -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            CopyRelative (Relative $_.FullName) $PackRoot $Manifest
        }

    # Add migration hashes without copying all historical SQL into the pack.
    $MigrationManifestPath = Join-Path $PackRoot "MIGRATIONS_SHA256.txt"
    $MigrationLines = New-Object System.Collections.Generic.List[string]
    foreach ($Migration in $Migrations) {
        [void]$MigrationLines.Add("$(Relative $Migration.FullName)|$(Sha $Migration.FullName)")
    }
    [System.IO.File]::WriteAllLines($MigrationManifestPath, $MigrationLines, $Utf8NoBom)
    [void]$Manifest.Add("MIGRATIONS_SHA256.txt|$(Sha $MigrationManifestPath)")

    # Include the latest Pass A inventory report automatically.
    $InventoryReport = @(
        Get-ChildItem -LiteralPath (Join-Path $ProjectRoot ".casa-backups") -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "pass-a-exact-source-inventory-v1-*" } |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object {
            $Candidate = Join-Path $_.FullName "REPORT.txt"
            if (Test-Path -LiteralPath $Candidate -PathType Leaf) { $Candidate }
        }
    ) | Select-Object -First 1

    if (-not $InventoryReport) {
        Fail "Latest Pass A inventory REPORT.txt was not found under .casa-backups."
    }

    $InventoryDest = Join-Path $PackRoot "PASS_A_INVENTORY_REPORT.txt"
    Copy-Item -LiteralPath $InventoryReport -Destination $InventoryDest -Force
    [void]$Manifest.Add("PASS_A_INVENTORY_REPORT.txt|$(Sha $InventoryDest)")

    # Explicit locked product contract.
    $ContractPath = Join-Path $PackRoot "LOCKED_PASS_A_PRODUCT_RULES.txt"
    $Contract = @(
        "CASA PASS A LOCKED PRODUCT RULES",
        "",
        "CARD PHOTO:",
        "- No dynamic student photo field on the physical card.",
        "- CASA must not capture/store/render a student portrait into the card template.",
        "- Any image/visual occupying that area is static artwork baked into the CASA-owned front/back template asset.",
        "",
        "CARD ACTIVATION:",
        "- Produced first/replacement/promotion cards must not become Scanner-usable merely because production succeeded.",
        "- New physical card becomes Scanner-usable only after authorized school/branch handover activation.",
        "- Lost cards become invalid immediately.",
        "- Promotion replacement keeps old card usable until new physical handover activation, then old card becomes REPLACED atomically.",
        "",
        "CARD RENEWAL:",
        "- New academic session alone does not trigger a new physical card.",
        "- RETAINED student keeps current card.",
        "- Promotion/class change triggers new card.",
        "- Academic Session should not be a printed dynamic field that forces annual reissue.",
        "",
        "ATTENDANCE:",
        "- Before check-in close, student can self-check-in and be classified ON_TIME/LATE.",
        "- After check-in close, supervised late entry is required and actual arrival remains LATE.",
        "- First-card pending handover must not create false absence; supervised face-based attendance is allowed.",
        "- Existing lost/replacement-card exception remains separate and audited.",
        "",
        "BRANCH AUTONOMY:",
        "- Branch Admin manages ordinary attendance/calendar operations for their own branch.",
        "- Organization OWNER/ADMIN retains organization-wide authority.",
        "- HQ is a branch, not an automatic authority over all other branches.",
        "",
        "SUSPEND/RESUME:",
        "- School Technician cannot suspend/resume attendance lifecycle.",
        "- Branch Admin may suspend/resume their branch once branch-scoped lifecycle is safely supported.",
        "- OWNER/ADMIN may act organization-wide.",
        "- Scheduled automatic resume must be audited and must not create attendance while suspended.",
        "",
        "ONBOARDING:",
        "- CASA internal one-student folder must expose branch and SCHOOL_BUS/INDEPENDENT arrival method without re-searching the student.",
        "",
        "TEMPLATE:",
        "- Internal CASA production UI manages front/back template assets.",
        "- Long student/school/class names must fit without overflow using bounded shrink/wrap rules.",
        "- No dynamic photo source."
    )
    [System.IO.File]::WriteAllLines($ContractPath, $Contract, $Utf8NoBom)
    [void]$Manifest.Add("LOCKED_PASS_A_PRODUCT_RULES.txt|$(Sha $ContractPath)")

    # Git/source metadata.
    $MetaPath = Join-Path $PackRoot "SOURCE_AUTHORITY.txt"
    $Meta = @(
        "branch=$Branch",
        "HEAD=$Head",
        "required_ancestor=$RequiredAncestor",
        "migration_count=$($Migrations.Count)",
        "latest_migration=$(Relative $LatestMigration.FullName)",
        "latest_migration_sha256=$(Sha $LatestMigration.FullName)",
        "scanner_sha256=$(Sha $ScannerPath)",
        "scanner_css_sha256=$(Sha $ScannerCssPath)",
        "tracked_tree_clean=YES",
        "source_mutation=NO",
        "db_connected=NO",
        "aws_connected=NO",
        "staging_connected=NO",
        "production_connected=NO"
    )
    [System.IO.File]::WriteAllLines($MetaPath, $Meta, $Utf8NoBom)
    [void]$Manifest.Add("SOURCE_AUTHORITY.txt|$(Sha $MetaPath)")

    $ManifestPath = Join-Path $PackRoot "FILES_SHA256.txt"
    [System.IO.File]::WriteAllLines(
        $ManifestPath,
        ($Manifest | Sort-Object),
        $Utf8NoBom
    )

    $ZipPath = Join-Path $Evidence "CASA_PASS_A_SOURCE_HANDOFF_V1.zip"
    if (Test-Path -LiteralPath $ZipPath -PathType Leaf) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    Compress-Archive -LiteralPath $PackRoot -DestinationPath $ZipPath -CompressionLevel Optimal

    $ZipHash = Sha $ZipPath

    Write-Host ""
    Write-Host "CASA PASS A EXACT SOURCE HANDOFF V1 IS GREEN" -ForegroundColor Green
    Write-Host "  source mutation:      NONE"
    Write-Host "  DB/AWS mutation:      NONE"
    Write-Host "  Scanner trust path:   UNCHANGED"
    Write-Host "  Staging/Production:   NOT TOUCHED"
    Write-Host "  files packed:         $($Manifest.Count)"
    Write-Host "  ZIP:                  $ZipPath"
    Write-Host "  ZIP SHA256:           $ZipHash"
    Write-Host ""
    Write-Host "NEXT: upload CASA_PASS_A_SOURCE_HANDOFF_V1.zip to this chat. I will inspect the exact current sources and build the guarded Pass A implementation + Migration 29 only if the source proves it is required." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "CASA Pass A exact source handoff failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
